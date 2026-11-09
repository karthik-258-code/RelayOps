import { createHash } from 'node:crypto';
import { z } from 'zod';
import { reconstructWorkspace } from '@/lib/reconstruction/reconstruct';
import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { withProjectMutation } from '@/lib/server/project-mutation';
import { redactSensitiveData } from '@/lib/security/redact';
import { citationGatedClaimStatus, resolvePersistedCitations } from '@/lib/ingestion/persisted-citations';
import type { Observation, SourceKind, SourceRecord } from '@/lib/domain/types';

const observationSchema = z.object({
  topic: z.string().min(1).max(120),
  category: z.enum(['decision', 'ownership', 'blocker', 'risk', 'next-action']),
  statement: z.string().min(1).max(1000),
  value: z.string().max(300),
  excerpt: z.string().max(4000).optional(),
  evidenceGap: z.boolean().optional(),
  ownerName: z.string().max(160).optional(),
  dueAt: z.string().max(100).optional(),
}).strict();
const sourceSchema = z.object({
  id: z.string().min(1).max(240),
  title: z.string().min(1).max(240),
  url: z.string().url().max(1000).optional(),
  kind: z.enum(['document', 'task', 'discussion', 'repository']),
  occurredAt: z.string().max(100),
  author: z.string().max(160),
  clearance: z.number().int().min(1).max(3),
  content: z.string().max(2_000_000),
  observations: z.array(observationSchema).max(250),
}).strict();
const payloadSchema = z.object({ sources: z.array(sourceSchema).min(1).max(50), names: z.array(z.string().max(240)).max(10).optional() }).strict();
const kindToProvider: Record<SourceKind, 'document' | 'task' | 'manual' | 'github'> = {
  document: 'document', task: 'task', discussion: 'manual', repository: 'github',
};
const statusToDb = { VERIFIED: 'verified', CONFLICT: 'conflict', 'MISSING EVIDENCE': 'missing_evidence' } as const;

export const maxDuration = 300;

function stableUuid(value: string) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function chunkContent(content: string, max = 3000) {
  const chunks: string[] = [];
  let rest = content.trim();
  while (rest.length > max) {
    let end = rest.lastIndexOf('\n', max);
    if (end < Math.floor(max * 0.55)) end = rest.lastIndexOf('. ', max);
    if (end < Math.floor(max * 0.55)) end = max;
    if (rest[end] === '.') end += 1;
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.length ? chunks : [''];
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before connecting project records.');
  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  if (!['lead', 'reviewer'].includes(access.role)) return jsonError(403, 'SOURCE_MANAGER_REQUIRED', 'A project lead or reviewer must connect sources.');

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError(400, 'INVALID_JSON', 'Source upload must be valid JSON.'); }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return jsonError(422, 'INVALID_SOURCE', 'Upload valid Markdown/Notion Markdown, RelayOps JSON, Linear issues, or Slack/Discord export records.');
  const totalPayloadBytes = Buffer.byteLength(JSON.stringify(parsed.data), 'utf8');
  if (totalPayloadBytes > 5_000_000) return jsonError(413, 'SOURCE_BATCH_TOO_LARGE', 'Keep each source under 2 MB and each import batch under 5 MB total, including extracted observations.');

  let privacySources = parsed.data.sources;
  let presidioUsed = false;
  try {
    const extractorUrl = process.env.EXTRACTOR_URL;
    const serviceToken = process.env.EXTRACTOR_SHARED_TOKEN;
    if (extractorUrl && serviceToken) {
      const redactionResponse = await fetch(`${extractorUrl.replace(/\/$/, '')}/redact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RelayOps-Extractor-Key': serviceToken },
        body: JSON.stringify({ sources: parsed.data.sources }),
        signal: AbortSignal.timeout(15_000),
      });
      if (redactionResponse.ok) {
        const redaction = await redactionResponse.json();
        if (Array.isArray(redaction.sources) && redaction.sources.length === parsed.data.sources.length) {
          privacySources = parsed.data.sources.map((source) => {
            const result = redaction.sources.find((item: { id?: string }) => item.id === source.id);
            return result ? { ...source, title: result.title, author: result.author, content: result.content, observations: result.observations } : source;
          });
          presidioUsed = Boolean(redaction.presidio_ready);
        }
      }
    }
  } catch {
    // The deterministic credential/contact scanner below stays active when the optional service is offline.
  }

  const redactedSources = privacySources.map((item) => {
    const content = redactSensitiveData(item.content);
    const observations: Observation[] = item.observations.map((observation) => ({
      ...observation,
      topic: redactSensitiveData(observation.topic),
      statement: redactSensitiveData(observation.statement),
      value: redactSensitiveData(observation.value),
      ...(observation.ownerName ? { ownerName: redactSensitiveData(observation.ownerName) } : {}),
      ...(observation.excerpt ? { excerpt: redactSensitiveData(observation.excerpt) } : {}),
    }));
    const sourceId = stableUuid(`${projectId}:upload:${item.id}`);
    const occurredAt = Number.isNaN(Date.parse(item.occurredAt)) ? null : new Date(item.occurredAt).toISOString();
    return {
      sourceRecord: {
        id: sourceId,
        title: redactSensitiveData(item.title),
        ...(item.url && /^https:\/\//i.test(item.url) ? { url: item.url } : {}),
        kind: item.kind,
        occurredAt: occurredAt ?? '',
        author: redactSensitiveData(item.author || 'Unknown'),
        clearance: Math.min(item.clearance, access.clearance) as 1 | 2 | 3,
        content,
        observations,
      } satisfies SourceRecord,
      provider: kindToProvider[item.kind],
      externalId: `upload:${hash(item.id).slice(0, 32)}`,
      occurredAt,
      contentHash: hash(content),
    };
  });

  // A project mutation lock serializes this import against approval and extraction.
  return withProjectMutation(projectId, async (admin) => {
  const records: SourceRecord[] = [];
  for (const item of redactedSources) {
    const { data: source, error: sourceError } = await admin.from('sources').upsert({
      id: item.sourceRecord.id,
      project_id: projectId,
      provider: item.provider,
      external_id: item.externalId,
      title: item.sourceRecord.title,
      url: item.sourceRecord.url ?? null,
      author: item.sourceRecord.author,
      occurred_at: item.occurredAt,
      clearance: item.sourceRecord.clearance,
      content_hash: item.contentHash,
      metadata: { observations: item.sourceRecord.observations, imported_name: item.sourceRecord.title, relayops_import: true },
    }, { onConflict: 'project_id,provider,external_id' }).select('id').single();
    if (sourceError || !source) return jsonError(503, 'SOURCE_SAVE_FAILED', 'A source could not be saved. The incoming handover is locked until the lead approves the updated version.');

    const { error: deleteError } = await admin.from('source_passages').delete().eq('source_id', source.id);
    if (deleteError) return jsonError(503, 'SOURCE_SAVE_FAILED', 'Old passages could not be refreshed. The incoming handover remains locked.');
    const chunks = chunkContent(item.sourceRecord.content);
    const passages = chunks.map((content, passageIndex) => ({
      id: stableUuid(`${source.id}:passage:${passageIndex}:${hash(content)}`),
      project_id: projectId,
      source_id: source.id,
      passage_index: passageIndex,
      content,
      content_hash: hash(content),
      clearance: item.sourceRecord.clearance,
    }));
    const { error: passageError } = await admin.from('source_passages').insert(passages);
    if (passageError) return jsonError(503, 'SOURCE_SAVE_FAILED', 'Source passages could not be saved. The incoming handover remains locked.');
    records.push({ ...item.sourceRecord, id: source.id });
  }

  const { data: allSourceRows, error: allSourcesError } = await admin.from('sources')
    .select('id,title,url,provider,author,occurred_at,clearance,metadata,source_passages(id,content,clearance)')
    .eq('project_id', projectId);
  if (allSourcesError) return jsonError(503, 'SOURCE_READ_FAILED', 'Saved sources could not be checked. The incoming handover remains locked.');
  const persistedImports: SourceRecord[] = (allSourceRows ?? []).flatMap((row) => {
    const metadata = row.metadata as { observations?: Observation[] };
    if (!metadata.observations?.length) return [];
    return [{
      id: row.id, title: row.title, url: row.url ?? undefined, kind: row.provider === 'github' ? 'repository' : row.provider === 'task' ? 'task' : 'document',
      occurredAt: row.occurred_at ?? '', author: row.author ?? 'Unknown', clearance: row.clearance as 1 | 2 | 3,
      content: (row.source_passages ?? []).map((passage) => passage.content).join('\n\n'), observations: metadata.observations,
    }];
  });
  // Include imported documents only; the seeded sample claims remain governed by their seeded source records.
  const claims = reconstructWorkspace(persistedImports);
  const existingClaimIds = claims.map((claim) => stableUuid(`${projectId}:claim:${claim.topic}`));
  if (existingClaimIds.length) {
    const { error: deleteCitationsError } = await admin.from('citations').delete().eq('project_id', projectId).in('claim_id', existingClaimIds);
    if (deleteCitationsError) return jsonError(503, 'EXTRACTION_SAVE_FAILED', 'Existing citations could not be refreshed. The incoming handover remains locked.');
  }
  for (const claim of claims) {
    const claimId = stableUuid(`${projectId}:claim:${claim.topic}`);
    const citationExcerpts = resolvePersistedCitations(
      claim.citations.map((citation) => ({ sourceId: citation.sourceId, excerpt: citation.excerpt })),
      (allSourceRows ?? []).flatMap((row) => (row.source_passages ?? []).map((passage) => ({ id: passage.id, sourceId: row.id, content: passage.content }))),
    );
    const { data: oldClaim } = await admin.from('claims').select('version,statement,status,clearance').eq('id', claimId).maybeSingle();
    const claimStatus = citationGatedClaimStatus(statusToDb[claim.status], citationExcerpts);
    const { error: claimError } = await admin.from('claims').upsert({
      id: claimId, project_id: projectId, title: claim.topic.replaceAll('-', ' '), category: claim.category,
      statement: claim.statement, status: claimStatus,
      owner_name: claim.ownerName ?? null, due_at: claim.dueAt ?? null,
      confidence: citationExcerpts.length ? 0.55 : null, clearance: claim.clearance,
      version: oldClaim ? oldClaim.version + (oldClaim.statement === claim.statement && oldClaim.status === claimStatus && oldClaim.clearance === claim.clearance ? 0 : 1) : 1,
    }, { onConflict: 'id' });
    if (claimError) return jsonError(503, 'EXTRACTION_SAVE_FAILED', 'A finding could not be stored. The incoming handover remains locked.');

    const citationRows = citationExcerpts.map((citation) => ({ id: stableUuid(`${claimId}:${citation.passageId}:${citation.quote}`), project_id: projectId, claim_id: claimId, passage_id: citation.passageId, quote: citation.quote, start_offset: citation.startOffset, end_offset: citation.endOffset, relation: claim.status === 'CONFLICT' ? 'context' as const : 'supports' as const }));
    if (citationRows.length) {
      const { error: citationsError } = await admin.from('citations').upsert(citationRows, { onConflict: 'id' });
      if (citationsError) return jsonError(503, 'CITATION_SAVE_FAILED', 'An evidence citation did not match a saved passage. The incoming handover remains locked.');
    }
  }
  const privacyStatus = presidioUsed ? 'Presidio and secret scanning ran before storage.' : 'Credential and contact scanning ran; start the extractor to enable Presidio analysis.';
  const partialNotes = parsed.data.names?.filter((name) => name.startsWith('Partial import:')) ?? [];
  return Response.json({ imported: records.length, findings: claims.length, extractionMode: 'deterministic', message: `${records.length} source${records.length === 1 ? '' : 's'} saved. ${claims.length} evidence-backed finding${claims.length === 1 ? '' : 's'} ready for reconstruction and review. ${privacyStatus}${partialNotes.length ? ` ${partialNotes.join(' ')}` : ''}` }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  });
}

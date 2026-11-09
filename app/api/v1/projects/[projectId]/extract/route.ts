import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { withProjectMutation } from '@/lib/server/project-mutation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { matchesCodePointCitation } from '@/lib/ingestion/persisted-citations';

export const maxDuration = 300;

const resultSchema = z.object({
  extraction_mode: z.literal('nebius'),
  model: z.string(),
  rejected_fact_count: z.number().int().nonnegative(),
  embedding_model: z.string().nullable(),
  redacted_passages: z.record(z.string(), z.string()),
  embeddings: z.record(z.string(), z.array(z.number().finite())),
  claims: z.array(z.object({
    topic: z.string().min(1).max(120),
    title: z.string().min(1).max(240),
    category: z.enum(['decision', 'ownership', 'blocker', 'risk', 'next-action']),
    statement: z.string().min(1).max(1000),
    status: z.enum(['verified', 'conflict', 'missing_evidence']),
    confidence: z.number().min(0).max(1),
    clearance: z.number().int().min(1).max(3),
    owner_name: z.string().max(160).nullable(),
    due_at: z.string().max(100).nullable(),
    citations: z.array(z.object({
      passage_id: z.uuid(), quote: z.string().min(1).max(1000),
      start_offset: z.number().int().nonnegative(), end_offset: z.number().int().positive(),
      clearance: z.number().int().min(1).max(3), relation: z.enum(['supports', 'contradicts', 'context']),
    }).passthrough()).min(1),
  }).strict()),
  entities: z.array(z.object({ id: z.uuid(), canonical_name: z.string().min(1).max(240), entity_type: z.string().min(1).max(40), clearance: z.number().int().min(1).max(3) })),
  edges: z.array(z.object({ id: z.uuid(), from_entity_id: z.uuid(), to_entity_id: z.uuid(), relation: z.string().min(1).max(80), valid_from: z.string(), valid_to: z.string().nullable(), source_passage_id: z.uuid(), confidence: z.number().min(0).max(1), clearance: z.number().int().min(1).max(3) })),
  notices: z.array(z.string().max(500)),
}).strict();

function stableUuid(value: string) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }

export async function POST(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before running AI extraction.');
  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  if (!['lead', 'reviewer'].includes(access.role)) return jsonError(403, 'REVIEWER_REQUIRED', 'A project lead or reviewer must run extraction.');
  if (!process.env.NEBIUS_API_KEY?.trim()) return jsonError(503, 'NEBIUS_NOT_CONFIGURED', 'Add NEBIUS_API_KEY to the root .env.local file, then restart Next.js and the extractor.');
  const extractorUrl = process.env.EXTRACTOR_URL;
  const sharedToken = process.env.EXTRACTOR_SHARED_TOKEN;
  if (!extractorUrl || !sharedToken) return jsonError(503, 'EXTRACTOR_NOT_CONFIGURED', 'Local extractor settings are missing. Run scripts/setup-local-env.ps1.');

  const admin = createSupabaseAdminClient();
  let { data: sources, error: sourceError } = await admin.from('sources')
    .select('id,title,url,provider,author,occurred_at,clearance')
    .eq('project_id', projectId).lte('clearance', access.clearance).contains('metadata', { relayops_import: true });
  if (sourceError) return jsonError(503, 'DATABASE_UNAVAILABLE', 'Imported evidence could not be loaded for extraction.');
  if (!sources?.length) return jsonError(409, 'NO_IMPORTED_SOURCES', 'Connect or upload project records before running extraction.');
  let { data: passages, error: passageError } = await admin.from('source_passages')
    .select('id,source_id,passage_index,content,clearance')
    .eq('project_id', projectId).in('source_id', sources.map((source) => source.id)).lte('clearance', access.clearance).order('passage_index');
  if (passageError || !passages?.length) return jsonError(409, 'NO_STORED_PASSAGES', 'This project has no stored source passages to extract.');

  const healthResponse = await fetch(`${extractorUrl.replace(/\/$/, '')}/health`, { cache: 'no-store', signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (!healthResponse?.ok) return jsonError(503, 'EXTRACTOR_OFFLINE', 'Start the local extractor with services/extractor/scripts/start.ps1, then retry.');
  const health = await healthResponse.json();
  if (!health.model_configured) return jsonError(503, 'NEBIUS_NOT_CONFIGURED', 'Add NEBIUS_API_KEY to the root .env.local file, then restart Next.js and the extractor.');

  // Lock the project for this long-running extraction so approval cannot snapshot a partial write.
  return withProjectMutation(projectId, async (admin) => {
  // Re-read after acquiring the lock: an import may have completed between preflight and lock acquisition.
  const freshSources = await admin.from('sources')
    .select('id,title,url,provider,author,occurred_at,clearance')
    .eq('project_id', projectId).lte('clearance', access.clearance).contains('metadata', { relayops_import: true });
  if (freshSources.error) return jsonError(503, 'DATABASE_UNAVAILABLE', 'Imported evidence could not be reloaded for extraction.');
  sources = freshSources.data ?? [];
  if (!sources.length) return jsonError(409, 'NO_IMPORTED_SOURCES', 'Connect or upload project records before running extraction.');
  const freshPassages = await admin.from('source_passages')
    .select('id,source_id,passage_index,content,clearance')
    .eq('project_id', projectId).in('source_id', sources.map((source) => source.id)).lte('clearance', access.clearance).order('passage_index');
  if (freshPassages.error || !freshPassages.data?.length) return jsonError(409, 'NO_STORED_PASSAGES', 'This project has no stored source passages to extract.');
  passages = freshPassages.data;

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const requestPayload = {
    project_id: projectId,
    passages: passages.map((passage) => {
      const source = sourceById.get(passage.source_id)!;
      return {
        passage_id: passage.id, source_id: source.id, source_title: source.title,
        provider: source.provider, url: source.url, author: source.author,
        occurred_at: source.occurred_at, clearance: Math.max(source.clearance, passage.clearance),
        content: passage.content,
      };
    }),
  };
  let extractorResponse: Response;
  try {
    extractorResponse = await fetch(`${extractorUrl.replace(/\/$/, '')}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RelayOps-Extractor-Key': sharedToken },
      body: JSON.stringify(requestPayload),
      signal: AbortSignal.timeout(240_000),
      cache: 'no-store',
    });
  } catch {
    return jsonError(502, 'EXTRACTOR_UNAVAILABLE', 'The extractor stopped responding. Source evidence is saved, but this revision needs review before handover.');
  }
  if (!extractorResponse.ok) {
    const failure = await extractorResponse.json().catch(() => ({}));
    const detail = typeof failure.detail === 'string' ? failure.detail : 'Nebius extraction failed. Source evidence remains saved.';
    return jsonError(extractorResponse.status === 429 ? 429 : extractorResponse.status >= 500 ? 502 : extractorResponse.status, 'EXTRACTION_FAILED', detail);
  }
  const rawResult: unknown = await extractorResponse.json();
  const parsed = resultSchema.safeParse(rawResult);
  if (!parsed.success) return jsonError(502, 'INVALID_EXTRACTOR_RESPONSE', 'The extractor returned an unsupported response; no model claims were saved.');
  const result = parsed.data;
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));
  const authorizedClaims = result.claims.flatMap((claim) => {
    const resolvedCitations = claim.citations.flatMap((citation) => {
      const passage = passageById.get(citation.passage_id);
      const redactedContent = result.redacted_passages[citation.passage_id];
      const source = passage ? sourceById.get(passage.source_id) : null;
      if (!passage || !source || !redactedContent) return [];
      if (!matchesCodePointCitation(redactedContent, citation.quote, citation.start_offset, citation.end_offset)) return [];
      return [{ ...citation, clearance: Math.max(source.clearance, passage.clearance) }];
    });
    if (!resolvedCitations.length || resolvedCitations.length !== claim.citations.length) return [];
    return [{ ...claim, clearance: Math.max(...resolvedCitations.map((citation) => citation.clearance)), citations: resolvedCitations }];
  });

  // Store the same Presidio-redacted text that citations and embeddings were derived from.
  for (const passage of passages) {
    const redactedContent = result.redacted_passages[passage.id];
    if (typeof redactedContent !== 'string') return jsonError(502, 'INVALID_EXTRACTOR_RESPONSE', 'A redacted source passage was missing. No model claims were saved.');
    if (redactedContent !== passage.content) {
      const { error } = await admin.from('source_passages').update({ content: redactedContent, content_hash: sha256(redactedContent) }).eq('id', passage.id).eq('project_id', projectId);
      if (error) return jsonError(503, 'PRIVACY_SAVE_FAILED', 'Presidio-redacted source text could not be persisted.');
    }
  }
  for (const source of sources) {
    const redactedContent = passages.filter((passage) => passage.source_id === source.id).map((passage) => result.redacted_passages[passage.id]).join('\n\n');
    const { error } = await admin.from('sources').update({ content_hash: sha256(redactedContent) }).eq('id', source.id).eq('project_id', projectId);
    if (error) return jsonError(503, 'PRIVACY_SAVE_FAILED', 'The redacted source hash could not be saved.');
  }

  const claimIds = authorizedClaims.map((claim) => stableUuid(`${projectId}:claim:${claim.topic}`));
  const oldClaims = claimIds.length ? await admin.from('claims').select('id,version,statement,status,clearance').eq('project_id', projectId).in('id', claimIds) : { data: [], error: null };
  if (oldClaims.error) return jsonError(503, 'DATABASE_UNAVAILABLE', 'Existing review state could not be loaded.');
  const oldCitationRows = claimIds.length ? await admin.from('citations').select('claim_id,passage_id,quote,relation').eq('project_id', projectId).in('claim_id', claimIds) : { data: [], error: null };
  if (oldCitationRows.error) return jsonError(503, 'DATABASE_UNAVAILABLE', 'Existing citations could not be loaded.');
  if (claimIds.length) {
    const { error } = await admin.from('citations').delete().eq('project_id', projectId).in('claim_id', claimIds);
    if (error) return jsonError(503, 'CITATION_SAVE_FAILED', 'Old citations could not be replaced safely.');
  }

  const extractionRunId = randomUUID();
  for (const claim of authorizedClaims) {
    const claimId = stableUuid(`${projectId}:claim:${claim.topic}`);
    const oldClaim = oldClaims.data?.find((item) => item.id === claimId);
    const newCitationSignature = claim.citations.map((item) => `${item.passage_id}:${item.quote}:${item.relation}`).sort().join('|');
    const oldCitationSignature = (oldCitationRows.data ?? []).filter((item) => item.claim_id === claimId).map((item) => `${item.passage_id}:${item.quote}:${item.relation}`).sort().join('|');
    const changed = !oldClaim || oldClaim.statement !== claim.statement || oldClaim.status !== claim.status || oldClaim.clearance !== claim.clearance || oldCitationSignature !== newCitationSignature;
    const { error: claimError } = await admin.from('claims').upsert({
      id: claimId, project_id: projectId, title: claim.title, category: claim.category,
      statement: claim.statement, status: claim.status, confidence: claim.confidence,
      clearance: claim.clearance, owner_name: claim.owner_name, due_at: claim.due_at,
      extraction_run_id: extractionRunId, version: oldClaim ? oldClaim.version + (changed ? 1 : 0) : 1,
    }, { onConflict: 'id' });
    if (claimError) return jsonError(503, 'CLAIM_SAVE_FAILED', 'A validated claim could not be written to PostgreSQL.');
    const rows = claim.citations.map((citation) => ({
      id: stableUuid(`${claimId}:${citation.passage_id}:${citation.quote}`), project_id: projectId,
      claim_id: claimId, passage_id: citation.passage_id, quote: citation.quote,
      start_offset: citation.start_offset, end_offset: citation.end_offset, relation: citation.relation,
    }));
    const { error: citationsError } = await admin.from('citations').upsert(rows, { onConflict: 'id' });
    if (citationsError) return jsonError(503, 'CITATION_SAVE_FAILED', 'A source quote did not pass PostgreSQL citation validation.');
  }

  if (result.entities.length) {
    const entities = result.entities.filter((entity) => entity.clearance <= access.clearance).map((entity) => ({ ...entity, project_id: projectId }));
    if (entities.length) {
      const { error } = await admin.from('entities').upsert(entities, { onConflict: 'project_id,canonical_name,entity_type' });
      if (error) return jsonError(503, 'GRAPH_SAVE_FAILED', 'Extracted entities could not be saved.');
    }
  }
  const passageIds = passages.map((passage) => passage.id);
  const { error: deleteError } = await admin.from('entity_edges').delete().eq('project_id', projectId).in('source_passage_id', passageIds);
  if (deleteError) return jsonError(503, 'GRAPH_SAVE_FAILED', 'Old temporal relationships could not be refreshed.');
  if (result.edges.length) {
    const edges = result.edges.filter((edge) => edge.clearance <= access.clearance && passageById.has(edge.source_passage_id)).map((edge) => ({ ...edge, project_id: projectId }));
    if (edges.length) {
      const { error } = await admin.from('entity_edges').upsert(edges, { onConflict: 'id' });
      if (error) return jsonError(503, 'GRAPH_SAVE_FAILED', 'Temporal relationships could not be saved.');
    }
  }

  for (const [passageId, vector] of Object.entries(result.embeddings)) {
    if (!passageById.has(passageId) || vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) continue;
    const { error } = await admin.from('source_passages').update({ embedding: `[${vector.join(',')}]`, embedding_model: result.embedding_model }).eq('id', passageId).eq('project_id', projectId);
    if (error) return jsonError(503, 'EMBEDDING_SAVE_FAILED', 'Generated vectors could not be saved to pgvector.');
  }

  return Response.json({
    extractionMode: 'nebius', model: result.model, findings: authorizedClaims.length,
    rejectedFacts: result.rejected_fact_count, embeddingCount: Object.keys(result.embeddings).length,
    notices: result.notices,
    message: `Nebius checked ${passages.length} stored passage${passages.length === 1 ? '' : 's'} and produced ${authorizedClaims.length} citation-verified finding${authorizedClaims.length === 1 ? '' : 's'}. Human review is still required.`,
  }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  });
}

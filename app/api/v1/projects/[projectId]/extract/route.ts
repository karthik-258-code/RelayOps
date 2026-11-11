import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildExtractionBatches, buildExtractorRequest, createExtractionBudget, MAX_EXTRACTION_OPERATION_MS, MAX_EXTRACTOR_BATCH_MS, splitExtractionBatch } from '@/lib/extraction/request';
import { mergeExtractionResults } from '@/lib/extraction/merge';
import { matchExtractedClaimsToExistingFindings } from '@/lib/extraction/deduplicate';
import { reconcileExtractedEntities } from '@/lib/extraction/entities';
import { createBatchProgressReporter, type ExtractionCompletionSummary, type ExtractionProgressEvent, type ExtractionTerminalEvent } from '@/lib/extraction/progress';
import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { createExtractionProgressStream } from '@/lib/server/extraction-progress-stream';
import { waitForExtractorHealth } from '@/lib/server/extractor-health';
import { withProjectMutation } from '@/lib/server/project-mutation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { matchesCodePointCitation } from '@/lib/ingestion/persisted-citations';
import { chunkValues } from '@/lib/utils/chunk-values';

export const maxDuration = 600;

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

type ExtractionResult = z.infer<typeof resultSchema>;
type BatchAttempt = { results: ExtractionResult[]; error?: never } | { results?: never; error: Response };
type BatchProgressReporter = ReturnType<typeof createBatchProgressReporter>;
type ExtractionBudget = ReturnType<typeof createExtractionBudget>;

async function extractBatch(
  batch: Array<{ id: string }>,
  projectId: string,
  clearance: 1 | 2 | 3,
  extractorUrl: string,
  sharedToken: string,
  batchProgress: BatchProgressReporter,
  extractionBudget: ExtractionBudget,
): Promise<BatchAttempt> {
  const requestTimeoutMs = extractionBudget.nextRequestTimeoutMs(MAX_EXTRACTOR_BATCH_MS);
  if (requestTimeoutMs === null) {
    return { error: jsonError(504, 'EXTRACTION_DEADLINE_EXCEEDED', 'The extraction reached its request time limit. Saved sources and completed findings remain available; narrow the source set and retry.') };
  }
  const batchNumber = batchProgress.snapshot().completed + 1;
  const batchTotal = batchProgress.snapshot().total;
  batchProgress.start(`Sending extraction batch ${batchNumber} of ${batchTotal} to Nebius.`);
  const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${extractorUrl.replace(/\/$/, '')}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RelayOps-Extractor-Key': sharedToken },
      body: JSON.stringify(buildExtractorRequest(projectId, clearance, batch.map((passage) => passage.id))),
      signal: timeoutSignal,
      cache: 'no-store',
    });
  } catch {
    const timedOut = timeoutSignal.aborted;
    const code = timedOut ? 'EXTRACTION_BATCH_TIMEOUT' : 'EXTRACTOR_UNAVAILABLE';
    const message = timedOut
      ? `Nebius did not finish batch ${batchNumber} of ${batchTotal} within the available run time. No findings from this attempt were saved; source evidence and earlier findings remain available. Reduce the source set and retry.`
      : `The extractor connection ended during batch ${batchNumber} of ${batchTotal}. No findings from this attempt were saved; source evidence and earlier findings remain available. Check extractor health before retrying.`;
    return { error: jsonError(timedOut ? 504 : 502, code, message) };
  }

  if (response.status === 504) {
    const smallerBatches = splitExtractionBatch(batch);
    if (smallerBatches) {
      console.warn('Nebius extraction batch timed out; retrying with smaller passage groups.', { passageCount: batch.length });
      batchProgress.split(smallerBatches.length, `A slow batch is being split into ${smallerBatches.length} smaller requests.`);
      const results: ExtractionResult[] = [];
      for (const smallerBatch of smallerBatches) {
        const attempt = await extractBatch(smallerBatch, projectId, clearance, extractorUrl, sharedToken, batchProgress, extractionBudget);
        if (attempt.error) return attempt;
        results.push(...attempt.results);
      }
      return { results };
    }
  }

  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const detail = typeof failure.detail === 'string' ? failure.detail : 'Nebius extraction failed. Source evidence remains saved.';
    return { error: jsonError(response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status, 'EXTRACTION_FAILED', detail) };
  }

  const parsed = resultSchema.safeParse(await response.json());
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((issue) => ({
      code: issue.code,
      path: issue.path.filter((part): part is string => typeof part === 'string').slice(0, 6),
    }));
    console.error('Extractor response failed validation:', issues);
    const field = issues[0]?.path.join('.') || 'response';
    return { error: jsonError(502, 'INVALID_EXTRACTOR_RESPONSE', `The extractor response failed validation at ${field}; no model claims were saved.`) };
  }
  const completedBatch = batchProgress.snapshot().completed + 1;
  batchProgress.complete(`Completed extraction batch ${completedBatch} of ${batchProgress.snapshot().total}.`);
  return { results: [parsed.data] };
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before running AI extraction.');
  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  if (!['lead', 'reviewer'].includes(access.role)) return jsonError(403, 'REVIEWER_REQUIRED', 'A project lead or reviewer must run extraction.');
  if (!process.env.NEBIUS_API_KEY?.trim()) return jsonError(503, 'NEBIUS_NOT_CONFIGURED', 'Configure NEBIUS_API_KEY for the web and extractor services, then restart or redeploy both.');
  const extractorUrl = process.env.EXTRACTOR_URL;
  const sharedToken = process.env.EXTRACTOR_SHARED_TOKEN;
  if (!extractorUrl || !sharedToken) return jsonError(503, 'EXTRACTOR_NOT_CONFIGURED', 'Local extractor settings are missing. Run scripts/setup-local-env.ps1.');

  const performExtraction = async (report?: (event: ExtractionProgressEvent) => void): Promise<Response> => {
  const extractionBudget = createExtractionBudget(MAX_EXTRACTION_OPERATION_MS);
  const emit = report ?? (() => {});
  emit({ type: 'progress', stage: 'preparing', message: 'Preparing imported evidence for extraction.' });
  emit({ type: 'progress', stage: 'loading_evidence', message: 'Loading saved source passages for this project.' });
  const admin = createSupabaseAdminClient();
  let { data: sources, error: sourceError } = await admin.from('sources')
    .select('id,title,url,provider,author,occurred_at,clearance')
    .eq('project_id', projectId).lte('clearance', access.clearance).contains('metadata', { relayops_import: true });
  if (sourceError) return jsonError(503, 'DATABASE_UNAVAILABLE', 'Imported evidence could not be loaded for extraction.');
  if (!sources?.length) return jsonError(409, 'NO_IMPORTED_SOURCES', 'Connect or upload project records before running extraction.');
  emit({ type: 'progress', stage: 'checking_extractor', message: 'Checking Nebius extractor readiness.' });
  const healthUrl = `${extractorUrl.replace(/\/$/, '')}/health`;
  const healthPromise = waitForExtractorHealth(
    () => fetch(healthUrl, { cache: 'no-store', signal: AbortSignal.timeout(5_000) }),
  );
  let { data: passages, error: passageError } = await admin.from('source_passages')
    .select('id,source_id,passage_index,content,clearance')
    .eq('project_id', projectId).in('source_id', sources.map((source) => source.id)).lte('clearance', access.clearance).order('passage_index');
  if (passageError || !passages?.length) return jsonError(409, 'NO_STORED_PASSAGES', 'This project has no stored source passages to extract.');

  const healthResponse = await healthPromise;
  if (!healthResponse) return jsonError(503, 'EXTRACTOR_OFFLINE', 'The extractor did not become healthy after several retries. Check its Render status and logs, then retry.');
  const health = await healthResponse.json();
  if (!health.model_configured) return jsonError(503, 'NEBIUS_NOT_CONFIGURED', 'Configure NEBIUS_API_KEY on the extractor service, then restart or redeploy it.');

  // Lock the project for this long-running extraction so approval cannot snapshot a partial write.
  return withProjectMutation(projectId, async (admin) => {
  emit({ type: 'progress', stage: 'loading_evidence', message: 'Reloading saved passages under the project lock.' });
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
  let extractionBatches: Array<typeof passages[number]>[];
  try { extractionBatches = buildExtractionBatches(passages); }
  catch { return jsonError(413, 'EXTRACTION_BATCH_TOO_LARGE', 'A stored passage exceeds the extraction size limit. Narrow the source set and retry.'); }
  const batchResults: ExtractionResult[] = [];
  const batchProgress = createBatchProgressReporter(extractionBatches.length, emit);
  for (const batch of extractionBatches) {
    const attempt = await extractBatch(batch, projectId, access.clearance, extractorUrl, sharedToken, batchProgress, extractionBudget);
    if (attempt.error) return attempt.error;
    batchResults.push(...attempt.results);
  }
  const result = mergeExtractionResults(batchResults);
  emit({ type: 'progress', stage: 'validating_citations', message: 'Checking every model quote against its stored passage.' });
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

  emit({ type: 'progress', stage: 'saving_findings', message: 'Saving privacy-filtered evidence and validated findings.' });
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

  const existingClaims = await admin.from('claims')
    .select('id,category,statement,clearance,extraction_run_id')
    .eq('project_id', projectId);
  if (existingClaims.error) return jsonError(503, 'DATABASE_UNAVAILABLE', 'Existing findings could not be loaded.');
  const existingClaimIds = (existingClaims.data ?? []).map((claim) => claim.id);
  const existingCitationResults = await Promise.all(chunkValues(existingClaimIds, 50).map((ids) => admin.from('citations')
    .select('claim_id,passage_id,quote')
    .eq('project_id', projectId)
    .in('claim_id', ids)));
  if (existingCitationResults.some((result) => result.error)) return jsonError(503, 'DATABASE_UNAVAILABLE', 'Existing evidence links could not be loaded.');
  const existingClaimIdByTopic = matchExtractedClaimsToExistingFindings(
    authorizedClaims,
    existingClaims.data ?? [],
    existingCitationResults.flatMap((result) => result.data ?? []),
  );
  const storageIdByTopic = (claim: ExtractionResult['claims'][number]) =>
    existingClaimIdByTopic.get(claim.topic) ?? stableUuid(`${projectId}:claim:${claim.topic}`);
  const claimIds = authorizedClaims.map(storageIdByTopic);
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
    const claimId = storageIdByTopic(claim);
    const oldClaim = oldClaims.data?.find((item) => item.id === claimId);
    const newCitationSignature = claim.citations.map((item) => `${item.passage_id}:${item.quote}:${item.relation}`).sort().join('|');
    const oldCitationSignature = (oldCitationRows.data ?? []).filter((item) => item.claim_id === claimId).map((item) => `${item.passage_id}:${item.quote}:${item.relation}`).sort().join('|');
    const changed = !oldClaim || oldClaim.statement !== claim.statement || oldClaim.status !== claim.status || oldClaim.clearance !== claim.clearance || oldCitationSignature !== newCitationSignature;
    const { error: claimError } = await admin.from('claims').upsert({
      id: claimId, project_id: projectId, title: claim.title, category: claim.category,
      statement: claim.statement, status: claim.status, confidence: claim.confidence,
      clearance: claim.clearance, owner_name: claim.owner_name, due_at: claim.due_at,
      extraction_run_id: extractionRunId,
      version: oldClaim ? oldClaim.version + (changed ? 1 : 0) : 1,
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

  const extractedEntities = result.entities.filter((entity) => entity.clearance <= access.clearance);
  const storedEntities = await admin.from('entities')
    .select('id,canonical_name,entity_type,clearance')
    .eq('project_id', projectId);
  if (storedEntities.error) return jsonError(503, 'GRAPH_SAVE_FAILED', 'Existing graph entities could not be loaded.');
  const entityResolution = reconcileExtractedEntities(extractedEntities, storedEntities.data ?? []);
  for (const update of entityResolution.clearanceUpdates) {
    const { error } = await admin.from('entities').update({ clearance: update.clearance }).eq('id', update.id).eq('project_id', projectId);
    if (error) return jsonError(503, 'GRAPH_SAVE_FAILED', 'Existing entity clearance could not be refreshed.');
  }
  if (entityResolution.entitiesToInsert.length) {
    const { error } = await admin.from('entities').insert(entityResolution.entitiesToInsert.map((entity) => ({ ...entity, project_id: projectId })));
    if (error) return jsonError(503, 'GRAPH_SAVE_FAILED', 'Extracted entities could not be saved.');
  }
  const passageIds = passages.map((passage) => passage.id);
  for (const passageIdBatch of chunkValues(passageIds, 50)) {
    const { error: deleteError } = await admin.from('entity_edges').delete().eq('project_id', projectId).in('source_passage_id', passageIdBatch);
    if (deleteError) {
      console.error('Entity-edge refresh failed:', { code: deleteError.code, message: deleteError.message });
      return jsonError(503, 'GRAPH_SAVE_FAILED', 'Old temporal relationships could not be refreshed.');
    }
  }
  if (result.edges.length) {
    const edges = result.edges.flatMap((edge) => {
      if (edge.clearance > access.clearance || !passageById.has(edge.source_passage_id)) return [];
      const fromEntityId = entityResolution.incomingToStoredId.get(edge.from_entity_id);
      const toEntityId = entityResolution.incomingToStoredId.get(edge.to_entity_id);
      if (!fromEntityId || !toEntityId) return [];
      return [{ ...edge, from_entity_id: fromEntityId, to_entity_id: toEntityId, project_id: projectId }];
    });
    if (edges.length) {
      const { error } = await admin.from('entity_edges').upsert(edges, { onConflict: 'id' });
      if (error) return jsonError(503, 'GRAPH_SAVE_FAILED', 'Temporal relationships could not be saved.');
    }
  }

  emit({ type: 'progress', stage: 'saving_embeddings', message: Object.keys(result.embeddings).length
    ? 'Saving passage embeddings for evidence search.'
    : 'No passage embeddings were returned; finishing the saved findings.' });
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
  };

  if (request.headers.get('accept')?.toLowerCase().includes('text/event-stream')) {
    return createExtractionProgressStream(async (report) => {
      const response = await performExtraction(report);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const failure = body?.error && typeof body.error === 'object' ? body.error as { code?: unknown; message?: unknown } : {};
        const code = typeof failure.code === 'string' ? failure.code : 'EXTRACTION_FAILED';
        const message = typeof failure.message === 'string' ? failure.message : 'Nebius extraction failed. Imported source records remain available for review.';
        report({ type: 'progress', stage: 'failed', message });
        return { type: 'failed', error: { code, message } } satisfies ExtractionTerminalEvent;
      }
      const body = await response.json() as {
        message: string; notices: string[]; findings: number; rejectedFacts: number; embeddingCount: number; model: string;
      };
      report({ type: 'progress', stage: 'completed', message: 'Extraction and evidence checks are complete.' });
      const result: ExtractionCompletionSummary = {
        message: body.message, notices: body.notices, findings: body.findings,
        rejectedFacts: body.rejectedFacts, embeddingCount: body.embeddingCount, model: body.model,
      };
      return { type: 'completed', result } satisfies ExtractionTerminalEvent;
    });
  }

  return performExtraction();
}

import { z } from 'zod';
import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Claim, ClaimCategory, ClaimReview, EvidenceStatus, HandoverState, SourceKind, SourceRecord } from '@/lib/domain/types';

const projectIdSchema = z.uuid();
const statusMap: Record<string, EvidenceStatus> = {
  verified: 'VERIFIED', conflict: 'CONFLICT', missing_evidence: 'MISSING EVIDENCE',
  needs_review: 'MISSING EVIDENCE', rejected: 'MISSING EVIDENCE',
};
const dispositionMap: Record<string, ClaimReview['disposition']> = {
  pending: 'pending', confirmed: 'confirmed', resolved: 'resolved',
  accepted_uncertainty: 'accepted-uncertainty', rejected: 'rejected',
};
const kindMap: Record<string, SourceKind> = { document: 'document', task: 'task', github: 'repository', manual: 'discussion' };

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before opening a project.');
  const { projectId } = await context.params;
  if (!projectIdSchema.safeParse(projectId).success) return jsonError(400, 'INVALID_PROJECT_ID', 'Project identifier is invalid.');
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');

  const admin = createSupabaseAdminClient();
  const [projectResult, sourceResult, claimResult, snapshotResult, receiptResult] = await Promise.all([
    admin.from('projects').select('id,name,description,slug,revision').eq('id', projectId).single(),
    admin.from('sources').select('id,provider,external_id,title,url,author,occurred_at,clearance,metadata').eq('project_id', projectId).lte('clearance', access.clearance).order('occurred_at', { ascending: true }),
    admin.from('claims').select('id,title,category,statement,status,confidence,clearance,version,extraction_run_id').eq('project_id', projectId).lte('clearance', access.clearance).order('created_at', { ascending: true }),
    admin.from('approved_snapshots').select('id,version,created_at,content').eq('project_id', projectId).order('version', { ascending: false }).limit(1).maybeSingle(),
    admin.from('receipt_acknowledgements').select('snapshot_id,acknowledged_at').eq('project_id', projectId).eq('acknowledged_by', user.id).order('acknowledged_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (projectResult.error || sourceResult.error || claimResult.error || snapshotResult.error || receiptResult.error) {
    return jsonError(503, 'DATABASE_UNAVAILABLE', 'RelayOps could not load the project. Check the local database and retry.');
  }
  const project = projectResult.data;
  const currentSnapshot = snapshotResult.data?.version === project.revision ? snapshotResult.data : null;
  if (access.role === 'contributor' && !currentSnapshot) {
    const waitingState: HandoverState = { schemaVersion: 1, sources: [], claims: [], reviews: {}, importedNames: [] };
    return Response.json({ project: { id: project.id, name: project.name, description: project.description, slug: project.slug, revision: project.revision }, access, state: waitingState, snapshotId: null, snapshotVersion: null, claimVersions: {}, handoverReady: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const sources = sourceResult.data ?? [];
  const claims = claimResult.data ?? [];
  const sourceIds = sources.map((source) => source.id);
  const claimIds = claims.map((claim) => claim.id);
  const [passageResult, citationResult, reviewResult] = await Promise.all([
    sourceIds.length ? admin.from('source_passages').select('id,source_id,content,clearance').eq('project_id', projectId).in('source_id', sourceIds).lte('clearance', access.clearance) : Promise.resolve({ data: [], error: null }),
    claimIds.length ? admin.from('citations').select('id,claim_id,passage_id,quote,relation').eq('project_id', projectId).in('claim_id', claimIds) : Promise.resolve({ data: [], error: null }),
    claimIds.length ? admin.from('review_decisions').select('id,claim_id,decision,edited_statement,note,claim_version,created_at').eq('project_id', projectId).in('claim_id', claimIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (passageResult.error || citationResult.error || reviewResult.error) return jsonError(503, 'DATABASE_UNAVAILABLE', 'RelayOps could not load source evidence. Retry in a moment.');

  const passages = passageResult.data ?? [];
  const passageById = new Map(passages.map((passage) => [passage.id, passage]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const sourceRecords: SourceRecord[] = sources.map((source) => {
    const sourcePassages = passages.filter((passage) => passage.source_id === source.id);
    return {
      id: source.id,
      title: source.title,
      ...(source.url ? { url: source.url } : {}),
      kind: kindMap[source.provider] ?? 'document',
      occurredAt: source.occurred_at ?? '',
      author: source.author ?? 'Unknown',
      clearance: source.clearance as 1 | 2 | 3,
      content: sourcePassages.map((passage) => passage.content).join('\n\n'),
      observations: [],
    };
  });
  const citationRows = citationResult.data ?? [];
  const domainClaims: Claim[] = claims.map((claim) => {
    const citations = citationRows.filter((citation) => citation.claim_id === claim.id).flatMap((citation) => {
      const passage = passageById.get(citation.passage_id);
      const source = passage ? sourceById.get(passage.source_id) : null;
      if (!passage || !source) return [];
      return [{
        sourceId: source.id,
        sourceTitle: source.title,
        sourceKind: kindMap[source.provider] ?? 'document',
        ...(source.url ? { sourceUrl: source.url } : {}),
        occurredAt: source.occurred_at ?? '',
        author: source.author ?? 'Unknown',
        excerpt: citation.quote,
        clearance: Math.max(source.clearance, passage.clearance) as 1 | 2 | 3,
      }];
    });
    return {
      id: claim.id,
      topic: claim.title,
      category: claim.category as ClaimCategory,
      statement: claim.statement,
      status: statusMap[claim.status] ?? 'MISSING EVIDENCE',
      citations,
      clearance: claim.clearance as 1 | 2 | 3,
      alternatives: citations.map((citation) => citation.excerpt),
    };
  });
  const reviews: Record<string, ClaimReview> = Object.fromEntries(domainClaims.map((claim) => [claim.id, { disposition: 'pending' }]));
  for (const row of reviewResult.data ?? []) {
    const currentVersion = claims.find((claim) => claim.id === row.claim_id)?.version;
    if (currentVersion !== row.claim_version) continue;
    if (reviews[row.claim_id]?.disposition !== 'pending') continue;
    reviews[row.claim_id] = {
      disposition: dispositionMap[row.decision] ?? 'pending',
      ...(row.edited_statement ? { editedStatement: row.edited_statement } : {}),
      ...(row.note ? { note: row.note } : {}),
    };
  }

  const approvedSnapshot = currentSnapshot;
  const currentReceipt = approvedSnapshot && receiptResult.data?.snapshot_id === approvedSnapshot.id ? receiptResult.data : null;

  const state: HandoverState = {
    schemaVersion: 1,
    sources: sourceRecords,
    claims: domainClaims,
    reviews,
    ...(approvedSnapshot ? { approvedAt: approvedSnapshot.created_at } : {}),
    ...(currentReceipt ? { acknowledgedAt: currentReceipt.acknowledged_at } : {}),
    importedNames: sources.filter((source) => (source.metadata as Record<string, unknown>).relayops_import === true).map((source) => source.title),
  };
  const extractionMode = claims.some((claim) => claim.extraction_run_id) ? 'gemini' : 'deterministic';
  return Response.json({ project: { id: project.id, name: project.name, description: project.description, slug: project.slug, revision: project.revision }, access, state, snapshotId: approvedSnapshot?.id ?? null, snapshotVersion: approvedSnapshot?.version ?? null, claimVersions: Object.fromEntries(claims.map((claim) => [claim.id, claim.version])), handoverReady: Boolean(approvedSnapshot), extractionMode }, { headers: { 'Cache-Control': 'no-store' } });
}

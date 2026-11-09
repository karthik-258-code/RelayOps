import { z } from 'zod';
import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const payloadSchema = z.object({
  claimId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  disposition: z.enum(['pending', 'confirmed', 'resolved', 'accepted-uncertainty', 'rejected']),
  editedStatement: z.string().max(5000).optional(),
  note: z.string().max(2000).optional(),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before saving a review decision.');
  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  if (!['lead', 'reviewer'].includes(access.role)) return jsonError(403, 'REVIEWER_REQUIRED', 'A project lead or reviewer must record this decision.');

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError(400, 'INVALID_JSON', 'Review request must be valid JSON.'); }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return jsonError(422, 'INVALID_REVIEW', 'Review decision is incomplete or contains unsupported values.');
  const { claimId, expectedVersion, disposition, editedStatement, note } = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('record_review_decision', {
    target_project_id: projectId,
    target_claim_id: claimId,
    actor_id: user.id,
    expected_version: expectedVersion,
    target_decision: disposition.replace('-', '_'),
    target_edited_statement: editedStatement ?? null,
    target_note: note ?? '',
  });
  if (error) {
    if (error.code === '40001') return jsonError(409, 'STALE_REVIEW', error.message);
    if (error.code === '55P03') return jsonError(409, 'PROJECT_UPDATE_IN_PROGRESS', error.message);
    if (error.code === '42501') return jsonError(403, 'REVIEWER_REQUIRED', error.message);
    if (error.code === '22023') return jsonError(422, 'INVALID_REVIEW', error.message);
    return jsonError(503, 'REVIEW_SAVE_FAILED', 'Review decision could not be saved. Reload the project and retry.');
  }
  return Response.json({ decisionId: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

import { z } from 'zod';
import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const bodySchema = z.object({ snapshotId: z.uuid() }).strict();

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before acknowledging a handover.');
  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError(400, 'INVALID_JSON', 'Receipt request must be valid JSON.'); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError(422, 'INVALID_RECEIPT', 'Choose the approved snapshot before acknowledging it.');
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('acknowledge_snapshot', {
    target_project_id: projectId,
    target_snapshot_id: parsed.data.snapshotId,
    actor_id: user.id,
  });
  if (error) {
    if (error.code === '42501') return jsonError(403, 'PROJECT_MEMBERSHIP_REQUIRED', error.message);
    if (error.code === 'P0002') return jsonError(404, 'SNAPSHOT_NOT_FOUND', error.message);
    return jsonError(503, 'RECEIPT_FAILED', 'Receipt could not be saved. Reload the handover and retry.');
  }
  return Response.json({ acknowledgementId: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

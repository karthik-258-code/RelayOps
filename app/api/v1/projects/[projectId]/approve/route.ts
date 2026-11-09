import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before approving a handover.');
  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  if (access.role !== 'lead') return jsonError(403, 'PROJECT_LEAD_REQUIRED', 'Only the project lead can approve this handover.');
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('approve_project', { target_project_id: projectId, actor_id: user.id });
  if (error) {
    if (error.code === '23514') return jsonError(409, 'REVIEW_INCOMPLETE', error.message);
    if (error.code === '55P03') return jsonError(409, 'PROJECT_UPDATE_IN_PROGRESS', error.message);
    if (error.code === '42501') return jsonError(403, 'PROJECT_LEAD_REQUIRED', error.message);
    return jsonError(503, 'APPROVAL_FAILED', 'RelayOps could not create the approved snapshot. Review the project and retry.');
  }
  return Response.json({ snapshotId: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { persistSourceBatch } from '@/lib/server/persist-source-batch';

export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before connecting project records.');
  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  if (!['lead', 'reviewer'].includes(access.role)) return jsonError(403, 'SOURCE_MANAGER_REQUIRED', 'A project lead or reviewer must connect sources.');

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError(400, 'INVALID_JSON', 'Source upload must be valid JSON.'); }
  return persistSourceBatch(projectId, access.clearance, raw);
}

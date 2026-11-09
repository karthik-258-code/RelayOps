import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/server/access';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function withProjectMutation(
  projectId: string,
  work: (admin: SupabaseClient) => Promise<Response>,
): Promise<Response> {
  const coordinator = createSupabaseAdminClient();
  const mutationToken = randomUUID();
  const { error: beginError } = await coordinator.rpc('begin_project_mutation', {
    target_project_id: projectId,
    target_mutation_token: mutationToken,
  });
  if (beginError) {
    if (beginError.code === '55P03') return jsonError(409, 'PROJECT_UPDATE_IN_PROGRESS', 'Another project update is still running. Wait for it to finish before starting another change.');
    if (beginError.code === 'P0002') return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available.');
    return jsonError(503, 'PROJECT_UPDATE_UNAVAILABLE', 'RelayOps could not start a safe project update. Please retry.');
  }

  const controller = new AbortController();
  const mutationAdmin = createSupabaseAdminClient(controller.signal, mutationToken);
  let leaseLost = false;
  let heartbeatRequest: Promise<void> | null = null;
  const heartbeatTimer = setInterval(() => {
    if (heartbeatRequest) return;
    heartbeatRequest = Promise.resolve(coordinator.rpc('heartbeat_project_mutation', {
      target_project_id: projectId,
      target_mutation_token: mutationToken,
    })).then(({ error }) => {
      if (error) {
        leaseLost = true;
        controller.abort();
      }
    }).catch(() => {
      leaseLost = true;
      controller.abort();
    }).finally(() => { heartbeatRequest = null; });
  }, 30_000);
  heartbeatTimer.unref?.();

  let response: Response;
  try {
    response = await work(mutationAdmin);
  } catch {
    response = jsonError(500, 'PROJECT_UPDATE_FAILED', 'The project update did not finish. The incoming handover remains locked until review.');
  }

  clearInterval(heartbeatTimer);
  if (heartbeatRequest) await heartbeatRequest;
  const { error: finishError } = await coordinator.rpc('finish_project_mutation', {
    target_project_id: projectId,
    target_mutation_token: mutationToken,
  });
  if (finishError) return jsonError(503, 'PROJECT_UPDATE_LOCKED', 'The update saved, but its safety lock could not be cleared. Ask the project lead to retry before approving.');
  if (leaseLost) return jsonError(503, 'PROJECT_UPDATE_LEASE_LOST', 'RelayOps lost the update lease and stopped the write. Review the current records and retry the import or extraction.');
  return response;
}

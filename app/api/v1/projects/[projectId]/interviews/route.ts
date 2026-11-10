import { z } from 'zod';
import { interviewPromptFor } from '@/lib/domain/interview-prompts';
import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { withProjectMutation } from '@/lib/server/project-mutation';
import { redactSensitiveData } from '@/lib/security/redact';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const bodySchema = z.object({
  claimId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  response: z.string().trim().min(1).max(4000),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before recording an exit interview answer.');

  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  if (!['lead', 'reviewer'].includes(access.role)) {
    return jsonError(403, 'REVIEWER_REQUIRED', 'A project lead or reviewer must capture exit interview evidence.');
  }

  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError(400, 'INVALID_JSON', 'Interview response must be valid JSON.'); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError(422, 'INVALID_INTERVIEW', 'Add a response of up to 4,000 characters for the selected finding.');

  const admin = createSupabaseAdminClient();
  const { data: claim, error: claimError } = await admin.from('claims')
    .select('id,category,status,clearance')
    .eq('id', parsed.data.claimId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (claimError) return jsonError(503, 'INTERVIEW_LOAD_FAILED', 'RelayOps could not load this finding. Reload and retry.');
  if (!claim || claim.clearance > access.clearance) return jsonError(404, 'CLAIM_NOT_FOUND', 'This finding is not available to your account.');
  if (claim.status !== 'missing_evidence') return jsonError(422, 'NOT_AN_EVIDENCE_GAP', 'Exit interview prompts are available for missing-evidence findings.');

  const responseText = redactSensitiveData(parsed.data.response).trim();
  if (!responseText) return jsonError(422, 'EMPTY_INTERVIEW', 'The response contains no safe text to save.');
  const prompt = interviewPromptFor(claim.category as Parameters<typeof interviewPromptFor>[0]);

  return withProjectMutation(projectId, async (mutationAdmin) => {
    const { data: sourceId, error } = await mutationAdmin.rpc('record_exit_interview_response', {
      target_project_id: projectId,
      target_claim_id: claim.id,
      actor_id: user.id,
      expected_version: parsed.data.expectedVersion,
      target_prompt: prompt,
      target_response: responseText,
    });
    if (error) {
      if (error.code === '40001') return jsonError(409, 'STALE_INTERVIEW', 'This finding changed while you were recording. Reload it and submit the response again.');
      if (error.code === '55P03') return jsonError(409, 'PROJECT_UPDATE_IN_PROGRESS', 'Another project update is running. Wait, reload, and retry.');
      if (error.code === '42501') return jsonError(403, 'REVIEWER_REQUIRED', 'A reviewer with access to this finding must capture the response.');
      if (error.code === '22023') return jsonError(422, 'INVALID_INTERVIEW', 'This response cannot be attached to the selected finding. Reload and retry.');
      return jsonError(503, 'INTERVIEW_SAVE_FAILED', 'RelayOps could not save this answer. No reviewer decision was made; reload and retry.');
    }
    return Response.json({ sourceId, message: 'Answer saved as cited context. A reviewer must still decide what belongs in the handover.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  });
}

import { z } from 'zod';
import { getProjectAccess, jsonError, requireUser } from '@/lib/server/access';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const searchSchema = z.object({ query: z.string().trim().min(3).max(1000) }).strict();
const embeddingSchema = z.object({ embedding: z.array(z.number().finite()).length(768) }).passthrough();

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in before searching project evidence.');
  const { projectId } = await context.params;
  const access = await getProjectAccess(user.id, projectId);
  if (!access) return jsonError(404, 'PROJECT_NOT_FOUND', 'This project is not available to your account.');
  const parsed = searchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'INVALID_SEARCH', 'Enter a search of 3 to 1,000 characters.');

  const extractorUrl = process.env.EXTRACTOR_URL;
  const sharedToken = process.env.EXTRACTOR_SHARED_TOKEN;
  if (!process.env.NEBIUS_API_KEY?.trim() || !extractorUrl || !sharedToken) {
    return jsonError(503, 'VECTOR_SEARCH_NOT_CONFIGURED', 'Evidence search needs NEBIUS_API_KEY and a configured extractor service.');
  }
  let response: Response;
  try {
    response = await fetch(`${extractorUrl.replace(/\/$/, '')}/embed-query`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RelayOps-Extractor-Key': sharedToken },
      body: JSON.stringify({ query: parsed.data.query }), signal: AbortSignal.timeout(20_000), cache: 'no-store',
    });
  } catch {
    return jsonError(503, 'EXTRACTOR_OFFLINE', 'Check that the configured extractor service is healthy, then retry evidence search.');
  }
  if (!response.ok) return jsonError(502, 'QUERY_EMBEDDING_FAILED', 'Nebius could not prepare this evidence search.');
  const embedding = embeddingSchema.safeParse(await response.json().catch(() => null));
  if (!embedding.success) return jsonError(502, 'INVALID_QUERY_EMBEDDING', 'The extractor returned an invalid search vector.');

  // Invoke the SECURITY INVOKER RPC with the signed-in user's JWT so source and passage RLS still applies.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('match_project_passages', {
    target_project_id: projectId,
    query_embedding: `[${embedding.data.embedding.join(',')}]`,
    max_clearance: access.clearance,
    result_limit: 8,
  });
  if (error) return jsonError(503, 'SEARCH_UNAVAILABLE', 'The database could not search stored evidence.');
  return Response.json({ results: data ?? [], model: 'pgvector cosine similarity' }, { headers: { 'Cache-Control': 'no-store' } });
}

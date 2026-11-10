import { z } from 'zod';
import { hasValidExtractorKey } from '@/lib/server/internal-extractor-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const requestSchema = z.object({
  project_id: z.uuid(),
  clearance: z.number().int().min(1).max(3),
  passage_ids: z.array(z.uuid()).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
}).strict();

export async function POST(request: Request) {
  if (!hasValidExtractorKey(request.headers.get('x-relayops-extractor-key'), process.env.EXTRACTOR_SHARED_TOKEN)) {
    return Response.json({ error: 'Internal service authentication failed.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Passage request must be valid JSON.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Passage request is invalid.' }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  }

  const { project_id: projectId, clearance, passage_ids: passageIds } = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data: passageRows, error: passageError } = await admin.from('source_passages')
    .select('id,source_id,passage_index,content,clearance')
    .eq('project_id', projectId)
    .in('id', passageIds)
    .lte('clearance', clearance);
  if (passageError) return Response.json({ error: 'Stored passages could not be loaded.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (!passageRows || passageRows.length !== passageIds.length) {
    return Response.json({ error: 'One or more requested passages are unavailable at this clearance.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const sourceIds = [...new Set(passageRows.map((passage) => passage.source_id))];
  const { data: sourceRows, error: sourceError } = await admin.from('sources')
    .select('id,title,url,provider,author,occurred_at,clearance')
    .eq('project_id', projectId)
    .in('id', sourceIds)
    .lte('clearance', clearance);
  if (sourceError) return Response.json({ error: 'Passage source metadata could not be loaded.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (!sourceRows || sourceRows.length !== sourceIds.length) {
    return Response.json({ error: 'One or more requested source records are unavailable at this clearance.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const sources = new Map(sourceRows.map((source) => [source.id, source]));
  const passages = passageRows.map((passage) => {
    const source = sources.get(passage.source_id)!;
    return {
      passage_id: passage.id,
      source_id: source.id,
      source_title: source.title,
      provider: source.provider,
      url: source.url,
      author: source.author,
      occurred_at: source.occurred_at,
      clearance: Math.max(source.clearance, passage.clearance),
      content: passage.content,
    };
  });
  return Response.json({ passages }, { headers: { 'Cache-Control': 'no-store' } });
}

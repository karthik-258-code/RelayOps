import { getExtractorHealthStatus } from '@/lib/server/extractor-health';
import { jsonError, requireUser } from '@/lib/server/access';

const healthHeaders = { 'Cache-Control': 'no-store' };

export async function GET() {
  const user = await requireUser();
  if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Sign in to check extractor health.');

  const extractorUrl = process.env.EXTRACTOR_URL;
  if (!extractorUrl) {
    return Response.json({ status: 'unreachable', modelConfigured: false }, { headers: healthHeaders });
  }

  try {
    const response = await fetch(`${extractorUrl.replace(/\/$/, '')}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    const status = await getExtractorHealthStatus(response);
    return Response.json({ status, modelConfigured: status === 'ready' }, { headers: healthHeaders });
  } catch {
    return Response.json({ status: 'unreachable', modelConfigured: false }, { headers: healthHeaders });
  }
}

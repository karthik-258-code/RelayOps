type ExtractorHealthOptions = {
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type ExtractorHealthStatus = 'ready' | 'missing_key' | 'unreachable';

export async function getExtractorHealthStatus(response: Response): Promise<ExtractorHealthStatus> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (!response.ok || contentType !== 'application/json') return 'unreachable';

  try {
    const payload: unknown = await response.clone().json();
    if (!payload || typeof payload !== 'object' || !('status' in payload) || payload.status !== 'ok') return 'unreachable';
    return 'model_configured' in payload && payload.model_configured === true ? 'ready' : 'missing_key';
  } catch {
    return 'unreachable';
  }
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForExtractorHealth(
  check: () => Promise<Response>,
  { attempts = 9, delayMs = 5_000, sleep = pause }: ExtractorHealthOptions = {},
): Promise<Response | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await check();
      if (await getExtractorHealthStatus(response) !== 'unreachable') return response;
    } catch {
      // A free Render service can take about a minute to wake after inactivity.
    }
    if (attempt < attempts - 1) await sleep(delayMs);
  }
  return null;
}

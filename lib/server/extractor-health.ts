type ExtractorHealthOptions = {
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForExtractorHealth(
  check: () => Promise<Response>,
  { attempts = 9, delayMs = 5_000, sleep = pause }: ExtractorHealthOptions = {},
): Promise<Response | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await check();
      if (response.ok) return response;
    } catch {
      // A free Render service can take about a minute to wake after inactivity.
    }
    if (attempt < attempts - 1) await sleep(delayMs);
  }
  return null;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForExtractorHealth } from '../lib/server/extractor-health';

test('extractor health check retries a sleeping service until it is ready', async () => {
  const statuses = [503, 502, 200];
  const delays: number[] = [];
  let calls = 0;

  const result = await waitForExtractorHealth(
    async () => new Response(null, { status: statuses[calls++] }),
    { attempts: 3, delayMs: 4_000, sleep: async (ms) => { delays.push(ms); } },
  );

  assert.equal(result?.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [4_000, 4_000]);
});

test('extractor health check stops after its final failed attempt', async () => {
  const delays: number[] = [];
  let calls = 0;

  const result = await waitForExtractorHealth(
    async () => { calls += 1; return new Response(null, { status: 503 }); },
    { attempts: 3, delayMs: 4_000, sleep: async (ms) => { delays.push(ms); } },
  );

  assert.equal(result, null);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [4_000, 4_000]);
});

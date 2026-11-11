import assert from 'node:assert/strict';
import test from 'node:test';
import { getExtractorHealthStatus, waitForExtractorHealth } from '../lib/server/extractor-health';

const healthyResponse = () => new Response(JSON.stringify({ status: 'ok', model_configured: true }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

test('extractor health check retries a sleeping service until it is ready', async () => {
  const responses = [new Response(null, { status: 503 }), new Response(null, { status: 502 }), healthyResponse()];
  const delays: number[] = [];
  let calls = 0;

  const result = await waitForExtractorHealth(
    async () => responses[calls++],
    { attempts: 3, delayMs: 4_000, sleep: async (ms) => { delays.push(ms); } },
  );

  assert.equal(result?.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [4_000, 4_000]);
});

test('health check retries a successful HTML splash until extractor JSON is ready', async () => {
  const responses = [
    new Response('<html>Starting service</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    healthyResponse(),
  ];
  let calls = 0;

  const result = await waitForExtractorHealth(
    async () => responses[calls++],
    { attempts: 2, delayMs: 1, sleep: async () => {} },
  );

  assert.equal(calls, 2);
  assert.equal(await getExtractorHealthStatus(result!), 'ready');
});

test('health status distinguishes a missing Nebius key from an unreachable extractor', async () => {
  const missingKey = new Response(JSON.stringify({ status: 'ok', model_configured: false }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const htmlSplash = new Response('<html>Starting</html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });

  assert.equal(await getExtractorHealthStatus(missingKey), 'missing_key');
  assert.equal(await getExtractorHealthStatus(htmlSplash), 'unreachable');
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

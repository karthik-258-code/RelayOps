import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeExtractionEventStream,
  consumeExtractionResponse,
  createBatchProgressReporter,
  encodeExtractionEvent,
  type ExtractionProgressEvent,
} from '../lib/extraction/progress';
import { createExtractionProgressStream } from '../lib/server/extraction-progress-stream';

const completion = {
  message: 'Nebius checked the passages and found two supported items.',
  notices: [],
  findings: 2,
  rejectedFacts: 1,
  embeddingCount: 4,
  model: 'test-model',
};

function responseFromChunks(chunks: Uint8Array[]) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

function splitBytes(bytes: Uint8Array, sizes: number[]) {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const size of sizes) {
    chunks.push(bytes.slice(offset, offset + size));
    offset += size;
  }
  if (offset < bytes.length) chunks.push(bytes.slice(offset));
  return chunks;
}

test('consumes chunked progress and terminal events in order', async () => {
  const progress: ExtractionProgressEvent = {
    type: 'progress', stage: 'extracting_batch', message: 'Nebius is checking batch 1 of 2.',
    batchIndex: 1, batchTotal: 2, elapsedSeconds: 4,
  };
  const bytes = new TextEncoder().encode(
    new TextDecoder().decode(encodeExtractionEvent(progress)) +
    new TextDecoder().decode(encodeExtractionEvent({ type: 'completed', result: completion })),
  );
  const events: ExtractionProgressEvent[] = [];

  const terminal = await consumeExtractionEventStream(
    responseFromChunks(splitBytes(bytes, [3, 11, 1, 17, 2, 29])),
    (event) => events.push(event),
  );

  assert.deepEqual(events, [progress]);
  assert.deepEqual(terminal, { type: 'completed', result: completion });
});

test('returns failed terminal events without treating them as success', async () => {
  const failed = { type: 'failed' as const, error: { code: 'EXTRACTION_FAILED', message: 'Nebius could not complete this run.' } };
  const terminal = await consumeExtractionEventStream(
    responseFromChunks([encodeExtractionEvent(failed)]),
    () => assert.fail('No progress event expected'),
  );
  assert.deepEqual(terminal, failed);
});

test('surfaces safe pre-stream JSON errors to the caller', async () => {
  const response = Response.json({ error: { code: 'EXTRACTOR_OFFLINE', message: 'The extractor is unavailable. Retry shortly.' } }, { status: 503 });
  await assert.rejects(consumeExtractionResponse(response, () => {}), /The extractor is unavailable\. Retry shortly\./);
});

test('preserves the existing JSON success response contract', async () => {
  const response = Response.json({
    message: 'Extraction finished.', notices: ['One fact was rejected.'], findings: 3,
    rejectedFacts: 1, embeddingCount: 2, model: 'Qwen/test',
  });
  const result = await consumeExtractionResponse(response, () => {});
  assert.deepEqual(result, {
    message: 'Extraction finished.', notices: ['One fact was rejected.'], findings: 3,
    rejectedFacts: 1, embeddingCount: 2, model: 'Qwen/test',
  });
});

test('rejects malformed SSE data and a stream with no terminal event', async () => {
  await assert.rejects(
    consumeExtractionEventStream(responseFromChunks([new TextEncoder().encode('data: {bad json}\n\n')]), () => {}),
    /invalid progress event/i,
  );
  await assert.rejects(
    consumeExtractionEventStream(responseFromChunks([encodeExtractionEvent({ type: 'progress', stage: 'preparing', message: 'Preparing.' })]), () => {}),
    /ended before extraction completed/i,
  );
});

test('rejects events delivered after the terminal event', async () => {
  const response = new Response([
    `data: ${JSON.stringify({ type: 'completed', result: { message: 'Done.', notices: [], findings: 0, rejectedFacts: 0, embeddingCount: 0, model: 'test' } })}\n\n`,
    `data: ${JSON.stringify({ type: 'progress', stage: 'saving_findings', message: 'late event' })}\n\n`,
  ].join(''), { headers: { 'Content-Type': 'text/event-stream' } });

  await assert.rejects(consumeExtractionEventStream(response, () => {}), /progress after its terminal event/);
});

test('timeout subdivision revises total before child batches complete', () => {
  const events: ExtractionProgressEvent[] = [];
  const batches = createBatchProgressReporter(2, (event) => events.push(event));

  batches.start('Starting batch 1 of 2.');
  batches.split(2, 'This batch was split into two smaller batches.');
  batches.start('Starting batch 1 of 3.');
  batches.complete('Completed batch 1 of 3.');
  batches.start('Starting batch 2 of 3.');
  batches.complete('Completed batch 2 of 3.');
  batches.start('Starting batch 3 of 3.');
  batches.complete('Completed batch 3 of 3.');

  assert.deepEqual(batches.snapshot(), { completed: 3, total: 3 });
  assert.deepEqual(events.map(({ batchIndex, batchTotal, completedBatches }) => [batchIndex, batchTotal, completedBatches]), [
    [1, 2, 0], [1, 3, 0], [1, 3, 0], [1, 3, 1], [2, 3, 1], [2, 3, 2], [3, 3, 2], [3, 3, 3],
  ]);
});

test('long provider work emits an elapsed activity heartbeat and no model percentage', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const response = createExtractionProgressStream(async (report) => {
    report({ type: 'progress', stage: 'extracting_batch', message: 'Nebius is checking batch 1 of 1.', batchIndex: 1, batchTotal: 1 });
    await pending;
    return { type: 'completed', result: completion };
  }, { heartbeatMs: 5 });
  const events: ExtractionProgressEvent[] = [];
  const terminalPromise = consumeExtractionEventStream(response, (event) => events.push(event));

  await new Promise((resolve) => setTimeout(resolve, 20));
  release();
  const terminal = await terminalPromise;

  assert.equal(response.headers.get('content-type')?.includes('text/event-stream'), true);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(events.some((event) => event.heartbeat && event.elapsedSeconds !== undefined && event.message.includes('Still processing.')));
  assert.equal(terminal.type, 'completed');
});

test('client cancellation stops stream writes but does not abandon the operation', async () => {
  let settleOperation!: () => void;
  let operationSettled = false;
  const operation = new Promise<void>((resolve) => { settleOperation = resolve; });
  const response = createExtractionProgressStream(async (report) => {
    report({ type: 'progress', stage: 'extracting_batch', message: 'Processing a batch.', batchIndex: 1, batchTotal: 1 });
    await operation;
    operationSettled = true;
    return { type: 'completed', result: completion };
  }, { heartbeatMs: 5 });
  const reader = response.body!.getReader();

  await reader.read();
  await reader.cancel();
  settleOperation();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(operationSettled, true);
});

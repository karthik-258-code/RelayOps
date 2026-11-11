import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExtractionBatches, buildExtractorRequest, createExtractionBudget, EXTRACTION_PERSISTENCE_RESERVE_MS, EXTRACTION_ROUTE_MAX_DURATION_MS, MAX_EXTRACTION_BATCH_CHARACTERS, MAX_EXTRACTION_OPERATION_MS, MAX_EXTRACTOR_BATCH_MS, MAX_EXTRACTOR_PASSAGES, MAX_EXTRACTOR_PASSAGE_CHARACTERS, splitExtractionBatch } from '../lib/extraction/request';
import { chunkValues } from '../lib/utils/chunk-values';

test('extractor request sends scoped passage IDs without source content', () => {
  const request = buildExtractorRequest('20000000-0000-4000-8000-000000000011', 2, ['31000000-0000-4000-8000-000000000001']);

  assert.deepEqual(request, {
    project_id: '20000000-0000-4000-8000-000000000011',
    clearance: 2,
    passage_ids: ['31000000-0000-4000-8000-000000000001'],
  });
  assert.equal('content' in request, false);
});

test('splits large projects into bounded extraction batches without dropping passages', () => {
  const passages = Array.from({ length: 218 }, (_, index) => ({ id: `passage-${index}`, content: 'x'.repeat(1_200) }));
  const batches = buildExtractionBatches(passages);

  assert.equal(batches.length, 9);
  assert.deepEqual(batches.flat().map((passage) => passage.id), passages.map((passage) => passage.id));
  for (const batch of batches) {
    assert.ok(batch.length <= MAX_EXTRACTOR_PASSAGES);
    assert.ok(batch.reduce((total, passage) => total + passage.content.length, 0) <= MAX_EXTRACTION_BATCH_CHARACTERS);
  }
});

test('keeps the 108-passage, 236k-character project payload within five Nebius batches', () => {
  const passages = Array.from({ length: 108 }, (_, index) => ({
    id: `project-test-3-passage-${index}`,
    content: 'x'.repeat(index < 57 ? 2_189 : 2_188),
  }));

  const batches = buildExtractionBatches(passages);

  assert.equal(batches.length, 5);
  assert.equal(batches.flat().length, 108);
  for (const batch of batches) {
    assert.ok(batch.length <= MAX_EXTRACTOR_PASSAGES);
    assert.ok(batch.reduce((total, passage) => total + passage.content.length, 0) <= MAX_EXTRACTION_BATCH_CHARACTERS);
    assert.ok(batch.every((passage) => passage.content.length <= MAX_EXTRACTOR_PASSAGE_CHARACTERS));
  }
});

test('rejects a passage above the extractor schema limit', () => {
  assert.throws(() => buildExtractionBatches([{ id: 'too-large', content: 'x'.repeat(MAX_EXTRACTOR_PASSAGE_CHARACTERS + 1) }]), /passage character limit/);
});

test('splits a timed-out batch into two complete smaller requests', () => {
  const batch = Array.from({ length: 5 }, (_, index) => `passage-${index}`);
  const split = splitExtractionBatch(batch);

  assert.deepEqual(split, [['passage-0', 'passage-1', 'passage-2'], ['passage-3', 'passage-4']]);
  assert.deepEqual(split?.flat(), batch);
});

test('does not split a single passage after extraction timeout', () => {
  assert.equal(splitExtractionBatch(['passage-0']), null);
});

test('bounds sequential batches by one shared operation deadline', () => {
  let now = 0;
  const budget = createExtractionBudget(MAX_EXTRACTION_OPERATION_MS, () => now);
  assert.equal(MAX_EXTRACTION_OPERATION_MS, 510_000);
  assert.equal(EXTRACTION_PERSISTENCE_RESERVE_MS, 90_000);
  assert.equal(MAX_EXTRACTOR_BATCH_MS, 210_000);
  assert.equal(EXTRACTION_ROUTE_MAX_DURATION_MS, 600_000);
  assert.equal(MAX_EXTRACTION_OPERATION_MS + EXTRACTION_PERSISTENCE_RESERVE_MS, EXTRACTION_ROUTE_MAX_DURATION_MS);
  assert.equal(budget.nextRequestTimeoutMs(MAX_EXTRACTOR_BATCH_MS), MAX_EXTRACTOR_BATCH_MS);
  now = 200_000;
  assert.equal(budget.nextRequestTimeoutMs(MAX_EXTRACTOR_BATCH_MS), MAX_EXTRACTOR_BATCH_MS);
  now = 450_000;
  assert.equal(budget.nextRequestTimeoutMs(MAX_EXTRACTOR_BATCH_MS), 60_000);
  now = MAX_EXTRACTION_OPERATION_MS;
  assert.equal(budget.nextRequestTimeoutMs(MAX_EXTRACTOR_BATCH_MS), null);
});

test('chunks database filter values so large PostgREST URIs stay bounded', () => {
  const ids = Array.from({ length: 218 }, (_, index) => `passage-${index}`);
  const chunks = chunkValues(ids, 50);

  assert.deepEqual(chunks.map((chunk) => chunk.length), [50, 50, 50, 50, 18]);
  assert.deepEqual(chunks.flat(), ids);
});

test('rejects an invalid database filter chunk size', () => {
  assert.throws(() => chunkValues(['id'], 0), /positive integer/);
});

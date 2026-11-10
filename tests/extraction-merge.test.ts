import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeExtractionResults, type ExtractorBatchResult } from '../lib/extraction/merge';

function result(statement: string, passageId: string): ExtractorBatchResult {
  return {
    extraction_mode: 'nebius', model: 'test-model', rejected_fact_count: 0, embedding_model: null,
    redacted_passages: { [passageId]: 'redacted source text' }, embeddings: {},
    claims: [{ topic: 'session-store', title: 'Session store', category: 'decision', statement, status: 'verified', confidence: 0.8, clearance: 1, owner_name: null, due_at: null, citations: [{ passage_id: passageId, quote: 'exact quote', start_offset: 0, end_offset: 11, clearance: 1, relation: 'supports' }] }],
    entities: [], edges: [], notices: [],
  };
}

test('retains conflicting citations when a topic spans extraction batches', () => {
  const merged = mergeExtractionResults([
    result('The session store uses Postgres.', '31000000-0000-4000-8000-000000000001'),
    result('The session store uses Redis.', '31000000-0000-4000-8000-000000000002'),
  ]);

  assert.equal(merged.claims.length, 1);
  assert.equal(merged.claims[0].status, 'conflict');
  assert.equal(merged.claims[0].citations.length, 2);
  assert.ok(merged.claims[0].citations.every((citation) => citation.relation === 'context'));
  assert.equal(Object.keys(merged.redacted_passages).length, 2);
});

test('combines non-conflicting duplicate claims and result metadata across batches', () => {
  const first = result('The session store uses Postgres.', '31000000-0000-4000-8000-000000000001');
  const second = result('The session store uses Postgres.', '31000000-0000-4000-8000-000000000002');
  second.rejected_fact_count = 2;
  second.notices = ['One batch had a notice.'];

  const merged = mergeExtractionResults([first, second]);

  assert.equal(merged.claims[0].status, 'verified');
  assert.equal(merged.claims[0].citations.length, 2);
  assert.equal(merged.rejected_fact_count, 2);
  assert.deepEqual(merged.notices, ['One batch had a notice.']);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { hasValidExtractorKey } from '../lib/server/internal-extractor-auth';

test('extractor callback accepts only the configured non-empty key', () => {
  assert.equal(hasValidExtractorKey('shared-test-key', 'shared-test-key'), true);
  assert.equal(hasValidExtractorKey('wrong-key', 'shared-test-key'), false);
  assert.equal(hasValidExtractorKey(null, 'shared-test-key'), false);
  assert.equal(hasValidExtractorKey('shared-test-key', ''), false);
});

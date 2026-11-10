import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileExtractedEntities } from '../lib/extraction/entities';

test('reuses stored entity IDs so existing edges keep valid references', () => {
  const resolution = reconcileExtractedEntities(
    [{ id: 'new-id', canonical_name: 'Release Lead', entity_type: 'person', clearance: 2 }],
    [{ id: 'stored-id', canonical_name: 'Release Lead', entity_type: 'person', clearance: 1 }],
  );

  assert.equal(resolution.incomingToStoredId.get('new-id'), 'stored-id');
  assert.deepEqual(resolution.entitiesToInsert, []);
  assert.deepEqual(resolution.clearanceUpdates, [{ id: 'stored-id', clearance: 2 }]);
});

test('deduplicates case variants and maps every incoming ID to one stable row', () => {
  const resolution = reconcileExtractedEntities(
    [
      { id: 'first-id', canonical_name: 'Mina Patel', entity_type: 'person', clearance: 1 },
      { id: 'second-id', canonical_name: 'mina patel', entity_type: 'person', clearance: 2 },
    ],
    [],
  );

  assert.equal(resolution.incomingToStoredId.get('first-id'), resolution.incomingToStoredId.get('second-id'));
  assert.equal(resolution.entitiesToInsert.length, 1);
  assert.equal(resolution.entitiesToInsert[0].clearance, 2);
});

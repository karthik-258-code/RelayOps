import assert from 'node:assert/strict';
import test from 'node:test';
import { matchExtractedClaimsToExistingFindings } from '../lib/extraction/deduplicate';

test('matches a model paraphrase to the deterministic row when source quote and fact agree', () => {
  const matches = matchExtractedClaimsToExistingFindings(
    [{
      topic: 'backup-owner', category: 'ownership',
      statement: 'Priya Nair owns the PostgreSQL backup and restore runbook.', clearance: 1,
      citations: [{ passage_id: 'passage-1', quote: 'Priya Nair owns the PostgreSQL backup and restore runbook.' }],
    }],
    [{
      id: 'deterministic-claim', category: 'ownership',
      statement: 'Owner: Priya Nair owns the PostgreSQL backup and restore runbook.',
      clearance: 1, extraction_run_id: null,
    }],
    [{
      claim_id: 'deterministic-claim', passage_id: 'passage-1',
      quote: '- Owner: Priya Nair owns the PostgreSQL backup and restore runbook.',
    }],
  );

  assert.equal(matches.get('backup-owner'), 'deterministic-claim');
});

test('does not match different findings just because they cite the same passage', () => {
  const matches = matchExtractedClaimsToExistingFindings(
    [{
      topic: 'staging-migration', category: 'risk',
      statement: 'The staging replica is missing the latest schema migration.', clearance: 1,
      citations: [{ passage_id: 'passage-1', quote: 'The staging replica is missing the latest schema migration.' }],
    }],
    [{
      id: 'payment-risk', category: 'risk',
      statement: 'Payment writes may be lost if the primary replica is unavailable.',
      clearance: 1, extraction_run_id: null,
    }],
    [{
      claim_id: 'payment-risk', passage_id: 'passage-1',
      quote: 'If the primary replica is unavailable during cutover, queued writes may be lost.',
    }],
  );

  assert.equal(matches.size, 0);
});

test('maps at most one extracted claim to each deterministic row', () => {
  const matches = matchExtractedClaimsToExistingFindings(
    [
      { topic: 'owner-a', category: 'ownership', statement: 'Maya owns database migration.', clearance: 1, citations: [{ passage_id: 'p', quote: 'Maya owns database migration.' }] },
      { topic: 'owner-b', category: 'ownership', statement: 'Maya owns database migration.', clearance: 1, citations: [{ passage_id: 'p', quote: 'Maya owns database migration.' }] },
    ],
    [{ id: 'det-owner', category: 'ownership', statement: 'Maya owns database migration.', clearance: 1, extraction_run_id: null }],
    [{ claim_id: 'det-owner', passage_id: 'p', quote: '- Owner: Maya owns database migration.' }],
  );

  assert.equal([...matches.values()].filter((id) => id === 'det-owner').length, 1);
});

test('reuses an earlier Nebius row when the same project is extracted again', () => {
  const matches = matchExtractedClaimsToExistingFindings(
    [{ topic: 'owner', category: 'ownership', statement: 'Maya owns the database runbook.', clearance: 1, citations: [{ passage_id: 'p', quote: 'Maya Chen owns the database runbook.' }] }],
    [{ id: 'previous-nebius-row', category: 'ownership', statement: 'Maya Chen owns the database runbook.', clearance: 1, extraction_run_id: 'previous-run' }],
    [{ claim_id: 'previous-nebius-row', passage_id: 'p', quote: 'Maya Chen owns the database runbook.' }],
  );

  assert.equal(matches.get('owner'), 'previous-nebius-row');
});

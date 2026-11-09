import test from 'node:test';
import assert from 'node:assert/strict';
import { citationGatedClaimStatus, matchesCodePointCitation, resolvePersistedCitations } from '../lib/ingestion/persisted-citations';

test('only persists an exact excerpt from a passage belonging to the cited source', () => {
  const passages = [
    { id: 'passage-a', sourceId: 'source-a', content: 'The migration is scheduled for Friday.' },
    { id: 'passage-b', sourceId: 'source-b', content: 'The migration is scheduled for Monday.' },
  ];
  const citations = resolvePersistedCitations([
    { sourceId: 'source-a', excerpt: 'scheduled for Friday' },
    { sourceId: 'source-a', excerpt: 'scheduled for Monday' },
  ], passages);

  assert.deepEqual(citations, [{ passageId: 'passage-a', quote: 'scheduled for Friday', startOffset: 17, endOffset: 37 }]);
});

test('does not leave a finding verified when every citation is unresolvable', () => {
  const citations = resolvePersistedCitations(
    [{ sourceId: 'source-a', excerpt: 'invented excerpt' }],
    [{ id: 'passage-a', sourceId: 'source-a', content: 'Stored source content.' }],
  );

  assert.equal(citationGatedClaimStatus('VERIFIED', citations), 'missing_evidence');
});

test('uses Unicode code-point offsets consistently with Python and PostgreSQL', () => {
  const content = '🌱 The migration is scheduled for Friday.';
  const citation = resolvePersistedCitations(
    [{ sourceId: 'source-a', excerpt: 'scheduled for Friday' }],
    [{ id: 'passage-a', sourceId: 'source-a', content }],
  )[0];

  assert.deepEqual(citation, { passageId: 'passage-a', quote: 'scheduled for Friday', startOffset: 19, endOffset: 39 });
  assert.equal(matchesCodePointCitation(content, citation.quote, citation.startOffset, citation.endOffset), true);
  assert.equal(matchesCodePointCitation(content, citation.quote, 20, 40), false);
});

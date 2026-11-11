type FactCategory = 'decision' | 'ownership' | 'blocker' | 'risk' | 'next-action';

export type ExtractedFactIdentity = {
  topic: string;
  category: FactCategory;
  statement: string;
  clearance: number;
  citations: Array<{ passage_id: string; quote: string }>;
};

export type StoredFactIdentity = {
  id: string;
  category: FactCategory;
  statement: string;
  clearance: number;
  extraction_run_id: string | null;
};

export type StoredFactCitation = {
  claim_id: string;
  passage_id: string;
  quote: string;
};

const ignoredWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'by', 'for', 'from',
  'if', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'so', 'that', 'the',
  'this', 'to', 'was', 'were', 'when', 'with', 'will', 'would',
]);

function terms(value: string): Set<string> {
  return new Set(value
    .replace(/\[\s*redacted_[a-z_]+\s*\]/gi, ' ')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g)
    ?.filter((word) => word.length > 1 && !ignoredWords.has(word)) ?? []);
}

function similarity(left: string, right: string): number {
  const leftTerms = terms(left);
  const rightTerms = terms(right);
  if (!leftTerms.size || !rightTerms.size) return 0;
  const overlap = [...leftTerms].filter((word) => rightTerms.has(word)).length;
  return overlap / (leftTerms.size + rightTerms.size - overlap);
}

/**
 * Reuse a stored finding's stable row ID when Nebius describes the same fact
 * from the same cited passage. This prevents duplicates on first and later
 * runs while leaving distinct claims from the same source separate.
 */
export function matchExtractedClaimsToExistingFindings(
  extracted: ExtractedFactIdentity[],
  storedClaims: StoredFactIdentity[],
  storedCitations: StoredFactCitation[],
): Map<string, string> {
  const citationsByClaim = new Map<string, StoredFactCitation[]>();
  for (const citation of storedCitations) {
    const group = citationsByClaim.get(citation.claim_id) ?? [];
    group.push(citation);
    citationsByClaim.set(citation.claim_id, group);
  }

  const usedClaimIds = new Set<string>();
  const matches = new Map<string, string>();
  for (const fact of extracted) {
    const candidates = storedClaims.flatMap((stored) => {
      if (usedClaimIds.has(stored.id) || stored.category !== fact.category || stored.clearance !== fact.clearance) return [];
      const statementSimilarity = similarity(fact.statement, stored.statement);
      if (statementSimilarity < 0.58) return [];

      const evidenceSimilarity = fact.citations.reduce((best, incoming) => {
        const storedQuotes = (citationsByClaim.get(stored.id) ?? [])
          .filter((citation) => citation.passage_id === incoming.passage_id);
        return Math.max(best, ...storedQuotes.map((citation) => similarity(incoming.quote, citation.quote)), 0);
      }, 0);
      if (evidenceSimilarity < 0.58) return [];
      return [{ id: stored.id, score: statementSimilarity * 0.7 + evidenceSimilarity * 0.3 }];
    }).sort((left, right) => right.score - left.score);

    const best = candidates[0];
    if (!best || (candidates[1] && best.score - candidates[1].score < 0.05)) continue;
    matches.set(fact.topic, best.id);
    usedClaimIds.add(best.id);
  }
  return matches;
}

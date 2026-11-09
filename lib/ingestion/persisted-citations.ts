export interface CitationExcerptInput {
  sourceId: string;
  excerpt: string;
}

export interface PersistedPassageInput {
  id: string;
  sourceId: string;
  content: string;
}

export interface ResolvedCitationExcerpt {
  passageId: string;
  quote: string;
  startOffset: number;
  endOffset: number;
}

export function codePointOffset(content: string, utf16Offset: number): number {
  return Array.from(content.slice(0, utf16Offset)).length;
}

export function resolvePersistedCitations(
  citations: CitationExcerptInput[],
  passages: PersistedPassageInput[],
): ResolvedCitationExcerpt[] {
  return citations.flatMap((citation) => {
    const quote = citation.excerpt.trim();
    if (!quote) return [];
    const passage = passages.find((candidate) => candidate.sourceId === citation.sourceId && candidate.content.includes(quote));
    if (!passage) return [];
    const utf16Offset = passage.content.indexOf(quote);
    const startOffset = codePointOffset(passage.content, utf16Offset);
    return [{ passageId: passage.id, quote, startOffset, endOffset: startOffset + Array.from(quote).length }];
  });
}

export function matchesCodePointCitation(content: string, quote: string, expectedStart: number, expectedEnd: number): boolean {
  const utf16Start = content.indexOf(quote);
  if (utf16Start < 0) return false;
  const start = codePointOffset(content, utf16Start);
  return start === expectedStart && start + Array.from(quote).length === expectedEnd;
}

export function citationGatedClaimStatus<T extends string>(status: T, citations: readonly unknown[]): T | 'missing_evidence' {
  return citations.length ? status : 'missing_evidence';
}

export type ExtractorRequest = {
  project_id: string;
  clearance: 1 | 2 | 3;
  passage_ids: string[];
};

export const MAX_EXTRACTOR_PASSAGES = 25;
export const MAX_EXTRACTOR_PASSAGE_CHARACTERS = 30_000;
export const MAX_EXTRACTION_BATCH_CHARACTERS = 50_000;
export const MAX_EXTRACTION_CHARACTERS = 200_000;
export const EXTRACTION_PERSISTENCE_RESERVE_MS = 90_000;
export const MAX_EXTRACTION_OPERATION_MS = 510_000;
export const MAX_EXTRACTOR_BATCH_MS = 210_000;
export const EXTRACTION_ROUTE_MAX_DURATION_MS = 600_000;

export function createExtractionBudget(totalMs: number, now: () => number = Date.now) {
  if (!Number.isFinite(totalMs) || totalMs <= 0) throw new RangeError('Extraction budget must be positive.');
  const deadline = now() + totalMs;
  return {
    nextRequestTimeoutMs(maxRequestMs: number) {
      if (!Number.isFinite(maxRequestMs) || maxRequestMs <= 0) throw new RangeError('Request budget must be positive.');
      const remaining = Math.floor(deadline - now());
      return remaining > 0 ? Math.min(maxRequestMs, remaining) : null;
    },
  };
}

export function buildExtractionBatches<T extends { id: string; content: string }>(passages: T[]): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentCharacters = 0;

  for (const passage of passages) {
    const characters = passage.content.length;
    if (characters > MAX_EXTRACTOR_PASSAGE_CHARACTERS) {
      throw new RangeError('A source passage exceeds the extractor passage character limit.');
    }
    if (current.length && (current.length >= MAX_EXTRACTOR_PASSAGES || currentCharacters + characters > MAX_EXTRACTION_BATCH_CHARACTERS)) {
      batches.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(passage);
    currentCharacters += characters;
  }

  if (current.length) batches.push(current);
  return batches;
}

export function splitExtractionBatch<T>(batch: T[]): [T[], T[]] | null {
  if (batch.length < 2) return null;
  const midpoint = Math.ceil(batch.length / 2);
  return [batch.slice(0, midpoint), batch.slice(midpoint)];
}

export function buildExtractorRequest(
  projectId: string,
  clearance: 1 | 2 | 3,
  passageIds: string[],
): ExtractorRequest {
  return { project_id: projectId, clearance, passage_ids: passageIds };
}

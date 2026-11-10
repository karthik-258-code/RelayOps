type Citation = {
  passage_id: string;
  quote: string;
  start_offset: number;
  end_offset: number;
  clearance: number;
  relation: 'supports' | 'contradicts' | 'context';
};

type ExtractedClaim = {
  topic: string;
  title: string;
  category: 'decision' | 'ownership' | 'blocker' | 'risk' | 'next-action';
  statement: string;
  status: 'verified' | 'conflict' | 'missing_evidence';
  confidence: number;
  clearance: number;
  owner_name: string | null;
  due_at: string | null;
  citations: Citation[];
};

export type ExtractorBatchResult = {
  extraction_mode: 'nebius';
  model: string;
  rejected_fact_count: number;
  embedding_model: string | null;
  redacted_passages: Record<string, string>;
  embeddings: Record<string, number[]>;
  claims: ExtractedClaim[];
  entities: Array<{ id: string; canonical_name: string; entity_type: string; clearance: number }>;
  edges: Array<{
    id: string;
    from_entity_id: string;
    to_entity_id: string;
    relation: string;
    valid_from: string;
    valid_to: string | null;
    source_passage_id: string;
    confidence: number;
    clearance: number;
  }>;
  notices: string[];
};

function unionById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function commonValue<T>(claims: ExtractedClaim[], key: 'owner_name' | 'due_at'): T | null {
  const values = claims.map((claim) => claim[key]);
  return values.every((value) => value === values[0]) ? values[0] as T | null : null;
}

export function mergeExtractionResults(results: ExtractorBatchResult[]): ExtractorBatchResult {
  const claimsByTopic = new Map<string, ExtractedClaim[]>();
  for (const result of results) {
    for (const claim of result.claims) {
      const group = claimsByTopic.get(claim.topic) ?? [];
      group.push(claim);
      claimsByTopic.set(claim.topic, group);
    }
  }

  const claims = [...claimsByTopic.values()].map((group) => {
    const first = group[0];
    const statements = [...new Set(group.map((claim) => claim.statement))];
    const statuses = new Set(group.map((claim) => claim.status));
    const conflict = statements.length > 1 || statuses.size > 1 || statuses.has('conflict');
    const citations = [...new Map(group.flatMap((claim) => claim.citations).map((citation) => [
      `${citation.passage_id}:${citation.start_offset}:${citation.end_offset}:${citation.quote}`,
      conflict ? { ...citation, relation: 'context' as const } : citation,
    ])).values()];

    return {
      ...first,
      statement: statements.length > 1
        ? `Sources report different states for ${first.title.toLocaleLowerCase()}. Review both before sharing.`
        : first.statement,
      status: conflict ? 'conflict' as const : first.status,
      confidence: Math.min(...group.map((claim) => claim.confidence)),
      clearance: Math.max(...group.map((claim) => claim.clearance)),
      owner_name: commonValue<string>(group, 'owner_name'),
      due_at: commonValue<string>(group, 'due_at'),
      citations,
    };
  });

  return {
    extraction_mode: 'nebius',
    model: results[0]?.model ?? '',
    rejected_fact_count: results.reduce((sum, result) => sum + result.rejected_fact_count, 0),
    embedding_model: results.find((result) => result.embedding_model)?.embedding_model ?? null,
    redacted_passages: Object.assign({}, ...results.map((result) => result.redacted_passages)),
    embeddings: Object.assign({}, ...results.map((result) => result.embeddings)),
    claims,
    entities: unionById(results.flatMap((result) => result.entities)),
    edges: unionById(results.flatMap((result) => result.edges)),
    notices: [...new Set(results.flatMap((result) => result.notices))],
  };
}

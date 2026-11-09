import type { Claim, ClaimCategory, Citation, SourceRecord } from "@/lib/domain/types";

const categoryOrder: ClaimCategory[] = ["decision", "ownership", "blocker", "risk", "next-action"];

function toCitation(source: SourceRecord, excerpt: string): Citation {
  return {
    sourceId: source.id,
    sourceTitle: source.title,
    sourceKind: source.kind,
    occurredAt: source.occurredAt,
    author: source.author,
    excerpt,
    clearance: source.clearance,
  };
}

function readableTopic(topic: string): string {
  return topic.replaceAll("-", " ");
}

export function reconstructWorkspace(sources: SourceRecord[]): Claim[] {
  const grouped = new Map<string, { source: SourceRecord; observation: SourceRecord["observations"][number] }[]>();
  for (const source of sources) {
    for (const observation of source.observations) {
      const items = grouped.get(observation.topic) ?? [];
      items.push({ source, observation });
      grouped.set(observation.topic, items);
    }
  }

  const claims: Claim[] = [];
  for (const [topic, items] of grouped) {
    const ordered = [...items].sort((a, b) => a.source.occurredAt.localeCompare(b.source.occurredAt));
    const values = new Set(ordered.map(({ observation }) => observation.value.trim().toLocaleLowerCase()));
    const isConflict = values.size > 1;
    const hasEvidenceGap = ordered.some(({ observation }) => observation.evidenceGap);
    const status = isConflict ? "CONFLICT" : hasEvidenceGap ? "MISSING EVIDENCE" : "VERIFIED";
    const lastItem = ordered.at(-1)!;
    const statement = isConflict
      ? `Sources report different states for ${readableTopic(topic)}. Review both before sharing.`
      : lastItem.observation.statement;
    const alternatives = [...new Set(ordered.map(({ observation }) => observation.statement))];
    const citations = ordered.map(({ source, observation }) =>
      toCitation(source, observation.excerpt ?? observation.statement),
    );

    claims.push({
      id: `claim-${topic}`,
      topic,
      category: lastItem.observation.category,
      statement,
      status,
      citations,
      clearance: Math.max(...citations.map((citation) => citation.clearance)) as 1 | 2 | 3,
      alternatives,
      ...(lastItem.observation.ownerName ? { ownerName: lastItem.observation.ownerName } : {}),
      ...(lastItem.observation.dueAt ? { dueAt: lastItem.observation.dueAt } : {}),
    });
  }

  return claims.sort((a, b) => {
    const categoryDifference = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    return categoryDifference || a.topic.localeCompare(b.topic);
  });
}

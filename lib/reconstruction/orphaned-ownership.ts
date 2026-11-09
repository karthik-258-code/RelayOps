import type { SourceRecord } from "@/lib/domain/types";

export interface OrphanedOwnershipSignal {
  author: string;
  commitCount: number;
  totalCommits: number;
  share: number;
  sourceIds: string[];
}

export function detectOrphanedOwnership(sources: SourceRecord[], now = new Date()): OrphanedOwnershipSignal[] {
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const commits = sources.filter((source) => {
    const occurredAt = Date.parse(source.occurredAt);
    return source.kind === "repository" && /:commit:[^:]+$/.test(source.id) && Number.isFinite(occurredAt) && occurredAt >= cutoff && occurredAt <= now.getTime();
  });
  if (!commits.length) return [];
  const grouped = new Map<string, SourceRecord[]>();
  for (const commit of commits) {
    const key = commit.author.trim().toLocaleLowerCase();
    if (!key || key === "unknown") continue;
    grouped.set(key, [...(grouped.get(key) ?? []), commit]);
  }
  const contextRecords = sources.filter((source) => source.kind === "document" || source.kind === "task" || source.kind === "discussion");
  return [...grouped.entries()].flatMap(([authorKey, authored]) => {
    const share = authored.length / commits.length;
    const author = authored[0].author.trim();
    const hasContext = contextRecords.some((source) => `${source.author} ${source.title} ${source.content}`.toLocaleLowerCase().includes(authorKey));
    return share > 0.7 && !hasContext ? [{ author, commitCount: authored.length, totalCommits: commits.length, share, sourceIds: authored.map((source) => source.id) }] : [];
  }).sort((a, b) => b.share - a.share || a.author.localeCompare(b.author));
}

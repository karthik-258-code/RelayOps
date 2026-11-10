import type { ReviewHistoryEntry, ReviewDisposition } from "./types";

export interface ReviewDecisionRow {
  claim_id: string;
  decision: string;
  edited_statement: string | null;
  note: string | null;
  claim_version: number;
  created_at: string;
  actor_label?: string;
}

const dispositionMap: Record<string, ReviewDisposition> = {
  pending: "pending",
  confirmed: "confirmed",
  resolved: "resolved",
  accepted_uncertainty: "accepted-uncertainty",
  rejected: "rejected",
};

export function groupReviewHistory(rows: readonly ReviewDecisionRow[]): Record<string, ReviewHistoryEntry[]> {
  const history: Record<string, ReviewHistoryEntry[]> = {};
  for (const row of rows) {
    (history[row.claim_id] ??= []).push({
      disposition: dispositionMap[row.decision] ?? "pending",
      ...(row.edited_statement ? { editedStatement: row.edited_statement } : {}),
      ...(row.note ? { note: row.note } : {}),
      claimVersion: row.claim_version,
      createdAt: row.created_at,
      ...(row.actor_label ? { actorLabel: row.actor_label } : {}),
    });
  }
  return history;
}

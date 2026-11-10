export type SourceKind = "document" | "task" | "discussion" | "repository";
export type ClaimCategory = "decision" | "ownership" | "blocker" | "next-action" | "risk";
export type EvidenceStatus = "VERIFIED" | "CONFLICT" | "MISSING EVIDENCE";
export type Clearance = 1 | 2 | 3;
export type Role = "contributor" | "project-lead";

export interface Observation {
  topic: string;
  category: ClaimCategory;
  statement: string;
  value: string;
  excerpt?: string;
  /** Source is useful for ownership, but the evidence needed to verify it is absent. */
  evidenceGap?: boolean;
  ownerName?: string;
  dueAt?: string;
}

export interface SourceRecord {
  id: string;
  title: string;
  url?: string;
  kind: SourceKind;
  occurredAt: string;
  author: string;
  clearance: Clearance;
  content: string;
  observations: Observation[];
}

export interface Citation {
  sourceId: string;
  sourceTitle: string;
  sourceKind: SourceKind;
  sourceUrl?: string;
  occurredAt: string;
  author: string;
  excerpt: string;
  clearance: Clearance;
}

export interface Claim {
  id: string;
  topic: string;
  category: ClaimCategory;
  statement: string;
  status: EvidenceStatus;
  citations: Citation[];
  clearance: Clearance;
  alternatives: string[];
  ownerName?: string;
  dueAt?: string;
}

export type ReviewDisposition = "pending" | "confirmed" | "resolved" | "accepted-uncertainty" | "rejected";

export interface ClaimReview {
  disposition: ReviewDisposition;
  editedStatement?: string;
  note?: string;
}

export interface ReviewHistoryEntry extends ClaimReview {
  claimVersion: number;
  createdAt: string;
  actorLabel?: string;
}

export interface HandoverState {
  schemaVersion: 1;
  sources: SourceRecord[];
  claims: Claim[];
  reviews: Record<string, ClaimReview>;
  approvedAt?: string;
  acknowledgedAt?: string;
  importedNames: string[];
}

export interface RoleHandover {
  claims: Claim[];
  restrictedCount: number;
}

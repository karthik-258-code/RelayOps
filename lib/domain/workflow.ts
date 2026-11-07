import type { Claim, ClaimReview, HandoverState } from "./types";

export function createInitialReviews(claims: Claim[]): Record<string, ClaimReview> {
  return Object.fromEntries(claims.map((claim) => [claim.id, { disposition: "pending" }]));
}

export function pendingReviewCount(claims: Claim[], reviews: Record<string, ClaimReview>): number {
  return claims.filter((claim) => (reviews[claim.id]?.disposition ?? "pending") === "pending").length;
}

export function canApprove(project: HandoverState): boolean {
  return !project.approvedAt && pendingReviewCount(project.claims, project.reviews) === 0;
}

export function finalStatement(claim: Claim, review?: ClaimReview): string {
  return review?.editedStatement?.trim() || claim.statement;
}

export function isResolvedForHandover(review?: ClaimReview): boolean {
  return Boolean(review && review.disposition !== "pending");
}

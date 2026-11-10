import assert from "node:assert/strict";
import test from "node:test";
import { groupReviewHistory } from "../lib/domain/review-history";

test("review history keeps each append-only decision with its original claim version", () => {
  const grouped = groupReviewHistory([
    { claim_id: "claim-a", decision: "resolved", edited_statement: "New wording", note: "Cited interview", claim_version: 3, created_at: "2026-11-10T08:00:00Z", actor_label: "Project Lead" },
    { claim_id: "claim-a", decision: "accepted_uncertainty", edited_statement: null, note: "Need more evidence", claim_version: 2, created_at: "2026-11-09T08:00:00Z" },
    { claim_id: "claim-b", decision: "confirmed", edited_statement: null, note: "", claim_version: 1, created_at: "2026-11-08T08:00:00Z" },
  ]);

  assert.deepEqual(grouped["claim-a"].map((entry) => [entry.disposition, entry.claimVersion, entry.editedStatement]), [
    ["resolved", 3, "New wording"],
    ["accepted-uncertainty", 2, undefined],
  ]);
  assert.equal(grouped["claim-a"][1].note, "Need more evidence");
  assert.equal(grouped["claim-b"][0].disposition, "confirmed");
  assert.equal(grouped["claim-a"][0].actorLabel, "Project Lead");
});

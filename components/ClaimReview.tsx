"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Claim, ClaimReview as ClaimReviewData, ReviewDisposition } from "@/lib/domain/types";
import { finalStatement } from "@/lib/domain/workflow";
import { Icon } from "./icons";

export function ClaimReview({ claim, review, onDecision }: {
  claim: Claim | null;
  review?: ClaimReviewData;
  onDecision: (id: string, disposition: ReviewDisposition, editedStatement?: string) => void;
}) {
  const [statement, setStatement] = useState("");
  useEffect(() => { setStatement(claim ? finalStatement(claim, review) : ""); }, [claim?.id, claim?.statement, review?.editedStatement]);
  if (!claim) return <div className="review-empty"><p>Select a finding to make a decision.</p></div>;
  const pending = !review || review.disposition === "pending";

  function saveResolution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statement.trim()) return;
    onDecision(claim!.id, "resolved", statement.trim());
  }

  return <form className="review-box" onSubmit={saveResolution}>
    <div className="review-box-heading"><div><p className="panel-kicker">Human review</p><h3>{pending ? "Make a decision" : "Reviewer decision"}</h3></div>
      {!pending && <span className="decision-saved"><Icon name="check" />Saved</span>}
    </div>
    {pending ? <>
      <label className="field-label" htmlFor="claim-statement">Handover wording</label>
      <textarea id="claim-statement" value={statement} onChange={(event) => setStatement(event.target.value)} rows={3} />
      {claim.status === "CONFLICT" && <p className="review-hint">Edit wording to resolve this conflict. Or keep the disagreement visible as unresolved.</p>}
      {claim.status === "MISSING EVIDENCE" && <p className="review-hint">You can keep this evidence gap visible for the incoming teammate.</p>}
      <div className="review-actions">
        {claim.status === "VERIFIED" && <button type="button" className="button button-secondary" onClick={() => onDecision(claim.id, "confirmed")}>Confirm finding</button>}
        {claim.status === "VERIFIED" && statement.trim() !== finalStatement(claim, review) && <button type="submit" className="button button-primary" disabled={!statement.trim()}>Save wording</button>}
        {claim.status === "CONFLICT" && <button type="submit" className="button button-primary" disabled={!statement.trim() || statement.trim() === claim.statement}>Resolve and save</button>}
        {claim.status === "MISSING EVIDENCE" && statement.trim() !== finalStatement(claim, review) && <button type="submit" className="button button-primary" disabled={!statement.trim()}>Save reviewer wording</button>}
        {claim.status === "MISSING EVIDENCE" && <button type="button" className="button button-secondary" onClick={() => onDecision(claim.id, "accepted-uncertainty")}>Keep gap visible</button>}
        {claim.status === "CONFLICT" && <button type="button" className="button button-secondary" onClick={() => onDecision(claim.id, "accepted-uncertainty")}>Leave conflict unresolved</button>}
        {claim.status === "VERIFIED" && <button type="button" className="button button-quiet" onClick={() => onDecision(claim.id, "accepted-uncertainty")}>Accept with caveat</button>}
        <button type="button" className="button button-quiet" onClick={() => onDecision(claim.id, "rejected")}>Exclude from handover</button>
      </div>
    </> : <div className="decision-summary">
      <p>{review?.disposition === "confirmed" ? "You confirmed this finding." : review?.disposition === "resolved" ? "You saved revised handover wording." : review?.disposition === "rejected" ? "This finding is excluded from the handover." : "You chose to keep the evidence status visible."}</p>
      {review?.editedStatement && <blockquote>{review.editedStatement}</blockquote>}
      <button type="button" className="button button-quiet" onClick={() => onDecision(claim.id, "pending", review?.editedStatement)}>Reopen review</button>
    </div>}
  </form>;
}

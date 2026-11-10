"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Claim, ClaimReview as ClaimReviewData, ReviewDisposition, ReviewHistoryEntry } from "@/lib/domain/types";
import { finalStatement } from "@/lib/domain/workflow";
import { Icon } from "./icons";
import { ExitInterview } from "./ExitInterview";

const decisionLabels: Record<ReviewDisposition, string> = {
  pending: "Reopened",
  confirmed: "Confirmed finding",
  resolved: "Saved revised wording",
  "accepted-uncertainty": "Kept uncertainty visible",
  rejected: "Excluded from handover",
};

export function ClaimReview({ claim, review, history = [], onDecision, onInterview, canReview = true, busy = false }: {
  claim: Claim | null;
  review?: ClaimReviewData;
  history?: ReviewHistoryEntry[];
  onDecision: (id: string, disposition: ReviewDisposition, editedStatement?: string) => void;
  onInterview?: (id: string, response: string) => Promise<void>;
  canReview?: boolean;
  busy?: boolean;
}) {
  const [statement, setStatement] = useState("");
  useEffect(() => { setStatement(claim ? finalStatement(claim, review) : ""); }, [claim?.id, claim?.statement, review?.editedStatement]);
  if (!claim) return <div className="review-empty"><p>Select a finding to make a decision.</p></div>;
  if (!canReview) return <section className="review-box" aria-label="Review permissions">
    <div className="review-box-heading"><div><p className="panel-kicker">Human review</p><h3>Read-only finding</h3></div></div>
    <p className="review-hint">Only a project lead or reviewer can save a decision. Your account can read this finding and its source trail.</p>
    {review?.editedStatement && <blockquote>{review.editedStatement}</blockquote>}
  </section>;
  const pending = !review || review.disposition === "pending";

  function saveResolution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statement.trim()) return;
    onDecision(claim!.id, "resolved", statement.trim());
  }

  return <div className="review-panel-stack"><form className="review-box" onSubmit={saveResolution}>
    <div className="review-box-heading"><div><p className="panel-kicker">Human review</p><h3>{pending ? "Make a decision" : "Reviewer decision"}</h3></div>
      {!pending && <span className="decision-saved"><Icon name="check" />Saved</span>}
    </div>
    {pending ? <>
      <label className="field-label" htmlFor="claim-statement">Handover wording</label>
      <textarea id="claim-statement" value={statement} onChange={(event) => setStatement(event.target.value)} rows={3} disabled={busy} />
      {claim.status === "CONFLICT" && <p className="review-hint">Edit wording to resolve this conflict. Or keep the disagreement visible as unresolved.</p>}
      {claim.status === "MISSING EVIDENCE" && <p className="review-hint">You can keep this evidence gap visible for the incoming teammate.</p>}
      <div className="review-actions">
        {claim.status === "VERIFIED" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => onDecision(claim.id, "confirmed")}>Confirm finding</button>}
        {claim.status === "VERIFIED" && statement.trim() !== finalStatement(claim, review) && <button type="submit" className="button button-primary" disabled={busy || !statement.trim()}>Save wording</button>}
        {claim.status === "CONFLICT" && <button type="submit" className="button button-primary" disabled={busy || !statement.trim() || statement.trim() === claim.statement}>Resolve and save</button>}
        {claim.status === "MISSING EVIDENCE" && statement.trim() !== finalStatement(claim, review) && <button type="submit" className="button button-primary" disabled={busy || !statement.trim()}>Save reviewer wording</button>}
        {claim.status === "MISSING EVIDENCE" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => onDecision(claim.id, "accepted-uncertainty")}>Keep gap visible</button>}
        {claim.status === "CONFLICT" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => onDecision(claim.id, "accepted-uncertainty")}>Leave conflict unresolved</button>}
        {claim.status === "VERIFIED" && <button type="button" className="button button-quiet" disabled={busy} onClick={() => onDecision(claim.id, "accepted-uncertainty")}>Accept with caveat</button>}
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => onDecision(claim.id, "rejected")}>Exclude from handover</button>
      </div>
    </> : <div className="decision-summary">
      <p>{review?.disposition === "confirmed" ? "You confirmed this finding." : review?.disposition === "resolved" ? "You saved revised handover wording." : review?.disposition === "rejected" ? "This finding is excluded from the handover." : "You chose to keep the evidence status visible."}</p>
      {review?.editedStatement && <blockquote>{review.editedStatement}</blockquote>}
      <button type="button" className="button button-quiet" disabled={busy} onClick={() => onDecision(claim.id, "pending", review?.editedStatement)}>Reopen review</button>
    </div>}
  </form>
  {pending && claim.status === "MISSING EVIDENCE" && canReview && onInterview && <ExitInterview claim={claim} busy={busy} onSubmit={onInterview} />}
  {history.length > 0 && <section className="decision-history" aria-labelledby="decision-history-title">
    <div className="decision-history-heading"><div><p className="panel-kicker">PROJECT RECORD</p><h4 id="decision-history-title">Decision history</h4></div><span>{history.length} {history.length === 1 ? "entry" : "entries"}</span></div>
    <ol>{history.map((entry, index) => <li key={`${entry.claimVersion}-${entry.createdAt}-${index}`}>
      <div className="decision-history-line"><strong>{decisionLabels[entry.disposition]}</strong><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></div>
      <p>{entry.actorLabel ?? "Project reviewer"} · finding version {entry.claimVersion}</p>
      {entry.editedStatement && <blockquote>{entry.editedStatement}</blockquote>}
      {entry.note && <p className="decision-history-note">{entry.note}</p>}
    </li>)}</ol>
  </section>}</div>;
}

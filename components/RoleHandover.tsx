import type { Claim, ClaimReview, Role } from "@/lib/domain/types";
import { finalStatement } from "@/lib/domain/workflow";
import { StatusBadge } from "./ClaimQueue";
import { Icon } from "./icons";

export function RoleHandover({ claims, reviews, role, acknowledgedAt, onAcknowledge }: {
  claims: Claim[];
  reviews: Record<string, ClaimReview>;
  role: Role;
  acknowledgedAt?: string;
  onAcknowledge: () => void;
}) {
  const included = claims.filter((claim) => reviews[claim.id]?.disposition !== "rejected");
  const weekPlan = [
    { label: "Day 1", title: "Orient to decisions and owners", claims: included.filter((claim) => claim.category === "decision" || claim.category === "ownership") },
    { label: "Days 2–3", title: "Validate open risks and blockers", claims: included.filter((claim) => claim.category === "blocker" || claim.category === "risk") },
    { label: "Days 4–7", title: "Move the recorded next actions", claims: included.filter((claim) => claim.category === "next-action") },
  ];
  return <section className="handover-view" aria-labelledby="handover-title">
    <div className="handover-banner stage-page-heading"><div className="handover-icon"><Icon name="layers" /></div>
      <div><h2 id="handover-title">Your teammate’s starting point</h2><p>Approved Project Chronos handover. Findings retain their source and review status.</p></div>
      <span className="role-pill">{role === "contributor" ? "Incoming contributor" : "Project lead"}</span>
    </div>
    <section className="first-week-plan" aria-labelledby="first-week-title"><div className="first-week-heading"><div><span>FROM APPROVED PROJECT EVIDENCE</span><h3 id="first-week-title">Your first 7 days</h3><p>Suggested sequence from the recorded decisions, owners, blockers, and actions. RelayOps does not invent dates or assign owners.</p></div><strong>{included.length} findings</strong></div>
      <div className="first-week-grid">{weekPlan.map((stage) => <section className="first-week-stage" key={stage.label}><span className="first-week-day">{stage.label}</span><h4>{stage.title}</h4>
        {stage.claims.length ? <ul className="record-scroll" tabIndex={0} aria-label={`${stage.label} handover findings`}>{stage.claims.map((claim) => <li key={claim.id}><p>{finalStatement(claim, reviews[claim.id])}</p>{claim.ownerName && <span className="first-week-owner">Owner · {claim.ownerName}</span>}<div><StatusBadge status={claim.status} />{claim.citations[0] && <small>{claim.citations[0].sourceTitle}</small>}</div></li>)}</ul> : <p className="first-week-empty">No approved findings recorded for this part of the week.</p>}
      </section>)}</div>
    </section>
    <details className="handover-all"><summary><span>All project findings</span><span>{included.length} source-linked findings</span></summary><div className="handover-all-content record-scroll" role="region" tabIndex={0} aria-label="All project findings">
      {included.map((claim) => <article className="handover-claim" key={claim.id}><div className="handover-claim-content"><div className="handover-claim-meta"><span className="category-label">{claim.category.replaceAll("-", " ")}</span><StatusBadge status={claim.status} /></div><p>{finalStatement(claim, reviews[claim.id])}</p>
          {reviews[claim.id]?.disposition === "accepted-uncertainty" && <p className="uncertainty-note">{claim.status === "VERIFIED" ? "Reviewer accepted this finding with a caveat." : claim.status === "CONFLICT" ? "Reviewer left the source disagreement unresolved." : "Reviewer left this evidence gap unresolved."}</p>}
          {reviews[claim.id]?.disposition === "resolved" && claim.status === "CONFLICT" && <p className="resolution-note">Reviewer saved wording. Source disagreement remains available in the cited records.</p>}
          {reviews[claim.id]?.disposition === "resolved" && claim.status === "MISSING EVIDENCE" && <p className="uncertainty-note">Reviewer added wording. The underlying evidence gap remains open.</p>}
          <div className="handover-citations">{claim.citations.map((citation) => <span key={citation.sourceId}>{citation.sourceTitle} <b className="mono">{citation.sourceId}</b></span>)}</div>
        </div></article>)}
    </div></details>
    <div className={`receipt-panel ${acknowledgedAt ? "acknowledged" : ""}`}><div><h3>{acknowledgedAt ? "Receipt recorded" : "Confirm receipt"}</h3><p>{acknowledgedAt ? `Acknowledged ${new Date(acknowledgedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}` : "Record that the incoming teammate received this continuation plan."}</p></div>
      {!acknowledgedAt && <button type="button" className="button button-primary" onClick={onAcknowledge}>Acknowledge handover <Icon name="arrow" /></button>}
    </div>
  </section>;
}

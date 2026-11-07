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
  const actions = included.filter((claim) => claim.category === "next-action" || claim.category === "blocker");
  return <section className="handover-view" aria-labelledby="handover-title">
    <div className="handover-banner"><div className="handover-icon"><Icon name="layers" /></div>
      <div><p className="panel-kicker">Approved continuation plan</p><h2 id="handover-title">Your first steps in Project Chronos</h2><p>Claims below retain their source and review status. Unresolved evidence stays visible.</p></div>
      <span className="role-pill">{role === "contributor" ? "Incoming contributor" : "Project lead"}</span>
    </div>
    {actions.length > 0 && <div className="handover-actions"><div className="section-title-row"><h3>Start here</h3><span>{actions.length} actions and blockers</span></div>
      {actions.map((claim, index) => <article className="action-row" key={claim.id}><span className="action-number">{String(index + 1).padStart(2, "0")}</span><div><p>{finalStatement(claim, reviews[claim.id])}</p><span>{claim.citations.map((citation) => citation.sourceId).join(" · ")}</span></div><StatusBadge status={claim.status} /></article>)}
    </div>}
    <div className="handover-all"><div className="section-title-row"><h3>Project state</h3><span>{included.length} findings</span></div>
      {included.map((claim) => <article className="handover-claim" key={claim.id}><div className="handover-claim-content"><div className="handover-claim-meta"><span className="category-label">{claim.category.replaceAll("-", " ")}</span><StatusBadge status={claim.status} /></div><p>{finalStatement(claim, reviews[claim.id])}</p>
          {reviews[claim.id]?.disposition === "accepted-uncertainty" && <p className="uncertainty-note">{claim.status === "VERIFIED" ? "Reviewer accepted this finding with a caveat." : claim.status === "CONFLICT" ? "Reviewer left the source disagreement unresolved." : "Reviewer left this evidence gap unresolved."}</p>}
          {reviews[claim.id]?.disposition === "resolved" && claim.status === "CONFLICT" && <p className="resolution-note">Reviewer saved wording. Source disagreement remains available in the cited records.</p>}
          {reviews[claim.id]?.disposition === "resolved" && claim.status === "MISSING EVIDENCE" && <p className="uncertainty-note">Reviewer added wording. The underlying evidence gap remains open.</p>}
          <div className="handover-citations">{claim.citations.map((citation) => <span key={citation.sourceId}>{citation.sourceTitle} <b className="mono">{citation.sourceId}</b></span>)}</div>
        </div></article>)}
    </div>
    <div className={`receipt-panel ${acknowledgedAt ? "acknowledged" : ""}`}><div><h3>{acknowledgedAt ? "Receipt recorded" : "Confirm receipt"}</h3><p>{acknowledgedAt ? `Acknowledged ${new Date(acknowledgedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}` : "Record that the incoming teammate received this continuation plan."}</p></div>
      {!acknowledgedAt && <button type="button" className="button button-primary" onClick={onAcknowledge}>Acknowledge handover <Icon name="arrow" /></button>}
    </div>
  </section>;
}

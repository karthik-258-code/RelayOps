import type { Claim } from "@/lib/domain/types";
import { StatusBadge } from "./ClaimQueue";
import { Icon } from "./icons";

export function EvidenceInspector({ claim }: { claim: Claim | null }) {
  if (!claim) return <aside className="evidence-panel empty-evidence"><Icon name="file" /><h2>Select a finding</h2><p>Source evidence and review actions appear here.</p></aside>;
  return <aside className="evidence-panel" aria-labelledby="evidence-title">
    <div className="evidence-heading">
      <div><p className="panel-kicker">Finding detail</p><h2 id="evidence-title">Evidence and decision</h2></div>
      <StatusBadge status={claim.status} />
    </div>
    <div className="evidence-summary">
      <span className="category-label">{claim.category.replaceAll("-", " ")}</span>
      <h3>{claim.statement}</h3>
      {claim.status === "CONFLICT" && <div className="conflict-explainer"><strong>Sources disagree.</strong> RelayOps does not choose a winner. Compare dated evidence and record a reviewer decision.</div>}
      {claim.status === "MISSING EVIDENCE" && <div className="missing-explainer"><strong>Evidence gap.</strong> Available records point to this area, but do not explain its current state.</div>}
    </div>
    <div className="source-section-title"><h3>Supporting records</h3><span>{claim.citations.length} source{claim.citations.length === 1 ? "" : "s"}</span></div>
    <div className="citation-list">
      {claim.citations.map((citation) => <article className="citation-card" key={citation.sourceId}>
        <div className="citation-meta"><span className="source-kind">{citation.sourceKind}</span><time dateTime={citation.occurredAt}>{new Date(citation.occurredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</time></div>
        <h4>{citation.sourceTitle}</h4>
        <blockquote>{citation.excerpt}</blockquote>
        {citation.sourceUrl && <a className="citation-source-link" href={citation.sourceUrl} target="_blank" rel="noreferrer">Open original source <span aria-hidden="true">↗</span></a>}
        <div className="citation-footer"><span className="mono">{citation.sourceId}</span><span>By {citation.author}</span></div>
      </article>)}
    </div>
  </aside>;
}

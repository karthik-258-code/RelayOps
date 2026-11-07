import type { Claim, ClaimReview, ClaimCategory, EvidenceStatus } from "@/lib/domain/types";
import { finalStatement } from "@/lib/domain/workflow";

const filters: Array<{ key: ClaimCategory | "all"; label: string }> = [
  { key: "all", label: "All findings" }, { key: "decision", label: "Decisions" },
  { key: "blocker", label: "Blockers" }, { key: "risk", label: "Risks" },
  { key: "ownership", label: "Ownership" }, { key: "next-action", label: "Next actions" },
];

const statusLabels: Record<EvidenceStatus, string> = {
  VERIFIED: "Supported by evidence",
  CONFLICT: "Conflicting sources",
  "MISSING EVIDENCE": "Evidence gap",
};

export function StatusBadge({ status }: { status: EvidenceStatus }) {
  return <span className={`status-badge ${status === "VERIFIED" ? "verified" : status === "CONFLICT" ? "conflict" : "missing"}`}><span className="badge-dot" />{statusLabels[status]}</span>;
}

export function ClaimQueue({ claims, reviews, selectedId, filter, onFilter, onSelect }: {
  claims: Claim[];
  reviews: Record<string, ClaimReview>;
  selectedId: string;
  filter: ClaimCategory | "all";
  onFilter: (filter: ClaimCategory | "all") => void;
  onSelect: (id: string) => void;
}) {
  const filtered = claims.filter((claim) => filter === "all" || claim.category === filter);
  return <section className="queue-panel" aria-labelledby="queue-title">
    <div className="queue-heading">
      <div><h2 id="queue-title">Project findings</h2><p>Choose a finding to inspect its sources.</p></div>
      <span className="count-chip">{filtered.length} shown</span>
    </div>
    <div className="filter-row" aria-label="Filter findings">
      {filters.map((item) => <button type="button" key={item.key} className={`filter-chip ${filter === item.key ? "selected" : ""}`} onClick={() => onFilter(item.key)}>{item.label}</button>)}
    </div>
    <ul className="claim-list">
      {filtered.map((claim) => {
        const review = reviews[claim.id];
        const selected = claim.id === selectedId;
        return <li key={claim.id}>
          <button type="button" className={`claim-row ${selected ? "selected" : ""}`} onClick={() => onSelect(claim.id)} aria-pressed={selected}>
            <div className="claim-row-top"><span className="category-label">{claim.category.replaceAll("-", " ")}</span><StatusBadge status={claim.status} /></div>
            <span className="claim-statement">{finalStatement(claim, review)}</span>
            <span className="claim-meta">{claim.citations.length} source{claim.citations.length === 1 ? "" : "s"}
              <span className={`review-meta ${review?.disposition !== "pending" ? "done" : ""}`}>{review?.disposition === "pending" ? "Needs decision" : review?.disposition === "rejected" ? "Excluded" : "Reviewed"}</span>
            </span>
          </button>
        </li>;
      })}
      {!filtered.length && <li className="empty-filter">No findings in this category.</li>}
    </ul>
  </section>;
}

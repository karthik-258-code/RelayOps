import type { Claim, ClaimCategory, SourceRecord } from "@/lib/domain/types";
import { useState } from "react";
import { StatusBadge } from "./ClaimQueue";

const categoryLabels: Record<ClaimCategory, string> = {
  decision: "Decisions",
  ownership: "Ownership",
  blocker: "Blockers",
  risk: "Risks",
  "next-action": "Next actions",
};

export function ReconstructView({ claims, sources, onContinue, onExtract, onOpenFinding, extracting, extractionMode }: {
  claims: Claim[];
  sources: SourceRecord[];
  onContinue: () => void;
  onExtract: () => void;
  onOpenFinding: (claimId: string) => void;
  extracting: boolean;
  extractionMode: 'gemini' | 'deterministic';
}) {
  const categories = (Object.keys(categoryLabels) as ClaimCategory[]).map((category) => ({
    category,
    count: claims.filter((claim) => claim.category === category).length,
  }));
  const linkedCount = claims.filter((claim) => claim.citations.length > 0).length;
  const decisions = claims.filter((claim) => claim.category === "decision").sort((a, b) => (a.citations[0]?.occurredAt ?? "").localeCompare(b.citations[0]?.occurredAt ?? ""));
  const ownership = claims.filter((claim) => claim.category === "ownership");
  const blockersAndRisks = claims.filter((claim) => claim.category === "blocker" || claim.category === "risk");
  const nextActions = claims.filter((claim) => claim.category === "next-action");

  function renderFindings(items: Claim[], variant: "timeline" | "owner" | "standard") {
    if (!items.length) return <p className="reconstruction-empty">No structured evidence in this category yet.</p>;
    return <ul className={`reconstruction-list ${variant}`}>
      {items.map((claim) => {
        const date = claim.citations.map((citation) => citation.occurredAt).filter(Boolean).sort().at(-1);
        return <li key={claim.id}>
          {variant === "owner" && <strong className="reconstruction-owner">{claim.ownerName ?? "Owner needs confirmation"}</strong>}
          {variant === "timeline" && date && <time dateTime={date}>{new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</time>}
          <p>{claim.statement}</p>
          <div className="reconstruction-entry-meta"><StatusBadge status={claim.status} /><span>{claim.citations.map((citation) => citation.sourceTitle).filter((title, index, all) => all.indexOf(title) === index).join(" · ") || "No source citation"}</span></div>
          <button type="button" className="text-action" onClick={() => onOpenFinding(claim.id)}>Inspect finding <span aria-hidden="true">→</span></button>
        </li>;
      })}
    </ul>;
  }

  return <section className="stage-page reconstruct-page" aria-labelledby="reconstruct-title">
    <div className="stage-page-heading"><div><h2 id="reconstruct-title">What the project records say</h2><p>{extractionMode === 'gemini' ? 'Gemini extracted these findings from stored passages. Every finding has a quote checked against its source; it does not decide which source is right.' : 'RelayOps groups structured observations and preserves their citations. This deterministic pass does not invent context or decide which source is right.'}</p></div><div className="stage-totals"><strong>{claims.length}</strong><span>findings formed from</span><strong>{sources.length}</strong><span>source records</span></div></div>
    <div className="reconstruct-body">
      <div className="category-ledger" aria-label="Findings by category">
        <div className="ledger-heading"><span>FINDING GROUPS</span><span>{claims.length} TOTAL</span></div>
        {categories.map(({ category, count }) => <div className="ledger-row" key={category}><span>{categoryLabels[category]}</span><strong>{count}</strong><span className="ledger-rule" /></div>)}
      </div>
      <div className="source-trail">
        <div className="ledger-heading"><span>HOW THE TRAIL STAYS INTACT</span><span>TRACEABLE</span></div>
        <div className="trail-flow"><div className="trail-node"><span className="trail-node-mark">A</span><div><strong>Project records</strong><small>{sources.length} local sources</small></div></div><span className="trail-connector" aria-hidden="true" /><div className="trail-node"><span className="trail-node-mark">B</span><div><strong>Grouped findings</strong><small>{linkedCount} with source citations</small></div></div><span className="trail-connector" aria-hidden="true" /><div className="trail-node trail-human"><span className="trail-node-mark">C</span><div><strong>Human review</strong><small>No finding is approved automatically</small></div></div></div>
        <p className="trail-note">When sources disagree, both citations remain with the finding. When evidence is missing, RelayOps labels the gap instead of filling it in.</p>
      </div>
    </div>
    <div className="reconstruction-panels" aria-label="Handover reconstruction">
      <section className="reconstruction-panel" aria-labelledby="decision-timeline-title"><div className="reconstruction-panel-heading"><div><span>01 / DECISIONS</span><h3 id="decision-timeline-title">Decision timeline</h3></div><strong>{decisions.length}</strong></div>{renderFindings(decisions, "timeline")}</section>
      <section className="reconstruction-panel" aria-labelledby="ownership-map-title"><div className="reconstruction-panel-heading"><div><span>02 / PEOPLE</span><h3 id="ownership-map-title">Ownership map</h3></div><strong>{ownership.length}</strong></div>{renderFindings(ownership, "owner")}</section>
      <section className="reconstruction-panel" aria-labelledby="active-risks-title"><div className="reconstruction-panel-heading"><div><span>03 / OPEN CONTEXT</span><h3 id="active-risks-title">Active blockers &amp; risks</h3></div><strong>{blockersAndRisks.length}</strong></div>{renderFindings(blockersAndRisks, "standard")}</section>
      <section className="reconstruction-panel" aria-labelledby="next-actions-title"><div className="reconstruction-panel-heading"><div><span>04 / FOLLOW-THROUGH</span><h3 id="next-actions-title">Next actions</h3></div><strong>{nextActions.length}</strong></div>{renderFindings(nextActions, "standard")}</section>
    </div>
    <div className="stage-page-footer"><span>{extractionMode === 'gemini' ? 'Model output stays unapproved until a human reviews it.' : 'Structured checks are available now; Gemini extraction requires a configured key and available quota.'}</span><div className="reconstruct-actions">{sources.length > 0 && <button className="button button-secondary" type="button" onClick={onExtract} disabled={extracting}>{extracting ? 'Checking citations…' : extractionMode === 'gemini' ? 'Run Gemini again' : 'Run Gemini extraction'} <span aria-hidden="true">✳</span></button>}<button className="button button-primary" type="button" onClick={onContinue}>Check conflicts and gaps <span aria-hidden="true">→</span></button></div></div>
  </section>;
}

export function VerifyView({ conflicts, gaps, projectId, onOpenReview, onOpenClaim }: {
  conflicts: Claim[];
  gaps: Claim[];
  projectId: string;
  onOpenReview: () => void;
  onOpenClaim: (claimId: string) => void;
}) {
  const total = conflicts.length + gaps.length;
  return <section className="stage-page verify-page" aria-labelledby="verify-title">
    <div className="stage-page-heading verify-heading"><div><h2 id="verify-title">Where context needs a closer look</h2><p>These findings carry conflicting records or lack enough evidence. Inspect the linked sources, then make or record a decision in Review.</p></div><div className="verify-total"><strong>{total}</strong><span>items to inspect</span></div></div>
    <div className="verify-groups">
      <section className="verify-group" aria-labelledby="conflict-list-title"><div className="verify-group-head"><h3 id="conflict-list-title">Conflicting records</h3><span className="verify-count conflict-count">{conflicts.length}</span></div>
        {conflicts.length ? <ul>{conflicts.map((claim) => <li key={claim.id}><button type="button" onClick={() => onOpenClaim(claim.id)}><span><strong>{claim.topic.replaceAll("-", " ")}</strong><small>{claim.citations.length} sources · {claim.category.replaceAll("-", " ")}</small></span><span className="verify-row-status">Compare sources <b aria-hidden="true">→</b></span></button><p>{claim.statement}</p></li>)}</ul> : <p className="verify-empty">No conflicting findings in this workspace.</p>}
      </section>
      <section className="verify-group" aria-labelledby="gap-list-title"><div className="verify-group-head"><h3 id="gap-list-title">Missing evidence</h3><span className="verify-count gap-count">{gaps.length}</span></div>
        {gaps.length ? <ul>{gaps.map((claim) => <li key={claim.id}><button type="button" onClick={() => onOpenClaim(claim.id)}><span><strong>{claim.topic.replaceAll("-", " ")}</strong><small>{claim.citations.length} source{claim.citations.length === 1 ? "" : "s"} · {claim.category.replaceAll("-", " ")}</small></span><span className="verify-row-status">Inspect finding <b aria-hidden="true">→</b></span></button><p>{claim.statement}</p></li>)}</ul> : <p className="verify-empty">No evidence gaps in this workspace.</p>}
      </section>
    </div>
    <EvidenceSearch projectId={projectId} />
    <div className="stage-page-footer"><span>Verification highlights attention; the project lead still decides.</span><button className="button button-primary" type="button" onClick={onOpenReview}>Open review queue <span aria-hidden="true">→</span></button></div>
  </section>;
}

type SearchResult = { passage_id: string; source_title: string; source_url: string | null; occurred_at: string | null; passage_content: string; similarity: number };

function EvidenceSearch({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setResults([]);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.trim() }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Evidence search could not run.");
      const matches = Array.isArray(payload.results) ? payload.results as SearchResult[] : [];
      setResults(matches);
      setStatus(matches.length ? `${matches.length} evidence passages found.` : "No matching passages yet. Check whether Gemini extraction has created embeddings.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Evidence search could not run."); }
    setBusy(false);
  }

  return <section className="evidence-search" aria-labelledby="evidence-search-title">
    <div><h3 id="evidence-search-title">Search the source record</h3><p>Ask a question to find the closest stored passages. Results respect your project clearance and link back to their source. Requires Gemini setup and passage embeddings from Reconstruct.</p></div>
    <form onSubmit={search}><label htmlFor="evidence-query">Evidence question</label><div className="evidence-search-controls"><input id="evidence-query" value={query} onChange={(event) => setQuery(event.target.value)} minLength={3} maxLength={1000} placeholder="Who owns the database migration?" required /><button className="button button-primary" disabled={busy || query.trim().length < 3}>{busy ? "Searching…" : "Search evidence"}</button></div></form>
    {status && <p className="evidence-search-status" role="status">{status}</p>}
    {results.length > 0 && <ol className="evidence-search-results">{results.map((result) => <li key={result.passage_id}><div><strong>{result.source_title}</strong><span>{Math.round(result.similarity * 100)}% semantic match{result.occurred_at ? ` · ${new Date(result.occurred_at).toLocaleDateString()}` : ""}</span></div><p>{result.passage_content}</p>{result.source_url && <a href={result.source_url} target="_blank" rel="noreferrer">Open source record</a>}</li>)}</ol>}
    {status.startsWith("No matching") && <p className="evidence-search-empty">Try a broader question, or check that passages have been embedded through Gemini extraction.</p>}
  </section>;
}

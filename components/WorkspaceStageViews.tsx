import type { Claim, ClaimCategory, SourceRecord } from "@/lib/domain/types";
import { useState } from "react";

const categoryLabels: Record<ClaimCategory, string> = {
  decision: "Decisions",
  ownership: "Ownership",
  blocker: "Blockers",
  risk: "Risks",
  "next-action": "Next actions",
};

export function ReconstructView({ claims, sources, onContinue, onExtract, extracting, extractionMode, importedSourceCount }: {
  claims: Claim[];
  sources: SourceRecord[];
  onContinue: () => void;
  onExtract: () => void;
  extracting: boolean;
  extractionMode: 'gemini' | 'deterministic';
  importedSourceCount: number;
}) {
  const categories = (Object.keys(categoryLabels) as ClaimCategory[]).map((category) => ({
    category,
    count: claims.filter((claim) => claim.category === category).length,
  }));
  const linkedCount = claims.filter((claim) => claim.citations.length > 0).length;

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
    <div className="stage-page-footer"><span>{extractionMode === 'gemini' ? 'Model output stays unapproved until a human reviews it.' : 'Connect records to run Gemini extraction; structured local checks are still available.'}</span><div className="reconstruct-actions">{importedSourceCount > 0 && <button className="button button-secondary" type="button" onClick={onExtract} disabled={extracting}>{extracting ? 'Checking citations…' : extractionMode === 'gemini' ? 'Run Gemini again' : 'Run Gemini extraction'} <span aria-hidden="true">✳</span></button>}<button className="button button-primary" type="button" onClick={onContinue}>Check conflicts and gaps <span aria-hidden="true">→</span></button></div></div>
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

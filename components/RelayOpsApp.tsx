"use client";

import { useEffect, useState } from "react";
import { ClaimQueue } from "./ClaimQueue";
import { ClaimReview } from "./ClaimReview";
import { EvidenceInspector } from "./EvidenceInspector";
import { Icon } from "./icons";
import { ImportSources } from "./ImportSources";
import { RoleHandover } from "./RoleHandover";
import { WorkflowHeader } from "./WorkflowHeader";
import type { ClaimCategory, ClaimReview as ClaimReviewData, HandoverState, Role, SourceRecord } from "@/lib/domain/types";
import { projectChronosSources } from "@/lib/domain/project";
import { browserStorageAvailable, clearSavedWorkspace, readSavedWorkspace, saveWorkspace } from "@/lib/domain/storage";
import { createInitialReviews, canApprove, pendingReviewCount } from "@/lib/domain/workflow";
import { reconstructWorkspace } from "@/lib/reconstruction/reconstruct";
import { projectForRole } from "@/lib/security/project-role-view";

function createDemoState(): HandoverState {
  const claims = reconstructWorkspace(projectChronosSources);
  return { schemaVersion: 1, sources: projectChronosSources, claims, reviews: createInitialReviews(claims), importedNames: [] };
}

const statusLabels = ["VERIFIED", "CONFLICT", "MISSING EVIDENCE"] as const;

export function RelayOpsApp() {
  const [project, setProject] = useState<HandoverState>(createDemoState);
  const [selectedId, setSelectedId] = useState("claim-session-store");
  const [filter, setFilter] = useState<ClaimCategory | "all">("all");
  const [role, setRole] = useState<Role>("contributor");
  const [activeStage, setActiveStage] = useState(3);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [storageWarning, setStorageWarning] = useState("");
  const [storageNotice, setStorageNotice] = useState("");

  useEffect(() => {
    const available = browserStorageAvailable();
    setStorageAvailable(available);
    const saved = available ? readSavedWorkspace() : null;
    if (saved) {
      setProject(saved);
      if (saved.claims[0]) setSelectedId(saved.claims[0].id);
      setActiveStage(saved.approvedAt ? 4 : 3);
    }
    if (!available) setStorageWarning("This browser blocks local storage. Changes will last only while this tab stays open.");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && storageAvailable && !saveWorkspace(project)) {
      setStorageAvailable(false);
      setStorageWarning("This browser cannot save workspace data. Changes will last only while this tab stays open.");
    }
  }, [project, ready, storageAvailable]);

  const selectedClaim = project.claims.find((claim) => claim.id === selectedId) ?? project.claims[0] ?? null;
  const pending = pendingReviewCount(project.claims, project.reviews);
  const roleView = projectForRole(project, role);
  const counts = Object.fromEntries(statusLabels.map((status) => [status, project.claims.filter((claim) => claim.status === status).length])) as Record<typeof statusLabels[number], number>;

  function importSources(newSources: SourceRecord[], names: string[]) {
    const currentIds = new Set(project.sources.map((source) => source.id));
    const duplicate = newSources.find((source) => currentIds.has(source.id));
    if (duplicate) throw new Error(`Source ID “${duplicate.id}” already exists. Change the ID in the file and retry.`);
    const sources = [...project.sources, ...newSources];
    const claims = reconstructWorkspace(sources);
    setProject({ schemaVersion: 1, sources, claims, reviews: createInitialReviews(claims), importedNames: [...project.importedNames, ...names] });
    setSelectedId(claims[0]?.id ?? "");
    setFilter("all");
    setActiveStage(3);
  }

  function approve() {
    if (!canApprove(project)) return;
    const approvedAt = new Date().toISOString();
    setProject((current) => ({ ...current, approvedAt, acknowledgedAt: undefined }));
    setRole("contributor");
    setActiveStage(4);
  }

  function resetDemo() {
    const confirmed = window.confirm("Reset this workspace to Project Chronos? Imported files and reviewer decisions will be removed from this browser.");
    if (!confirmed) return;
    clearSavedWorkspace();
    setProject(createDemoState());
    setSelectedId("claim-session-store");
    setFilter("all");
    setRole("contributor");
    setActiveStage(3);
    setStorageNotice("Workspace reset to the synthetic Project Chronos sample.");
  }

  function setReview(id: string, review: ClaimReviewData) {
    setProject((current) => ({ ...current, approvedAt: undefined, acknowledgedAt: undefined, reviews: { ...current.reviews, [id]: review } }));
  }

  function handleStageChange(stage: number) {
    if (stage === 4 && !project.approvedAt) {
      setStorageNotice("Review every finding and approve the handover before opening the incoming view.");
      setActiveStage(3);
      return;
    }
    setStorageNotice("");
    setActiveStage(stage);
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand-lockup" href="#top" aria-label="RelayOps home"><span className="brand-mark">R</span><span>Relay<span className="brand-light">Ops</span></span></a>
      <div className="topbar-right"><span className="workspace-label"><span className="online-dot" />Local workspace</span>
        {project.approvedAt && <label className="role-select-label">View as <select aria-label="Handover role" value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="contributor">Incoming contributor</option><option value="project-lead">Project lead</option></select></label>}
        <button className="icon-button" type="button" onClick={resetDemo} aria-label="Reset workspace to sample" title="Reset to sample"><Icon name="refresh" /></button>
      </div>
    </header>
    <main id="top" className="page-wrap">
      <WorkflowHeader project={project} activeStage={activeStage} onStageChange={handleStageChange} />
      {!storageAvailable && <p className="notice-line storage-warning" role="status">{storageWarning || "Browser storage is unavailable. Changes stay in this tab only."}</p>}
      {storageNotice && <p className="notice-line" role="status">{storageNotice}</p>}
      {activeStage === 0 ? <section className="connect-view">
        <div className="connect-intro"><div><p className="panel-kicker">Stage 01 · Connect</p><h2>Choose authorised project sources</h2><p>Start with the synthetic Project Chronos workspace, or add local Markdown and RelayOps JSON records.</p></div><ImportSources onImport={importSources} /></div>
        <div className="source-safety"><Icon name="lock" /><p><strong>Use synthetic, public, or permissioned material.</strong> This demo stores imported files in this browser. Do not add confidential data.</p></div>
        <div className="source-table-wrap"><div className="section-title-row"><h3>Connected sources</h3><span>{project.sources.length} records</span></div><div className="source-table" role="table" aria-label="Connected project sources"><div className="source-table-header" role="row"><span role="columnheader">Source</span><span role="columnheader">Type</span><span role="columnheader">Updated</span><span role="columnheader">Access</span></div>
          {project.sources.map((source) => <div className="source-table-row" role="row" key={source.id}><div role="cell"><span className="file-icon"><Icon name="file" /></span><span><strong>{source.title}</strong><small className="mono">{source.id}</small></span></div><span role="cell">{source.kind}</span><time role="cell" dateTime={source.occurredAt}>{new Date(source.occurredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</time><span role="cell" className={`tier-label tier-${source.clearance}`}>Tier {source.clearance}</span></div>)}
        </div></div>
      </section> : activeStage === 4 && project.approvedAt ? <>
        {roleView.restrictedCount > 0 && role === "contributor" && <div className="redaction-notice"><Icon name="lock" /><span>{roleView.restrictedCount} item{roleView.restrictedCount === 1 ? " is" : "s are"} restricted for this role. Ask your project lead for access.</span></div>}
        <RoleHandover claims={roleView.claims} reviews={project.reviews} role={role} acknowledgedAt={project.acknowledgedAt} onAcknowledge={() => setProject((current) => ({ ...current, acknowledgedAt: new Date().toISOString() }))} />
      </> : <>
        {activeStage === 1 && <div className="stage-context"><span>Stage 02 · Reconstruct</span><p>RelayOps groups project records into decisions, ownership, blockers, risks, and next actions.</p></div>}
        {activeStage === 2 && <div className="stage-context"><span>Stage 03 · Verify</span><p>Compare source excerpts. Conflicts and evidence gaps stay visible until a reviewer decides.</p></div>}
        {activeStage === 3 && <div className="stage-context"><span>Stage 04 · Review</span><p>Confirm supported findings, resolve disagreements, or keep uncertainty visible.</p></div>}
        <div className="summary-strip" aria-label="Workspace summary">
          <div className="summary-item"><strong>{project.sources.length}</strong><span>Sources connected</span></div>
          <div className="summary-item"><strong>{project.claims.length}</strong><span>Project findings</span></div>
          <div className="summary-item summary-attention"><strong>{counts.CONFLICT}</strong><span>Conflicts</span></div>
          <div className="summary-item summary-attention"><strong>{counts["MISSING EVIDENCE"]}</strong><span>Evidence gaps</span></div>
          <div className="summary-review"><Icon name="clock" /><span>{pending ? `${pending} findings need a decision` : "All findings reviewed"}</span></div>
        </div>
        <div className="workspace-actions"><div><span className="source-set-name"><Icon name="layers" />Project Chronos</span><span className="source-set-meta">Synthetic multi-source workspace{project.importedNames.length ? ` · ${project.importedNames.length} imported file${project.importedNames.length === 1 ? "" : "s"}` : ""}</span></div><ImportSources onImport={importSources} /></div>
        <div className="privacy-note"><Icon name="lock" /><span>Local-only demo. Import only synthetic, public, or authorised records. <button type="button" onClick={() => setActiveStage(0)}>Review sources</button></span></div>
        <div className="review-layout">
          <ClaimQueue claims={project.claims} reviews={project.reviews} selectedId={selectedClaim?.id ?? ""} filter={filter} onFilter={setFilter} onSelect={setSelectedId} />
          <div className="detail-column"><EvidenceInspector claim={selectedClaim} />
            <ClaimReview key={selectedClaim?.id ?? "empty"} claim={selectedClaim} review={selectedClaim ? project.reviews[selectedClaim.id] : undefined} onDecision={(id, disposition, editedStatement) => {
              const existing: ClaimReviewData = { disposition, ...(editedStatement ? { editedStatement } : {}) };
              setReview(id, existing);
              if (disposition === "pending") setActiveStage(3);
            }} />
          </div>
        </div>
        <div className="approval-bar"><div><span className={`approval-indicator ${pending ? "waiting" : "ready"}`} />
            <div><strong>{pending ? `${pending} decisions remaining` : "Ready to hand over"}</strong><span>{pending ? "Review every finding to create the approved snapshot." : "Review complete. Incoming view stays hidden until you approve."}</span></div>
          </div><button type="button" className="button button-primary" disabled={!canApprove(project)} onClick={approve}>Approve handover <Icon name="arrow" /></button>
        </div>
      </>}
      <footer className="app-footer"><span>RelayOps demo · Project Chronos</span><span>Evidence first. Reviewed by humans.</span></footer>
    </main>
  </div>;
}

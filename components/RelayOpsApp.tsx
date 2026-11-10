"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClaimQueue } from "./ClaimQueue";
import { ClaimReview } from "./ClaimReview";
import { EvidenceInspector } from "./EvidenceInspector";
import { Icon } from "./icons";
import { ImportSources } from "./ImportSources";
import { GitHubImport } from "./GitHubImport";
import { RoleHandover } from "./RoleHandover";
import { WorkflowHeader } from "./WorkflowHeader";
import { SignOutButton } from "./SignOutButton";
import { ReconstructView, VerifyView } from "./WorkspaceStageViews";
import type { ClaimCategory, HandoverState, ReviewHistoryEntry, Role, SourceRecord } from "@/lib/domain/types";
import { canApprove, pendingReviewCount } from "@/lib/domain/workflow";
import { projectForRole } from "@/lib/security/project-role-view";
import { consumeExtractionResponse, type ExtractionProgressEvent } from "@/lib/extraction/progress";

const emptyState: HandoverState = { schemaVersion: 1, sources: [], claims: [], reviews: {}, importedNames: [] };

const statusLabels = ["VERIFIED", "CONFLICT", "MISSING EVIDENCE"] as const;

export function RelayOpsApp({ projectId, projectName: initialProjectName, accessRole, clearance }: { projectId: string; projectName: string; accessRole: 'lead' | 'reviewer' | 'contributor'; clearance: 1 | 2 | 3 }) {
  const [project, setProject] = useState<HandoverState>(emptyState);
  const [projectName, setProjectName] = useState(initialProjectName);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<ClaimCategory | "all">("all");
  const [role, setRole] = useState<Role>(accessRole === 'lead' ? 'project-lead' : 'contributor');
  const [activeStage, setActiveStage] = useState(0);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [claimVersions, setClaimVersions] = useState<Record<string, number>>({});
  const [reviewHistory, setReviewHistory] = useState<Record<string, ReviewHistoryEntry[]>>({});
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [handoverReady, setHandoverReady] = useState(false);
  const [extractionMode, setExtractionMode] = useState<'nebius' | 'deterministic'>('deterministic');
  const [busy, setBusy] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgressEvent | null>(null);
  const [workspaceLabel, setWorkspaceLabel] = useState('Workspace');

  useEffect(() => {
    setWorkspaceLabel(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'Local workspace' : 'Judge demo');
    void refreshWorkspace(true);
    // The project id is fixed for this signed-in workspace session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function refreshWorkspace(firstLoad = false) {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/workspace`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not load this project.');
      setProject(payload.state as HandoverState);
      setProjectName(payload.project.name as string);
      setClaimVersions(payload.claimVersions as Record<string, number>);
      setReviewHistory((payload.reviewHistory ?? {}) as Record<string, ReviewHistoryEntry[]>);
      setSnapshotId(payload.snapshotId as string | null);
      setHandoverReady(Boolean(payload.handoverReady));
      setExtractionMode(payload.extractionMode === 'nebius' ? 'nebius' : 'deterministic');
      if (firstLoad) {
        setSelectedId(payload.state.claims[0]?.id ?? '');
        setActiveStage(accessRole === 'contributor' ? 4 : 0);
      }
      setStorageWarning('');
      setReady(true);
    } catch (caught) {
      setStorageWarning(caught instanceof Error ? caught.message : 'Could not load the local project.');
      setReady(true);
    }
  }

  const selectedClaim = project.claims.find((claim) => claim.id === selectedId) ?? project.claims[0] ?? null;
  const conflicts = project.claims.filter((claim) => claim.status === "CONFLICT");
  const evidenceGaps = project.claims.filter((claim) => claim.status === "MISSING EVIDENCE");
  const pending = pendingReviewCount(project.claims, project.reviews);
  const roleView = projectForRole(project, role);
  const counts = Object.fromEntries(statusLabels.map((status) => [status, project.claims.filter((claim) => claim.status === status).length])) as Record<typeof statusLabels[number], number>;

  async function importSources(newSources: SourceRecord[], names: string[]) {
    if (accessRole === 'contributor') throw new Error('A project lead or reviewer must connect sources.');
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/sources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: newSources, names }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not add those records.');
      await refreshWorkspace();
      setFilter('all');
      setActiveStage(1);
      setStorageNotice(payload.message ?? `${payload.imported} sources added and checked.`);
    } finally { setBusy(false); }
  }

  async function finishGitHubImport(message: string) {
    setBusy(true);
    try {
      await refreshWorkspace();
      setFilter('all');
      setActiveStage(1);
      setStorageNotice(message);
    } finally { setBusy(false); }
  }

  async function approve() {
    if (!canApprove(project) || accessRole !== 'lead') return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/approve`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not approve the handover.');
      await refreshWorkspace();
      setRole('contributor');
      setActiveStage(4);
      setStorageNotice('Approved snapshot saved to the project record.');
    } catch (caught) { setStorageNotice(caught instanceof Error ? caught.message : 'Approval failed.'); }
    finally { setBusy(false); }
  }

  async function recordDecision(id: string, disposition: import('@/lib/domain/types').ReviewDisposition, editedStatement?: string) {
    if (accessRole === 'contributor') return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimId: id, expectedVersion: claimVersions[id], disposition, editedStatement }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not save this review decision.');
      await refreshWorkspace();
      if (disposition === 'pending') setActiveStage(3);
    } catch (caught) { setStorageNotice(caught instanceof Error ? caught.message : 'Review decision failed.'); }
    finally { setBusy(false); }
  }

  async function recordInterview(id: string, responseText: string) {
    if (!['lead', 'reviewer'].includes(accessRole)) throw new Error('A project reviewer must record the contributor’s answer.');
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/interviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: id, expectedVersion: claimVersions[id], response: responseText }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not save the interview answer.');
      await refreshWorkspace();
      setStorageNotice(payload.message ?? 'Answer saved as cited context. Reviewer decision is still required.');
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error('Could not save the interview answer.');
      setStorageNotice(error.message);
      throw error;
    } finally { setBusy(false); }
  }

  async function acknowledge() {
    if (!snapshotId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/receipts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshotId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? 'Could not save receipt.');
      await refreshWorkspace();
    } catch (caught) { setStorageNotice(caught instanceof Error ? caught.message : 'Receipt save failed.'); }
    finally { setBusy(false); }
  }

  async function runExtraction() {
    if (accessRole === 'contributor' || !project.importedNames.length) return;
    setBusy(true);
    setStorageNotice('');
    setExtractionProgress({ type: 'progress', stage: 'preparing', message: 'Preparing imported evidence for extraction.' });
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/extract`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        cache: 'no-store',
      });
      const result = await consumeExtractionResponse(response, setExtractionProgress);
      await refreshWorkspace();
      setStorageNotice(`${result.message}${result.notices.length ? ` ${result.notices.join(' ')}` : ''}`);
    } catch (caught) {
      setStorageNotice(caught instanceof Error ? caught.message : 'Nebius extraction failed. Imported source records remain available for manual review.');
    } finally {
      setExtractionProgress(null);
      setBusy(false);
    }
  }

  function resetDemo() { void refreshWorkspace(); setStorageNotice('Reloaded the saved project from PostgreSQL.'); }

  function handleStageChange(stage: number) {
    if (accessRole === 'contributor' && !handoverReady) {
      setStorageNotice('The project lead has not published this handover yet.');
      setActiveStage(4);
      return;
    }
    if (stage === 4 && !project.approvedAt) {
      setStorageNotice(pending
        ? `Handover is locked. Review all ${pending} remaining finding${pending === 1 ? "" : "s"}, then approve the handover to open the incoming view.`
        : "Handover is locked until you approve the completed review. Approve the handover to open the incoming view.");
      setActiveStage(3);
      return;
    }
    setStorageNotice("");
    setActiveStage(stage);
  }

  if (!ready) return <main className="workspace-loading"><span className="online-dot" /><p>Opening the saved project…</p></main>;
  return <div className="app-shell">
    <header className="topbar">
      <Link className="brand-lockup" href="/" aria-label="RelayOps home"><span className="brand-mark">R</span><span>Relay<span className="brand-light">Ops</span></span></Link>
      <div className="topbar-right"><Link className="workspace-home-link" href="/">Home</Link><span className="workspace-label"><span className="online-dot" />{workspaceLabel} · Tier {clearance}</span><SignOutButton />
        {activeStage === 4 && project.approvedAt && <div className="role-control">
          <span className="role-control-label">View as</span>
          <fieldset className="role-switch">
            <legend className="visually-hidden">Handover role</legend>
            <label className={`role-option ${role === "contributor" ? "selected" : ""}`}><input type="radio" name="handover-role" value="contributor" checked={role === "contributor"} onChange={() => setRole("contributor")} /><span>Incoming contributor</span></label>
            {accessRole === 'lead' && <label className={`role-option ${role === "project-lead" ? "selected" : ""}`}><input type="radio" name="handover-role" value="project-lead" checked={role === "project-lead"} onChange={() => setRole("project-lead")} /><span>Project lead</span></label>}
          </fieldset>
        </div>}
        <button className="icon-button" type="button" onClick={resetDemo} aria-label="Reload saved workspace" title="Reload saved workspace" disabled={busy}><Icon name="refresh" /></button>
      </div>
    </header>
    <main id="top" className="page-wrap">
      <WorkflowHeader project={project} projectName={projectName} activeStage={activeStage} onStageChange={handleStageChange} />
      {storageWarning && <p className="notice-line storage-warning" role="status">{storageWarning}</p>}
      {storageNotice && <p className="notice-line" role="status" aria-live="polite">{storageNotice}</p>}
      {accessRole === 'contributor' && !handoverReady ? <section className="incoming-waiting"><span className="incoming-waiting-mark"><Icon name="lock" /></span><p className="panel-kicker">HANDOVER NOT PUBLISHED</p><h2>Your project context is being reviewed.</h2><p>The project lead will make the approved records available here once each finding has a human decision.</p><button type="button" className="button button-secondary" onClick={() => void refreshWorkspace()} disabled={busy}>Check for an update <Icon name="refresh" /></button></section>
      : activeStage === 0 ? <section className="connect-view">
        <div className="stage-page-heading connect-page-heading"><div><h2>Bring the project records together</h2><p>Connect repository context or add Markdown and RelayOps JSON records you’re authorised to use.</p></div>{accessRole === 'contributor' ? <span className="workspace-label">Source connections need a reviewer</span> : <ImportSources onImport={importSources} />}</div>
        <div className="connect-content"><GitHubImport projectId={projectId} onImport={finishGitHubImport} /><div className="source-safety"><Icon name="lock" /><p><strong>Private by default.</strong> Source content is redacted for common credentials and contact details before storage. Only authorised project material should be imported.</p></div>
          <details className="connect-source-list"><summary><span>Connected sources</span><span>{project.sources.length} records</span></summary><div className="source-table-wrap"><div className="source-table" role="table" aria-label="Connected project sources"><div className="source-table-header" role="row"><span role="columnheader">Source</span><span role="columnheader">Type</span><span role="columnheader">Updated</span><span role="columnheader">Access</span></div>
            {project.sources.map((source) => <div className="source-table-row" role="row" key={source.id}><div role="cell"><span className="file-icon"><Icon name="file" /></span><span><strong>{source.title}</strong><small className="mono">{source.id}</small></span></div><span role="cell">{source.kind}</span><time role="cell" dateTime={source.occurredAt}>{new Date(source.occurredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</time><span role="cell" className={`tier-label tier-${source.clearance}`}>Tier {source.clearance}</span></div>)}
          </div></div></details>
        </div>
      </section> : activeStage === 1 ? <ReconstructView claims={project.claims} sources={project.sources} extractionMode={extractionMode} extracting={busy} extractionProgress={extractionProgress} onExtract={() => void runExtraction()} onOpenFinding={(claimId) => { setSelectedId(claimId); setFilter("all"); setActiveStage(3); }} onContinue={() => setActiveStage(2)} />
      : activeStage === 2 ? <VerifyView projectId={projectId} conflicts={conflicts} gaps={evidenceGaps} onOpenReview={() => { setFilter("all"); setActiveStage(3); }} onOpenClaim={(claimId) => { setSelectedId(claimId); setFilter("all"); setActiveStage(3); }} />
      : activeStage === 4 && project.approvedAt ? <>
        {roleView.restrictedCount > 0 && role === "contributor" && <div className="redaction-notice"><Icon name="lock" /><span>{roleView.restrictedCount} item{roleView.restrictedCount === 1 ? " is" : "s are"} restricted for this role. Ask your project lead for access.</span></div>}
        <RoleHandover claims={roleView.claims} reviews={project.reviews} role={role} acknowledgedAt={project.acknowledgedAt} onAcknowledge={acknowledge} />
      </> : <>
        <section className="review-stage" aria-labelledby="review-stage-title">
        <div className="stage-page-heading review-page-heading"><div><h2 id="review-stage-title">Review the findings before they move forward</h2><p>Confirm supported details, record a careful decision on conflicts, and keep evidence gaps visible when needed.</p></div><div className="review-stage-status"><strong>{pending ? `${pending} decisions left` : "Review complete"}</strong><span>{counts.CONFLICT} conflicts · {counts["MISSING EVIDENCE"]} evidence gaps</span></div></div>
        <div className="workspace-actions"><div><span className="source-set-name"><Icon name="layers" />{projectName}</span><span className="source-set-meta">{project.sources.length} source records · saved in PostgreSQL{project.importedNames.length ? ` · ${project.importedNames.length} imported file${project.importedNames.length === 1 ? "" : "s"}` : ""}</span></div>{accessRole === 'contributor' ? <span className="workspace-label">Read-only handover</span> : <ImportSources onImport={importSources} />}</div>
        <div className="review-layout">
          <ClaimQueue claims={project.claims} reviews={project.reviews} selectedId={selectedClaim?.id ?? ""} filter={filter} onFilter={setFilter} onSelect={setSelectedId} />
          <div className="detail-column"><EvidenceInspector claim={selectedClaim} />
            <ClaimReview key={selectedClaim?.id ?? "empty"} claim={selectedClaim} review={selectedClaim ? project.reviews[selectedClaim.id] : undefined} history={selectedClaim ? reviewHistory[selectedClaim.id] ?? [] : []} canReview={accessRole === 'lead' || accessRole === 'reviewer'} busy={busy} onInterview={recordInterview} onDecision={(id, disposition, editedStatement) => { void recordDecision(id, disposition, editedStatement); }} />
          </div>
        </div>
        <div className="approval-bar"><div><span className={`approval-indicator ${pending ? "waiting" : "ready"}`} />
            <div><strong>{pending ? `${pending} decisions remaining` : "Ready to hand over"}</strong><span>{pending ? "Review every finding to create the approved snapshot." : "Review complete. Incoming view stays hidden until you approve."}</span></div>
          </div><button type="button" className="button button-primary" disabled={!canApprove(project) || accessRole !== 'lead' || busy} onClick={() => void approve()}>{accessRole === 'lead' ? 'Approve handover' : 'Lead approval required'} <Icon name="arrow" /></button>
        </div>
        </section>
      </>}
      <footer className="app-footer"><span>RelayOps · {projectName}</span><span>Evidence first. Reviewed by humans.</span></footer>
    </main>
  </div>;
}

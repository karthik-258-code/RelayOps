# RelayOps Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a local-first RelayOps app that takes a synthetic project from source evidence through reviewed and role-filtered handover.

**Architecture:** Next.js App Router UI over typed, local domain data. Parsers and deterministic reconstruction rules stay independent from presentation; human decisions persist in versioned browser storage. Role filtering produces an incoming-safe view before rendering.

**Tech Stack:** Next.js, TypeScript, React, CSS modules or project CSS, browser File API, localStorage.

**Spec:** `docs/superpowers/specs/2026-11-08-relayops-round2-design.md`

## Global Constraints

- Core demo works without accounts, API keys, hosted services, or network access.
- Claims need cited evidence or explicit `MISSING EVIDENCE` status.
- Human approval is required before incoming handover view.
- Filter restricted claims and evidence before rendering incoming role view.
- Do not commit secrets or real confidential workspace data.

## Review Focus

- Contradictory sources show both sides and never silently select a winner.
- Missing evidence remains visibly unresolved; no inferred text appears as verified fact.
- Imported malformed or unsupported files receive clear errors and preserve current work.
- Lead-only claim details and source metadata do not enter contributor-facing data.
- Reload and reset behavior remain clear and predictable.

## Design Contract

- **Job:** Help a project lead turn scattered project records into a reviewable continuation plan.
- **Palette:** graphite `#202725`, warm white `#F7F8F5`, slate `#64716D`, field green `#246B59`, evidence amber `#B87920`, conflict red `#A7463D`.
- **Type:** system sans for reading and controls; system monospace only for source IDs and technical paths.
- **Layout:** compact utility rail, project/workflow header, central claim queue, and right evidence inspector. On narrow screens, evidence inspector becomes a claim detail panel below the queue.
- **Principles:** source-first hierarchy; status uses text plus color; restrained borders; no hero, gradients, or generic card dashboard; actual Project Chronos content throughout.

## File Map

- `app/` — app shell, route, global styles, metadata.
- `components/` — workflow navigation, claim queue, evidence inspector, review actions, handover view, import control.
- `lib/domain/` — source, claim, citation, review and role types; transitions.
- `lib/ingestion/` — file parsing and validation.
- `lib/reconstruction/` — deterministic Project Chronos rules.
- `lib/security/` — role filtering and incoming-safe projection.
- `data/project-chronos/` — synthetic source fixture set.
- `docs/round-2-submission.md` — completed features, implementation, changes, and Round 3 commitments.
- `README.md` — local setup, demo walkthrough, supported import format, limits.

### Task 1: Scaffold the local app

**Files:** `package.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `README.md`, `.gitignore`

- [ ] Create minimal Next.js TypeScript app and scripts for local development and production build.
- [ ] Implement RelayOps shell and responsive, accessible visual foundation from Design Contract.
- [ ] Add README with start command and promised offline-first behavior.
- [ ] Check `npm run build` completes and inspect the landing screen at desktop and narrow viewport.
- [ ] Commit `chore: scaffold local RelayOps app`.

### Task 2: Define evidence model and synthetic dataset

**Files:** `lib/domain/types.ts`, `data/project-chronos/*.json`, `lib/domain/project.ts`

- [ ] Define `SourceRecord`, `Citation`, `Claim`, `ReviewDecision`, `Role`, and `Handover` types.
- [ ] Add synthetic docs, task records, and discussion records with source IDs, dates, authors, and sensitivity tiers.
- [ ] Ensure fixtures include at least two concrete cross-source conflicts, one missing-evidence ownership gap, decisions, blockers, and actionable next steps.
- [ ] Load fixture set through typed project loader.
- [ ] Confirm all cited source IDs resolve and fixture strings contain no real secrets or personal data.
- [ ] Commit `feat: add synthetic Project Chronos evidence set`.

### Task 3: Implement deterministic reconstruction

**Files:** `lib/reconstruction/reconstruct.ts`, `lib/reconstruction/rules.ts`, `lib/domain/types.ts`

- [ ] Implement `reconstructWorkspace(sources: SourceRecord[]): Claim[]`.
- [ ] Generate decisions, ownership, risks/blockers, and next actions from fixture metadata and explicit rules.
- [ ] Emit `VERIFIED`, `CONFLICT`, and `MISSING EVIDENCE` statuses with source-linked citations and excerpts.
- [ ] Avoid confidence scores or unsupported generated explanations in the deterministic MVP.
- [ ] Inspect output against Project Chronos sources and confirm each claim is traceable.
- [ ] Commit `feat: reconstruct evidence-linked project state`.

### Task 4: Add local imports and workspace persistence

**Files:** `lib/ingestion/parse-workspace.ts`, `lib/ingestion/validate.ts`, `lib/domain/storage.ts`, `components/ImportSources.tsx`

- [ ] Implement `parseWorkspaceFiles(files: File[]): Promise<SourceRecord[]>` for `.md` and documented `.json` formats.
- [ ] Validate required fields and reject unsupported or malformed data with actionable messages.
- [ ] Import sources into the current workspace without deleting it on parse failure.
- [ ] Persist workspace, review state, and approval in versioned localStorage; support reset to Project Chronos.
- [ ] Confirm import, reload, and reset behavior in browser.
- [ ] Commit `feat: import and persist local workspaces`.

### Task 5: Build review and approval workflow

**Files:** `lib/domain/workflow.ts`, `components/ClaimQueue.tsx`, `components/ClaimReview.tsx`, `components/EvidenceInspector.tsx`

- [ ] Implement explicit reviewer actions: edit claim, resolve conflict, reject claim, leave unresolved, approve handover.
- [ ] Keep unresolved status visible and block approval while required conflict items remain unresolved.
- [ ] Show each selected claim with source excerpts, source type, timestamp, and source filename.
- [ ] Provide clear review progress and feedback after each action.
- [ ] Complete the end-to-end review flow with seeded project.
- [ ] Commit `feat: review claims and approve handovers`.

### Task 6: Add role-filtered handover and acknowledgement

**Files:** `lib/security/project-role-view.ts`, `components/RoleHandover.tsx`, `components/WorkflowHeader.tsx`

- [ ] Implement `projectForRole(project: Handover, role: Role): Handover` to remove restricted claims and citations before they reach the contributor view.
- [ ] Show a generic redaction marker where context is hidden without exposing restricted title, ID, excerpt, or URL.
- [ ] Require approved state before showing incoming view.
- [ ] Add project lead / incoming contributor switch and local receipt acknowledgement.
- [ ] Inspect contributor view data and rendered output for restricted fixture strings.
- [ ] Commit `feat: show permission-filtered handover`.

### Task 7: Complete submission materials and final quality pass

**Files:** `README.md`, `docs/round-2-submission.md`, affected UI files

- [ ] Document completed features, stack, local data flow, limits, and differences from Round 1.
- [ ] Record three Round 3 improvements: voice exit micro-interview, dependency graph + Day-1 runbook, audit diff + receipt sign-off + PDF export.
- [ ] Walk through load, inspect, resolve, approve, switch role, acknowledge, import, reload, and reset flows.
- [ ] Check keyboard focus, labels, visible status text, and responsive layouts at 320px, 768px, 1024px, and 1440px.
- [ ] Run production build and resolve failures.
- [ ] Commit `docs: prepare RelayOps Round 2 submission`.

## Execution Notes

- Work locally on `codex/relayops-round2`; do not push or deploy during this implementation.
- Do not add automated tests under current session instruction. Use the listed build and manual workflow checks only.
- Keep changes scoped to requirements. After local completion, prepare GitHub push and deployment as a separate explicit handoff.

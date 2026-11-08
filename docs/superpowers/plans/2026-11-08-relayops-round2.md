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

- [x] Create minimal Next.js TypeScript app and scripts for local development and production build.
- [x] Implement RelayOps shell and responsive, accessible visual foundation from Design Contract.
- [x] Add README with start command and promised offline-first behavior.
- [x] Check `npm run build` completes and inspect the landing screen in the browser.
- [x] Committed in the grouped Round 2 implementation history; see Execution Notes.

### Task 2: Define evidence model and synthetic dataset

**Files:** `lib/domain/types.ts`, `data/project-chronos/*.json`, `lib/domain/project.ts`

- [x] Define `SourceRecord`, `Citation`, `Claim`, `ReviewDecision`, `Role`, and `Handover` types.
- [x] Add synthetic docs, task records, and discussion records with source IDs, dates, authors, and sensitivity tiers.
- [x] Ensure fixtures include at least two concrete cross-source conflicts, one missing-evidence ownership gap, decisions, blockers, and actionable next steps.
- [x] Load fixture set through typed project loader.
- [x] Confirm all cited source IDs resolve and fixture strings contain no real secrets or personal data.
- [x] Committed in the grouped Round 2 implementation history; see Execution Notes.

### Task 3: Implement deterministic reconstruction

**Files:** `lib/reconstruction/reconstruct.ts`, `lib/reconstruction/rules.ts`, `lib/domain/types.ts`

- [x] Implement `reconstructWorkspace(sources: SourceRecord[]): Claim[]`.
- [x] Generate decisions, ownership, risks/blockers, and next actions from fixture metadata and explicit rules.
- [x] Emit `VERIFIED`, `CONFLICT`, and `MISSING EVIDENCE` statuses with source-linked citations and excerpts.
- [x] Avoid confidence scores or unsupported generated explanations in the deterministic MVP.
- [x] Inspect output against Project Chronos sources and confirm each claim is traceable.
- [x] Committed in the grouped Round 2 implementation history; see Execution Notes.

### Task 4: Add local imports and workspace persistence

**Files:** `lib/ingestion/parse-workspace.ts`, `lib/ingestion/validate.ts`, `lib/domain/storage.ts`, `components/ImportSources.tsx`

- [x] Implement `parseWorkspaceFiles(files: File[]): Promise<SourceRecord[]>` for `.md` and documented `.json` formats.
- [x] Validate required fields and reject unsupported or malformed data with actionable messages.
- [x] Import sources into the current workspace without deleting it on parse failure.
- [x] Persist workspace, review state, and approval in versioned localStorage; support reset to Project Chronos.
- [ ] Confirm reload persistence in a standard browser; in-app browser storage was isolated. Import and reset were manually confirmed.
- [x] Committed in the grouped Round 2 implementation history; see Execution Notes.

### Task 5: Build review and approval workflow

**Files:** `lib/domain/workflow.ts`, `components/ClaimQueue.tsx`, `components/ClaimReview.tsx`, `components/EvidenceInspector.tsx`

- [x] Implement explicit reviewer actions: edit claim, resolve conflict, reject claim, leave unresolved, approve handover.
- [x] Keep unresolved status visible and block approval until all findings have a reviewer disposition.
- [x] Show each selected claim with source excerpts, source type, timestamp, and source filename.
- [x] Provide clear review progress and feedback after each action.
- [x] Complete the end-to-end review flow with seeded project.
- [x] Committed in the grouped Round 2 implementation history; see Execution Notes.

### Task 6: Add role-filtered handover and acknowledgement

**Files:** `lib/security/project-role-view.ts`, `components/RoleHandover.tsx`, `components/WorkflowHeader.tsx`

- [x] Implement `projectForRole(project: Handover, role: Role): Handover` to remove restricted claims and citations before they reach the contributor view.
- [x] Show a generic redaction marker where context is hidden without exposing restricted title, ID, excerpt, or URL.
- [x] Require approved state before showing incoming view.
- [x] Add project lead / incoming contributor switch and local receipt acknowledgement.
- [x] Inspect contributor view data and rendered output for restricted fixture strings.
- [x] Committed in the grouped Round 2 implementation history; see Execution Notes.

### Task 7: Complete submission materials and final quality pass

**Files:** `README.md`, `docs/round-2-submission.md`, affected UI files

- [x] Document completed features, stack, local data flow, limits, and differences from Round 1.
- [x] Record three Round 3 improvements: voice exit micro-interview, dependency graph + Day-1 runbook, audit diff + receipt sign-off + PDF export.
- [x] Walk through load, inspect, resolve, approve, switch role, acknowledge, import, and reset. Reload persistence remains marked for standard-browser confirmation above.
- [x] Check keyboard focus, labels, visible status text, and responsive browser layout.
- [x] Run production build and resolve failures.
- [x] Committed as grouped implementation and submission updates; see Execution Notes.

## Execution Notes

- Build locally on `codex/relayops-round2`, then push to the existing public RelayOps repository. GitHub Pages publishes the static demo from this branch; `render.yaml` now defines an additional Render static-site deployment from the same branch.
- Functional tasks were committed in grouped milestones rather than one commit per numbered task: `7e973f2` (local MVP), `171f9ed` (GitHub Pages), `d097b16` (UI refinement), and `f79e82a` (submission report/docs). The per-task commit checklist above reflects the code being committed, not one-to-one commit messages.
- Standard-browser reload persistence remains the one Round 2 verification item to confirm.
- Do not add automated tests under current session instruction. Use the listed build and manual workflow checks only.
- Keep changes scoped to requirements. After local completion, prepare GitHub push and deployment as a separate explicit handoff.

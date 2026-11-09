# RelayOps Homepage and Workflow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public RelayOps homepage and a five-stage workspace with clear, distinct stage tasks and an explicit human-approval gate for Handover.

**Architecture:** Keep the existing client-side workflow and domain logic, move it to `/workspace`, and make `/` a new static-export-friendly landing page. Extend the current stage selection with distinct presentation for Reconstruct and Verify, and make the lock state accessible in both navigation and stage content.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, existing global CSS and icon set; static export to GitHub Pages and Render.

**Spec:** `docs/superpowers/specs/2026-11-08-relayops-home-and-workflow-redesign.md`

## Global Constraints

- Preserve local-first behavior and the existing browser storage schema.
- Keep source evidence attached and show conflicts and evidence gaps without resolving them automatically.
- Require explicit human approval before rendering the incoming handover.
- Do not claim authentication, server-side persistence, live integrations, AI processing, customer results, or fabricated metrics.
- Respect the configured GitHub Pages base path through Next App Router links.
- Keep keyboard focus, text status labels, narrow-screen support, and reduced-motion support.
- Do not add automated tests; verify with typecheck, production build, and a manual browser walkthrough.

## Review Focus

- Static-export route behavior for `/` and `/workspace`, including GitHub Pages base path: verify generated output and navigate using in-app links.
- Handover lock behavior before approval: click it and confirm explanation, status announcement, and a path back to Review.
- Approved role filtering: complete review, approve, switch role, and confirm restricted content remains absent.
- Existing imports and stored work: open Connect, import an allowed sample, refresh, and confirm the existing workflow data persists.
- Narrow-screen overflow and reduced-motion preference: inspect homepage and workspace at mobile width and with reduced motion enabled.

## File Map

- `app/page.tsx` — public home route.
- `app/workspace/page.tsx` — existing local workflow route.
- `app/globals.css` — public-home visual system, workspace navigation/stage layouts, responsive and motion behavior.
- `app/layout.tsx` — shared metadata and document shell.
- `components/RelayOpsApp.tsx` — route-local workspace state and stage-specific views.
- `components/WorkflowHeader.tsx` — stage navigation, progress, current and locked states.
- `components/WorkspaceStageViews.tsx` — focused Reconstruct and Verify content if extraction keeps the app component readable.
- `components/HomePage.tsx` — homepage content and Next `Link` to workspace.
- `DESIGN.md` — durable visual decisions for the approved redesign.
- `.impeccable/surfaces/home.md` — homepage composition and content contract.

### Task 1: Move the existing workflow to `/workspace`

**Files:** Modify `app/page.tsx`; create `app/workspace/page.tsx`.

- [x] Render `RelayOpsApp` from `/workspace`.
- [x] Replace the root route with the public RelayOps homepage; no placeholder remains.
- [x] Confirm the App Router route structure is compatible with the installed Next.js 16 docs and static export.

### Task 2: Create the public RelayOps home

**Files:** Create `components/HomePage.tsx`; modify `app/page.tsx`, `app/layout.tsx`, `app/globals.css`; create `DESIGN.md` and `.impeccable/surfaces/home.md`.

- [x] Build a first viewport around a project lead preparing a handover: clear headline, specific supporting copy, one primary “Open workspace” link, and real synthetic Project Chronos evidence.
- [x] Show how source-backed findings, visible uncertainty, and human approval shape the incoming brief. Mark demo content as synthetic; include no fabricated metrics or endorsements.
- [x] Use Next `Link` so `basePath` is preserved in exported GitHub Pages navigation.
- [x] Add responsive styles, visible focus, accessible labels, reduced-motion handling, and one purposeful transition.
- [x] Make the first viewport understandable at desktop and mobile widths without relying on animation.

### Task 3: Give workflow stages distinct jobs and clear navigation

**Files:** Modify `components/RelayOpsApp.tsx`, `components/WorkflowHeader.tsx`, `app/globals.css`; create `components/WorkspaceStageViews.tsx` if it meaningfully reduces component complexity.

- [x] Add a Reconstruct view that summarizes the deterministic source-to-finding grouping, preserves source links, and directs the lead to Verify.
- [x] Add a Verify view focused on conflict and missing-evidence claims with source comparisons and a direct route into Review; keep current decisions intact.
- [x] Keep Connect’s import/source inventory and Review’s existing queue, evidence inspector, decision controls, and approval bar.
- [x] Show Handover as locked until approval using visible text plus accessible state. Selecting the locked step explains the prerequisite and keeps the user oriented in Review; after approval it becomes a normal active stage.
- [x] Preserve approved Handover role filtering, acknowledgement, reset, and storage behavior.
- [x] Ensure stage buttons announce active/completed/locked state and remain usable by keyboard.

### Task 4: Run final verification and review the rendered UI

**Files:** All changed files.

- [x] Run `npm run typecheck`; resolve errors.
- [x] Run `RENDER_STATIC=true npm run build`; confirm `/` and `/workspace` prerender successfully.
- [x] Run the Impeccable detector after UI changes; it reported no findings.
- [x] Start `npm run dev` and open `http://localhost:3000`; manually check homepage-to-workspace flow, all five stages, pre-approval lock, post-approval handover, contributor view, and acknowledgement.
- [x] Inspect desktop and narrow mobile layouts, keyboard focus, reduced-motion behavior, build logs, and local persistence.
- [x] Leave the development server running and report the local URL with concise manual test steps.

## Completion

The user requested a local run. Do not push, deploy, or publish as part of this plan. Leave the inspected app running locally and give exact verification steps.

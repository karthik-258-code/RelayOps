# RelayOps Round 2 Product Spec

## Objective

Build a locally runnable, judge-usable knowledge handover app based on the Round 1 RelayOps proposal. The app turns an authorised project workspace into a reviewable continuation plan for an incoming teammate.

The core path must work end to end without credentials or a walkthrough:

1. Load a bundled synthetic project or import local Markdown and JSON files.
2. Reconstruct decisions, ownership, blockers, risks, and next actions.
3. Inspect evidence for each claim and see conflicts or missing evidence.
4. Edit, resolve, reject, and approve claims as a human reviewer.
5. View an approved handover for an incoming role, with restricted items filtered.

This is a focused Round 2 MVP. It prioritizes a dependable demo path over live enterprise integrations.

## Users and Scenarios

- **Departing contributor:** reviews the reconstructed state and supplies missing context.
- **Project lead:** resolves evidence conflicts, edits claims, and approves the snapshot.
- **Incoming teammate:** reads a role-appropriate plan with citations and next steps.
- **Judge:** opens the project locally and completes the workflow using seeded synthetic data.

## Product Design

### Workspace inputs

- Include a synthetic Project Chronos dataset in the repository. It contains project docs, tasks, and discussion records with deliberate contradictions, missing context, and sensitivity tiers.
- Support local `.md` and `.json` file imports. Show filenames and accepted formats before import.
- Do not require GitHub OAuth, hosted services, API keys, or network access for the primary demo.

### Reconstruction

- Produce claim records grouped into decisions, ownership, blockers/risks, and next actions.
- Every claim links to one or more source records and displays an exact supporting excerpt where available.
- Assign visible statuses: `VERIFIED`, `CONFLICT`, or `MISSING EVIDENCE`.
- Use deterministic metadata and contradiction rules for the demo. Do not imply that generated or inferred content is verified fact.
- If evidence is weak or absent, state that plainly and route the item to review.

### Review and approval

- Let reviewer edit a claim, resolve a conflict, mark a claim rejected, or leave it unresolved.
- Keep a visible status and reviewer decision for each claim.
- Require an explicit approval action before the incoming view becomes available.
- Persist the current workspace and review state locally across reloads where practical. Provide a reset-to-demo action.

### Handover and permissions

- Provide role views for incoming contributor and project lead.
- Filter restricted claims and their citations before rendering the incoming contributor view.
- Show a generic redaction marker for hidden context. Do not reveal restricted titles, excerpts, source links, or sensitive identifiers.
- Allow the incoming teammate to acknowledge receipt in the local demo.

## User Experience Requirements

- Land directly in the seeded project workflow; no login wall or empty dashboard.
- Make the current workflow step, review status, evidence, uncertainty, and next action clear.
- Keep source evidence inspectable beside or directly below its claim.
- Clearly distinguish source facts, rule-based findings, and human edits.
- Work at desktop and narrow screen widths; keyboard focus and labels must remain usable.
- Include concise sample-data and local-run instructions in the README.

## Proposed Technical Approach

- **Application:** Next.js App Router with TypeScript and a responsive React interface.
- **Data:** Local bundled JSON/Markdown fixtures; browser file import; local persistence for the demo. No hosted database in Round 2 MVP.
- **Reconstruction:** Typed parsers and deterministic rules for linking evidence, status contradictions, ownership signals, and missing evidence. Keep this engine separate from UI components.
- **State:** Typed claim, citation, source, reviewer-decision, and role models. Validate imported JSON before processing.
- **Deployment path:** Keep app compatible with a later public deployment after local review and GitHub push. The primary demo must still work without secrets or external services.

## Suggested Project Structure

```text
app/                 Next.js routes and page composition
components/          Workflow, evidence, review, and handover UI
lib/domain/           Typed models and workflow state transitions
lib/ingestion/        Markdown/JSON parsing and validation
lib/reconstruction/   Deterministic claim and conflict rules
lib/security/         Role filtering and safe redaction
data/project-chronos/ Synthetic demo sources
docs/superpowers/     Approved spec and implementation plan
```

## Commands

Exact scripts will be confirmed after project scaffolding.

- Install: `npm install`
- Development: `npm run dev`
- Build: `npm run build`
- Type check: `npx tsc --noEmit`

## Testing Strategy

- Unit-check parsing, evidence binding, conflict detection, state transitions, and role filtering.
- Exercise the central seeded workflow manually in a browser after implementation.
- Confirm imported malformed data produces a clear error and does not crash the workflow.
- Confirm restricted data does not appear in incoming-role output or serialized view data.

## Round 2 Deliverables

- Working local project and clear run instructions.
- A source repository ready for review and later push.
- Updated project documentation describing implemented architecture and data flow.
- Completed-feature list and explicit changes from the Round 1 proposal.
- Three meaningful Round 3 commitments: (1) voice-based exit micro-interview with cited transcript, (2) interactive dependency graph and Day-1 runbook, and (3) audit diff, receipt sign-off, and PDF export.

## Boundaries

- **Always:** Use synthetic or explicitly authorised data; bind claims to source evidence; label uncertainty; require human approval; enforce role filtering before rendering.
- **Ask first:** Add hosted storage, authentication, third-party AI APIs, live external connectors, or deploy/publish the app.
- **Never:** Put secrets in the repository; present unsupported claims as verified; expose restricted evidence through the incoming view.

## Success Criteria

- A judge can open the local app, load Project Chronos, inspect evidence, resolve or leave conflicts, approve the handover, switch role, and acknowledge receipt without external credentials.
- Each generated claim has a visible evidence source or an explicit missing-evidence status.
- Incoming contributor view excludes lead-only claims and their evidence.
- Reloading preserves the local review state, or the UI clearly explains the reset behavior.
- README explains setup, demo flow, sample data, limitations, and reset.

## Changes from Round 1 Plan

- Round 1 proposed live GitHub ingestion, hosted PostgreSQL/Supabase, vector search, LLM-assisted extraction, and multi-agent orchestration. Round 2 narrows the first build to local synthetic and file-based inputs with deterministic reconstruction.
- This scope reduces setup friction and makes the evidence and permission behavior testable without credentials. Live integrations, LLM reasoning, and hosted persistence remain future work unless time permits after the central workflow is complete.

## Open Questions

- None block this design. Initial implementation assumes a local single-user demo, a seeded project, and browser-local state. These assumptions can change after review.

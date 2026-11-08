# RelayOps — Round 2 Project Report

## Project summary

RelayOps turns authorised project records into an evidence-linked handover that an incoming teammate can use to continue work. The MVP demonstrates source intake, deterministic reconstruction, evidence review, human approval, role-filtered sharing, and receipt acknowledgement.

The primary demo uses Project Chronos, a synthetic project workspace with deliberate documentation drift, a task/repository disagreement, an undocumented code ownership gap, operational risks, next actions, and a lead-only note.

## Completed features

- Project Chronos loads on first visit; no login, setup credentials, or walkthrough required.
- Local Markdown and RelayOps JSON imports with file count, size, extension, shape, and duplicate-ID checks.
- Structured findings for decisions, ownership, blockers, risks, and next actions.
- Evidence excerpts with source ID, type, author, and date.
- Visible `VERIFIED`, `CONFLICT`, and `MISSING EVIDENCE` statuses.
- Human review actions to confirm, edit, resolve a conflict, accept an evidence gap, reject a claim, or reopen review.
- Approval gate that blocks the incoming view until every finding has a reviewer decision.
- Contributor and project lead handover views; lead-only claims and citations are filtered from the contributor view before rendering.
- Receipt acknowledgement, browser-local persistence, and reset-to-sample action.
- Responsive layout, keyboard-accessible controls, visible focus, text status labels, and reduced-motion handling.
- Local run and import instructions in README.

## Technology and implementation

- **Framework:** Next.js 16.4.5 App Router, React 19.3.1, TypeScript 5.9.3.
- **Inputs:** Bundled synthetic JSON fixture plus browser File API for Markdown and RelayOps JSON.
- **Reconstruction:** Typed deterministic grouping by topic and value. Divergent values produce `CONFLICT`; explicit evidence gaps produce `MISSING EVIDENCE`; aligned records produce `VERIFIED`.
- **Review:** Reviewer dispositions and approved state are stored with workspace data in versioned browser localStorage.
- **Role view:** A typed role projection filters claims and citations by clearance before handover components receive them.
- **Network services:** None required to run the main workflow. No LLM or live GitHub integration is included in Round 2.

## Main data flow

```text
Project Chronos JSON / local files
                ↓
        SourceRecord validation
                ↓
   Deterministic topic reconstruction
                ↓
  Claim + citation + evidence status
                ↓
      Human decision and approval
                ↓
   Role-filtered continuation plan
                ↓
       Recipient acknowledgement
```

## Changes from the Round 1 plan

The Round 1 proposal described live GitHub ingestion, Supabase/PostgreSQL, vector search, LLM-assisted extraction, and orchestration. Round 2 narrows the implementation to local synthetic and file-based sources with deterministic reconstruction. This makes the full judge workflow work without private OAuth credentials, hosted storage, or API keys.

Round 2 keeps the evidence model, source traceability, conflict queue, human approval, role-aware handover, and receipt acknowledgement. The broader integrations and LLM reasoning were not implemented.

## Three Round 3 improvements

1. **Voice exit micro-interview:** record a short answer to a targeted evidence-gap prompt, transcribe it, and attach timestamped testimony as a cited source.
2. **Dependency graph and Day-1 runbook:** visualize blocker relationships and produce an interactive first-week checklist.
3. **Audit and export:** show AI/source-to-human edit diffs, record recipient sign-off, and export the approved handover as PDF.

## Known limitations

- Role selection is a client-side demonstration, not a security boundary. The sample contains only synthetic data. Do not use confidential data.
- Browser-local persistence is per device and browser; there is no shared account, server database, or collaboration.
- Some privacy-isolated browser contexts may clear local storage between page loads.
- Markdown extraction only recognises documented headings and bullets. Unstructured text is retained as a source and marked as an evidence gap.
- JSON observations and excerpts are supplied by the user. RelayOps validates shape, but it cannot independently verify that imported excerpts match external records.
- There is no live GitHub connector, AI extraction, shared server persistence, PDF handover export, or immutable audit service. The static demo is publicly hosted on Render and GitHub Pages.

## Local verification

- `npm run typecheck` — passed.
- `npm run build` — passed; route `/` prerendered as a static page.
- GitHub Actions deployment — passed at commit `a56f890`; the public URL returned HTTP 200.
- Render static-site deployment — passed from the Render Blueprint at commit `a56f890`; `https://relayops-handover.onrender.com/` returned HTTP 200.
- Manual browser walkthrough — resolved both sample conflicts, kept the ownership gap visible, reviewed all findings, approved the snapshot, verified contributor redaction and project-lead access, acknowledged receipt, imported the example Markdown source, and reset to the sample.
- Browser persistence — app uses `localStorage`; this in-app browser cleared state on reload, so reload persistence still needs confirmation in a standard browser before submission.

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Live demo: <https://relayops-handover.onrender.com/> (Render) and <https://karthik-258-code.github.io/RelayOps/> (GitHub Pages). Source: <https://github.com/karthik-258-code/RelayOps/tree/codex/relayops-round2>.

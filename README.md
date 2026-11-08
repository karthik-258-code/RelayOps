# RelayOps

RelayOps turns scattered project records into a reviewable handover. Each finding points to source evidence, disagreements remain visible, and a human approves the continuation plan before the incoming view opens.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Published demo

Live demo: <https://karthik-258-code.github.io/RelayOps/>. The `codex/relayops-round2` branch deploys to GitHub Pages through Actions. The site is built as a static export with the repository subpath `/RelayOps`; local development keeps the normal root path.

## Render deployment

Live demo: <https://relayops-handover.onrender.com/>. `render.yaml` defines a Render static site for the same branch. It builds a root-path static export into `out`, so it does not use the GitHub Pages `/RelayOps` base path. Render auto-deploys commits to `codex/relayops-round2`.

## Demo flow

1. Start at **Review**. Project Chronos loads automatically with synthetic docs, task records, repository notes, and discussion records.
2. Select findings. Compare source excerpts, dates, and IDs. Conflicts and missing evidence have clear labels.
3. Confirm supported findings, edit and resolve conflicts, keep gaps visible, or exclude claims.
4. Review every finding. **Approve handover** opens the incoming view.
5. Switch between contributor and project lead views. Acknowledge receipt. Use the reset button to restore the sample.

## Import sources

The Connect step accepts up to 10 files at once, each up to 2 MB. Supported formats are `.md` and RelayOps JSON.

Markdown is parsed under category headings. Each bullet uses `topic: statement` format. A ready-to-import example lives at [`data/examples/import-example.md`](data/examples/import-example.md).

```markdown
---
id: DOC-API-01
title: API rollout notes
kind: document
occurredAt: 2026-11-08T10:00:00+05:30
author: Platform team
clearance: 1
---

## Decisions
- session-store: Redis is the active session store.

## Blockers
- retry-worker: Ordering test still fails for matching timestamps.

## Risks
- importer: Vendor limit changed; confirm retry window.

## Next Actions
- adapter-fix: Review fix before the next release.
```

Supported headings are **Decisions**, **Ownership**, **Blockers**, **Risks**, and **Next Actions**. Unstructured Markdown is accepted as a source but is flagged as missing structured evidence; RelayOps does not invent claims from it.

JSON can be a source record or `{ "sources": [...] }`. Each record needs `id`, `title`, `kind` (`document`, `task`, `discussion`, or `repository`), `occurredAt`, `author`, `clearance` (1–3), `content`, and an `observations` array. Each observation needs `topic`, `category`, `statement`, and `value`; optional `excerpt` carries an exact source quote, and optional `evidenceGap` marks a known gap.

## Data and security limits

- The Project Chronos fixture is synthetic. Do not import confidential or production records.
- Imports and decisions stay in browser `localStorage` on this device. Use **Reset to sample** to clear them. Private or isolated browser contexts may clear local storage after reload.
- Role filtering demonstrates a workflow. It is client-side and is not authentication or production access control.
- Reconstruction is deterministic and metadata-based. It does not use an LLM, connect to GitHub, or verify external systems.
- Claims show source excerpts. Imported JSON excerpts are user-supplied and must match their source.

See [`docs/round-2-submission.md`](docs/round-2-submission.md) for completed features, implementation details, plan changes, and Round 3 commitments.

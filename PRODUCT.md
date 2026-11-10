# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: a project lead preparing an evidence-backed handover from scattered project records.
- Secondary: an incoming teammate who needs a safe, concise view of what is known, disputed, missing, and next.

## Product Purpose

RelayOps turns authorised project records into a traceable continuation plan. A project lead reviews each finding against its sources, resolves disagreements or records uncertainty, approves the handover, and shares the role-appropriate view. Success means the incoming teammate can continue work without relying on undocumented context.

## Positioning

RelayOps keeps source evidence attached to every finding, preserves contradictions instead of choosing a winner, and requires a human decision before sharing a handover.

## Operating Context

- The Round 2 demo uses the synthetic Project Chronos workspace, stored in PostgreSQL.
- Leads and reviewers can import Markdown, RelayOps/Linear/Slack/Discord JSON exports, and bounded public or authorized GitHub evidence.
- Review decisions, exit-interview answers, approval snapshots, and receipt acknowledgements persist in PostgreSQL.
- Extraction uses structured model output when configured and deterministic reconstruction as an always-available fallback.
- The workflow progresses through Connect, Reconstruct, Verify, Review, and Handover.

## Capabilities and Constraints

- Reconstruction combines deterministic checks with optional structured model extraction and source-linked citations. GitHub is the live upstream connector; communication and task sources use authorized exports.
- Findings are labeled VERIFIED, CONFLICT, or MISSING EVIDENCE.
- Human review and approval are required before opening the incoming handover.
- Reviewer actions are recorded with claim versions and displayed in finding history.
- Missing-evidence findings can collect a text exit-interview answer as cited source context; the answer never resolves or approves the finding by itself.
- Contributor views filter restricted claims and evidence server-side using Supabase Auth, PostgreSQL, and RLS.
- The seeded local workflow runs without external model or GitHub credentials. Hosted demos require hosted Supabase and service configuration.
- Imported material must be synthetic, public, or otherwise authorised; the demo must not invite confidential data.
- The public homepage should clearly lead into the working workspace rather than replace it with a marketing-only experience.

## Brand Commitments

- Product name: RelayOps.
- Product voice: plain, specific, source-first, and clear about what remains uncertain.
- Human reviewers make the final decision; the product does not present reconstruction as authority.

## Evidence on Hand

- Synthetic source records and findings: `data/project-chronos/`.
- Local import example: `data/examples/import-example.md`.
- No real customer names, testimonials, usage metrics, or external integrations are available; do not invent them.

## Product Principles

1. Every claim stays traceable to its source.
2. Disagreement and missing evidence remain visible until a human acts.
3. Approval is explicit before information moves to the incoming view.
4. Restricted context is removed before the contributor projection is rendered.
5. Keep the core workflow usable with synthetic or authorised records and no external service credentials.

## Accessibility & Inclusion

- All key actions must work by keyboard and expose visible focus.
- State must use text labels as well as color.
- Support narrow screens and reduced motion.

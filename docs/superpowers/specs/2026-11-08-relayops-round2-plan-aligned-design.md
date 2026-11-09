# RelayOps Round 2 Plan-Aligned Design

## Intent and success

Restore the Round 2 capabilities promised by the Round 1 proposal while preserving the working five-stage RelayOps experience. A judge can load synthetic Project Chronos or connect an authorized GitHub repository, ingest its source records, reconstruct evidence-backed project state, inspect conflicts, make human decisions, approve a snapshot, and open an access-filtered handover. Source provenance and uncertainty remain visible throughout.

Development remains local until the team chooses to push or deploy. Credentials stay outside the repository. The existing local demo remains usable when external credentials are absent; integrations must report unavailable configuration rather than show simulated success.

## Round 1 Round 2 commitments restored

1. **Connect:** Load Project Chronos, import Markdown/JSON, and connect a public or authorized GitHub repository. Record source IDs, timestamps, authors, URLs, and clearance tiers.
2. **Reconstruct:** Build temporal relationships across developers, files/modules, commits, pull requests, issues, and discussion/document records. Produce a decision timeline, ownership map, blockers/risks, and next actions.
3. **Verify:** Use schema-constrained Gemini extraction with citations bound to stored source passages. Combine it with deterministic temporal and cross-source checks. Mark supported claims `VERIFIED`, disagreements `CONFLICT`, and unsupported claims `MISSING EVIDENCE`; never let model output choose a winner.
4. **Review:** Keep the existing human review queue and approval gate. Persist edits, dispositions, and approved snapshots with an auditable change history.
5. **Handover:** Apply clearance filtering before data reaches the incoming view. Redact secrets and sensitive identifiers at ingestion and before rendering. Preserve role-specific evidence links and receipt acknowledgement.

The three Round 3 commitments remain voice exit interviews, an interactive dependency graph and Day-1 runbook, and cryptographic audit/version diff/receipt export. They are not counted as completed Round 2 work.

## Architecture

- **Web app:** Keep the existing Next.js App Router and React UI. Server Actions or Route Handlers act as the authenticated boundary for GitHub, project data, extraction jobs, review writes, and handover reads. No provider secret reaches client components.
- **Extraction service:** Add a Python FastAPI service for provider calls and structured extraction, using Gemini and validated Pydantic response contracts. The service returns claims with source IDs and exact quote offsets; it cannot directly approve or publish claims. TypeScript validates the service response at the web boundary.
- **GitHub ingestion:** Use Octokit server-side. Support a repository URL and authorized read-only access; ingest commits, pull requests/reviews, issues, and linked repository metadata with stable upstream IDs, timestamps, authors, URLs, and content hashes. Handle pagination, rate limits, permission errors, and partial imports visibly.
- **Database:** Use PostgreSQL through Supabase. Model projects, members/clearance, sources, source passages, entities/relationships, claims, citations, review decisions, approved snapshots, and acknowledgements. Use migrations, foreign keys, unique source identities, transactions, and Row Level Security. Preserve local sample access without treating the client-side role switch as authorization.
- **Retrieval and graph:** Use PostgreSQL/pgvector for source-passage retrieval and a typed relational temporal graph as the source of truth. Add a graph traversal library only where it supports implemented workflows; do not add a second graph database without a measured need.
- **Safety and evidence:** Run deterministic secret/PII scans before persistence and output. Keep exact source passages and citation spans. Validate every generated citation against stored passages. Log ingestion and review transitions without storing provider keys or unnecessary secret-bearing text.
- **Local workflow:** Document and provide local web, extraction service, and database startup. Supply safe synthetic seed data. Missing Gemini/GitHub credentials disable only those integrations with clear UI status; no mock AI result is labeled as real extraction.

## Data flow

```text
Project Chronos / Markdown / GitHub
    -> server-side source ingestion and redaction
    -> PostgreSQL provenance store and temporal relationships
    -> retrieved source passages
    -> Gemini structured extraction via FastAPI
    -> schema and citation verification plus deterministic conflict checks
    -> human review, edits, and approval snapshot
    -> clearance-filtered handover and receipt acknowledgement
```

## Security boundaries

- GitHub tokens, Gemini keys, and database service credentials remain server-side and are excluded from Git.
- Public repository access is read-only. Private repository access requires explicit user authorization and least-privilege scopes.
- Project membership and clearance are enforced in server queries and database RLS, before claims or citations are composed for the client.
- Clearance filtering applies to sources, claims, graph edges, vector retrieval results, excerpts, URLs, and error messages.
- Secret/PII redaction runs before persistence and on output. Redaction is deterministic and does not replace access control.
- AI output is untrusted until schema validation, citation lookup, deterministic checks, and human review complete.
- Approval pins a versioned snapshot. The incoming view reads only approved snapshots.

## Failure behavior

- GitHub pagination, API, permission, and rate-limit failures retain already imported records and show an actionable partial-import status.
- Gemini timeout, quota, or invalid structured output keeps raw imported evidence and deterministic checks available; it never produces a false successful extraction.
- Citation IDs or offsets that do not resolve are rejected or surfaced as unsupported, never silently attached to a different source.
- Database outages prevent review writes and approval; the UI must not claim unsaved state is durable.
- RLS tests must prove restricted source text, identifiers, citations, and graph relationships are absent from contributor queries and serialized results.

## Scope boundaries

Round 2 scope is the original proposal's live GitHub/Project Chronos intake, temporal state reconstruction, structured LLM extraction, contradiction auditing, citation inspection, human review and approval, role-based server filtering, redaction, persisted handover, and receipt acknowledgement. Voice recording, interactive dependency/runbook UI, and cryptographic receipt/PDF export remain the three Round 3 commitments.

## Open implementation decisions to verify before coding

- Verify current Gemini model names and supported structured/audio APIs against official documentation; preserve the proposal's Gemini provider unless it is no longer available.
- Decide whether local Postgres uses Supabase CLI or Docker Compose based on installed tooling. Production Supabase credentials remain optional for local development.
- Confirm the chosen deployment can run both Next.js server endpoints and the FastAPI service before changing deployment configuration; the existing static deployments cannot host server-side secrets or APIs.
- Define the smallest supported GitHub data set and OAuth/token flow before requesting any user credential. Never commit secrets or ask for credentials in chat.

## Acceptance criteria

- Seeded Project Chronos and local Markdown/JSON continue to work end to end.
- A user can import an authorized repository; imported records retain provenance and support resume/partial failure without duplicate sources.
- Structured LLM extraction creates claims only with citations that resolve to stored exact passages; malformed or uncited output cannot enter approval.
- Temporal checks expose doc/code and task/repository disagreements as conflicts without auto-resolving them.
- Review edits, decisions, and approved versions persist in PostgreSQL and survive restart.
- A lower-clearance contributor cannot retrieve restricted source text, claims, IDs, citations, graph edges, or vector matches through server APIs or database queries.
- Secret/PII scanner masks seeded test patterns before storage/output.
- Approval gates the incoming handover, and receipt acknowledgement is persisted against the approved version.
- App clearly separates working integrations from missing credentials and never represents local deterministic behavior as live GitHub or AI output.

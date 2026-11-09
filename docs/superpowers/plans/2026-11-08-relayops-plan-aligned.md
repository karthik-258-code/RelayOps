# RelayOps Round 2 Plan-Aligned Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore the Round 1 proposal's Round 2 live ingestion, LLM extraction, PostgreSQL persistence, evidence auditing, and server-side role filtering while preserving the existing RelayOps workflow and UI.

**Architecture:** Keep Next.js 16.4.5 as the web app and authenticated BFF, Supabase CLI/PostgreSQL as the local persistent/auth/RLS layer, and a Python FastAPI extraction service using Gemini structured output and LangGraph. Use Octokit for read-only GitHub ingestion, pgvector plus temporal relational edges for retrieval and project state, and validate all citations and role clearance before returning data to the UI.

**Tech Stack:** Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3, Supabase CLI/PostgreSQL/Auth/pgvector, Python 3.12/FastAPI/Pydantic/LangGraph, Gemini API, Octokit, Zod, Microsoft Presidio and deterministic secret scanners.

**Spec:** `docs/superpowers/specs/2026-11-08-relayops-round2-plan-aligned-design.md`

## Global Constraints

- Keep all development local until the user chooses to push or deploy.
- Keep all credentials out of Git and browser bundles.
- The seeded synthetic project remains usable without Gemini or GitHub credentials; unavailable integrations show clear setup status and never pretend to work.
- Every AI claim must cite an exact stored source passage; reject invalid or missing citations.
- Conflicts remain unresolved until a human acts; model output cannot approve a claim.
- Enforce project membership and clearance before returning claims, evidence, graph edges, or retrieval results.
- Enable RLS for all exposed Supabase tables and test both permitted and denied access.
- Preserve existing unsaved UI changes and the current five-stage workflow.

## Review Focus

- GitHub import retries do not duplicate records and partial failures do not discard already imported evidence.
- Prompt injection or malicious instructions inside source text cannot alter system rules or trigger tools.
- Invalid model JSON, invented source IDs, and quote offsets that do not match stored passages cannot enter review.
- Lower-clearance queries cannot leak restricted source IDs, text, citations, graph relations, or vector matches.
- Secrets and PII are redacted before source persistence and before any model request or role projection.

## Task 1: Local database and provenance schema

**Files:** `supabase/config.toml`, `supabase/migrations/*`, `supabase/seed.sql`, `package.json`, `.gitignore`, `.env.example`

**Interfaces:**
- Produces local Supabase CLI commands, migrations, seed data, and typed database tables consumed by Tasks 2-5.
- Core tables: `profiles`, `projects`, `project_members`, `sources`, `source_passages`, `entities`, `entity_edges`, `claims`, `citations`, `review_decisions`, `approved_snapshots`, `receipt_acknowledgements`.
- Every tenant-owned row carries `project_id`; all relationship keys use foreign keys. Deduplicate sources on `(project_id, provider, external_id)`.

- [ ] Install and pin the Supabase CLI project dependency only after checking package scripts; initialize local config and confirm `supabase --help` / `npx supabase --help` commands.
- [ ] Create migrations with RLS enabled on every exposed table, least-privilege grants, membership/clearance policies, and indexes on RLS filter and foreign-key columns.
- [ ] Add pgvector and typed temporal edges; store embedding model/dimensions and source content hashes.
- [ ] Seed Project Chronos as synthetic, including contradictory GitHub-like/doc/task evidence, clearance tiers, and stable source identifiers.
- [ ] Add pgTAP coverage for allowed and denied project/member/source/claim/citation access at each clearance tier.
- [ ] Run `npx supabase start`, `npx supabase db reset`, and `npx supabase test db`; expected: healthy local stack, seed loads, migrations apply, and all RLS assertions pass.

## Task 2: Authenticated data-access layer and API contracts

**Files:** `lib/server/auth.ts`, `lib/server/db.ts`, `lib/server/projects.ts`, `lib/contracts/*`, `app/api/v1/*`, `middleware.ts`, `package.json`

**Interfaces:**
- `getRequestUser(): Promise<UserContext>` authenticates the Supabase cookie session.
- `getProjectAccess(userId: string, projectId: string): Promise<ProjectAccess>` returns project membership and maximum clearance.
- `projectForClearance(projectId: string, clearance: number): Promise<ProjectDTO>` fetches only authorized source/claim/citation DTOs.
- API errors use `{ error: { code, message, details? } }` with 400/401/403/404/409/422/500 semantics.

- [ ] Add pinned `@supabase/ssr`, `@supabase/supabase-js`, and Zod dependencies after inspecting install scripts and official version-specific documentation.
- [ ] Implement cookie-aware Supabase clients and a server-only data access layer; never return raw database rows or secret fields.
- [ ] Add signup/sign-in/sign-out and session refresh while keeping the homepage public and the workspace's seeded demo entry clear.
- [ ] Add route handlers for project load, source listing, review decisions, approval, role projection, and acknowledgement. Authenticate, validate, and authorize each request independently.
- [ ] Enforce the role preview as a reduction from the caller's database-assigned maximum clearance; client-provided roles can never elevate access.
- [ ] Verify local auth session, persisted review state across restart, unauthorized request rejection, and `npm run typecheck` / `npm run build`.

## Task 3: GitHub repository connector and safe source intake

**Files:** `lib/github/client.ts`, `lib/github/ingest.ts`, `lib/security/redaction.ts`, `app/api/v1/github/import/route.ts`, `components/ImportSources.tsx`, `components/WorkspaceStageViews.tsx`

**Interfaces:**
- `parseRepositoryUrl(input: string): Result<{ owner: string; repo: string }>` accepts GitHub.com repository URLs only.
- `ingestGitHubRepository(input: GitHubImportInput): Promise<ImportSummary>` imports read-only repository metadata, commits, PRs/reviews/comments, issues/comments, and source files/documentation as available.
- `redactSensitiveText(text: string): RedactedText` returns sanitized text plus redaction spans; original secrets are never written to logs or sent to Gemini.

- [ ] Add a repository URL input and optional one-time fine-grained read-only PAT field. Public repos work without a PAT. Never persist or log the PAT.
- [ ] Restrict imports to `github.com` URLs and the GitHub API host; reject alternate hosts, arbitrary URLs, and redirects to prevent SSRF.
- [ ] Implement Octokit pagination, rate-limit handling, timeout/size limits, per-source stable IDs and hashes, idempotent upsert, and partial-import reporting.
- [ ] Run secret regex/entropy and Microsoft Presidio PII redaction before persistence/model transmission; retain only safe text plus redaction metadata.
- [ ] Verify a public repository import without a token, a private repository failure with actionable messaging, duplicate import idempotency, pagination, and malformed URL rejection.

## Task 4: Gemini structured extraction, temporal graph, and conflict audit

**Files:** `services/extractor/pyproject.toml`, `services/extractor/app/*`, `services/extractor/tests/*`, `services/extractor/README.md`, `lib/contracts/extraction.ts`, `lib/server/extractor.ts`, `supabase/migrations/*`

**Interfaces:**
- `POST /v1/reconstruct` accepts project/source passage IDs and clearance-limited evidence; returns `ExtractionResult` validated by Pydantic and Zod.
- `ExtractionClaim` requires a statement, category, epistemic status, confidence, and one or more exact `CitationSpan` records.
- `validateCitationSpans(result, passages): ValidatedExtractionResult` rejects any source ID, quote, or offset that does not match stored passage text.
- Extraction service uses LangGraph stages: retrieve permitted evidence, extract schema-bound claims, bind/validate citations, run deterministic temporal checks, persist draft output.

- [ ] Create a Python 3.12 FastAPI service with pinned dependencies and server-only Gemini configuration; require an internal service token on all non-health endpoints.
- [ ] Fetch only sources permitted for the authenticated project and caller clearance; do not send restricted passages or raw credentials to the model.
- [ ] Implement Gemini structured output via official current SDK/docs and Pydantic schemas; validate status values and source citations in both Python and TypeScript.
- [ ] Generate embeddings for passages with the selected Gemini embedding model, persist them to pgvector with model/version metadata, and retrieve only clearance-permitted matches.
- [ ] Build temporal entity/edge records from authorship, file/module changes, commits, PRs, issues, and references; compare docs/tasks to newer repository state deterministically.
- [ ] Keep rule output distinct from model output. Invalid model output or quota/network failure leaves imported source records and deterministic audit results intact and reports extraction failure.
- [ ] Verify service auth, schema rejects, citation mismatch rejection, conflict pairs, temporal precedence, vector tenant isolation, and the configured-key success path.

## Task 5: Persisted review, approval snapshots, and safe handover UI

**Files:** `components/RelayOpsApp.tsx`, `components/ClaimQueue.tsx`, `components/ClaimReview.tsx`, `components/EvidenceInspector.tsx`, `components/RoleHandover.tsx`, `components/WorkflowHeader.tsx`, `lib/domain/*`, `app/globals.css`

**Interfaces:**
- Existing stage navigation and view models remain UI-facing; API DTOs replace browser localStorage as the source of truth for authenticated workspaces.
- `saveReviewDecision(claimId, expectedVersion, decision): Promise<ReviewDecisionDTO>` checks membership, clearance, and optimistic version before writing.
- `approveSnapshot(projectId, expectedVersion): Promise<ApprovedSnapshotDTO>` requires a disposition for every claim and runs transactionally.
- `acknowledgeSnapshot(snapshotId): Promise<ReceiptDTO>` ties acknowledgement to the approved snapshot version.

- [ ] Replace authoritative workspace/review localStorage reads and writes with server DTOs while preserving the current public landing page, seeded sample, import path, and five-stage navigation.
- [ ] Keep claim evidence inspector split-screen and display exact source links, excerpts, dates, and provider metadata for GitHub/docs/tasks.
- [ ] Add extraction progress, partial import, missing key, rate-limit, model failure, and database failure states with actionable plain-language messages.
- [ ] Persist edits, dispositions, approvals, snapshot versions, and receipts in PostgreSQL. Use optimistic locking for review updates and one transaction for approval.
- [ ] Filter every claim, source, citation, graph relation, and retrieval match in the server data-access layer before serializing incoming handover DTOs.
- [ ] Preserve responsive layout, keyboard access, visible focus, reduced motion, and current UI refinements.
- [ ] Manually verify sample flow, GitHub import, review conflict resolution, approval gate, reload/restart persistence, contributor filtering, and receipt acknowledgement.

## Task 6: Local run workflow, docs, and release readiness

**Files:** `package.json`, `scripts/dev-local.*`, `services/extractor/README.md`, `.env.example`, `README.md`, `docs/round-2-submission.md`, report PDF source/generator

- [ ] Add one documented local startup workflow for Supabase/Postgres, Next.js, and FastAPI, with setup checks and shutdown instructions.
- [ ] Document exact credential variable names and where users set them locally; never request keys in chat and never commit `.env.local`.
- [ ] Update README, submission answers, and PDF to describe only features that work, required local setup, actual provider use, remaining limitations, and unchanged Round 3 promises.
- [ ] Run `npx supabase db reset`, `npx supabase test db`, `npm run typecheck`, and `npm run build`; start all local services and walk the judge flow in a browser.
- [ ] Inspect `git diff --check`, `git status`, lockfiles, and staged content for secrets before any future push. Do not push or deploy in this plan.

## Source references

- Next.js local version docs: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `node_modules/next/dist/docs/01-app/02-guides/data-security.md`, `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`.
- Supabase local workflow: https://supabase.com/docs/guides/local-development/cli-workflows
- Supabase current RLS guide: https://supabase.com/docs/guides/database/postgres/row-level-security
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- GitHub fine-grained token endpoint permissions: https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens

## Spec coverage self-review

- All five Round 2 stages map to Tasks 2-5; integration setup and claims map to Tasks 1, 3, and 4.
- Database schema, durable review state, RLS, pgvector, and graph provenance map to Tasks 1, 2, and 4.
- Citation binding, model errors, and hostile content map to Tasks 3-4.
- Reviewer decisions, approval snapshots, and recipient receipt map to Task 5.
- Existing local demo/UI retention, setup docs, honest limitations, and no push/deploy map to Tasks 5-6.
- Round 3 voice capture, interactive runbook UI, and cryptographic PDF audit remain outside this implementation.

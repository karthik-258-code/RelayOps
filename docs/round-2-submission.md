# RelayOps — Round 2 Build Report

## Project summary

RelayOps turns authorised project records into an evidence-backed employee handover. Project records are imported, privacy-filtered, stored as source passages, reconstructed into findings, and tied to exact source quotations. Contradictions and missing evidence stay visible. A human reviewer makes the decision; a project lead approves a versioned snapshot before an incoming contributor can see it.

The ready-to-use Project Chronos workspace contains synthetic records. A local demo can run without user-provided API credentials. Gemini extraction and private-repository import require keys and are optional integrations.

## Completed features

- Public product homepage and a working sign-in screen.
- Local Supabase Auth sample accounts for project lead and incoming contributor.
- Five-stage workflow: Connect, Reconstruct, Verify, Review, and Handover.
- Project Chronos synthetic workspace persisted in PostgreSQL.
- Import Markdown and RelayOps JSON files with structural validation, file count and size limits, and duplicate checks.
- Import a public GitHub README, root/docs Markdown files, recent commits and selected commit/PR diffs, issues/comments, pull requests/reviews/conversation comments/code review comments; optional private-repository token is request-only. Pagination and the returned batch are bounded (50 records maximum).
- Redact common API credentials, bearer tokens, private keys, emails, and phone numbers before storage, using Presidio when available and deterministic scanner fallback otherwise.
- Store sources, passages, claims, citations, graph entities/edges, review decisions, approval snapshots, and receipt acknowledgements in PostgreSQL with pgvector support.
- Reconstruct supported facts deterministically; optional Gemini/LangGraph extraction can produce structured facts, embeddings, and graph edges when a valid key/quota is configured.
- Validate every persisted citation against the exact stored passage and quoted text. Model output cannot approve or resolve a disagreement.
- Show disagreements and evidence gaps explicitly in Verify.
- Search embedded source passages by natural-language query with pgvector cosine similarity; the search RPC runs as the signed-in user so project membership and clearance RLS filter matches before content is returned.
- Human review actions use optimistic claim versions; any changed claim needs a new decision. A heartbeat-backed project lock prevents source import or extraction from racing with review and approval.
- A lead approval gate blocks incomplete handovers. Versioned snapshots are immutable and repeated approval of one revision returns its existing snapshot.
- Contributors receive only an approved snapshot and only data at their clearance level; source text, citations, and related evidence are filtered server-side and protected by RLS.
- Incoming contributor can acknowledge the specific approved snapshot.
- Local app can be used end to end with the included synthetic demo; no external account is required for this local walkthrough.

## Technology and implementation details

- **Web application:** Next.js 16.4.5 App Router, React 19.3.1, TypeScript 5.9.3. Server-rendered routes protect the workspace; server route handlers validate inputs with Zod and use verified Supabase sessions.
- **Database and identity:** local Supabase stack, PostgreSQL 17, Supabase Auth, pgvector, SQL migrations, seeded synthetic users and data. RLS enforces project membership and clearance; server APIs apply matching checks.
- **Python extractor:** FastAPI and Pydantic service with LangGraph orchestration. Presidio and deterministic scanners redact content before model use. Gemini produces structured extraction and embeddings when configured.
- **GitHub ingestion:** Octokit makes paginated, bounded requests for README/docs, commits and selected file diffs, issues and comments, pull requests and changed-file diffs, reviews, conversation comments, and code review comments. Tokens are used for the request and are not persisted.
- **Evidence integrity:** passages are persisted before claims. Citation validation checks passage membership, exact quote containment, and Unicode code-point offsets consistently across Python, TypeScript, and PostgreSQL. Query embeddings and 768-dimensional passage embeddings are compared by a bounded pgvector cosine-similarity RPC. The RPC uses `SECURITY INVOKER`, and its results remain constrained by project/source/passage RLS even if a caller requests a higher clearance. Citationless imported findings become missing evidence. Version checks prevent stale decisions; heartbeat-backed mutation locks and database write-fence triggers serialize ingestion/extraction with review/approval and reject stale mutation tokens. Approval writes an immutable versioned snapshot that is the contributor-facing source of truth.
- **Privacy boundary:** imported content is treated as untrusted data, model prompts prohibit following source instructions, and generated findings require locally verified citations. Models never make approval decisions.

## Main data flow

```text
Markdown / RelayOps JSON / GitHub records
  -> validate and redact
  -> persist sources and exact passages
  -> deterministic reconstruction or optional Gemini/LangGraph extraction
  -> verify citations and preserve conflicts
  -> reviewer decisions and lead approval
  -> versioned approved snapshot
  -> clearance-filtered incoming view and receipt acknowledgement
```

## Changes from the Round 1 proposal

The initial Round 2 build temporarily replaced the planned database, server-side access, GitHub ingestion, vector/graph storage, and LLM extractor with browser-local deterministic logic. That did not meet the Round 1 plan. This build restores the planned architecture: Supabase/PostgreSQL and RLS, server-backed persistence, GitHub imports, a privacy-filtering FastAPI/LangGraph Gemini extractor, vector/temporal graph data, and human approval. A deterministic path remains as a no-key baseline for judges; it is not presented as a substitute for the planned AI path. General-purpose workspace creation and team invitations are not implemented in Round 2.

## Known limitations / what does not work yet

- Gemini extraction, query embeddings, and semantic retrieval have not been exercised against a user-owned key and quota. The Verify-stage search requires `GEMINI_API_KEY` and passages embedded through Gemini extraction; without the key, deterministic structured imports and human review work, while semantic search remains unavailable with an explicit setup message.
- Private GitHub repository import requires a read-only fine-grained token. The import is bounded to 50 recent records, selected diffs, and root/docs Markdown; it does not mirror the full repository or watch for later changes.
- Round 2 is running locally. The old GitHub Pages/static export cannot run the protected APIs or keep server secrets. A public judge link requires a server-backed Render deployment and a hosted Supabase project, with production environment variables and authentication configuration.
- Only the seeded Project Chronos workspace and local demo accounts are supplied. Arbitrary workspaces and invitations are not included.
- Presidio requires the extractor service; when it is unavailable, the API reports that it is using the deterministic Node redaction fallback.
- An interrupted source/extraction request keeps approval blocked until its 15-minute mutation lease expires; retry the source import or extraction to recover and reconcile the project before reviewing.
- No known failure was observed in the local seeded database, extraction validation unit tests, TypeScript check, or lead login/workspace smoke test at the time of writing. Deployment and Gemini-key operation are not verified.

## Three planned Round 3 improvements

1. **Voice exit micro-interview:** collect a departing teammate’s answer to a specific evidence gap, timestamp and attach the response as a source, then require human review before it enters an approved handover.
2. **Dependency graph and Day-1 runbook:** visualize blocker/task dependencies and turn approved dependencies and next actions into an interactive first-week checklist for the incoming teammate.
3. **Tamper-evident audit, version diff, and receipt export:** record source-to-decision changes in a verifiable event history, tie recipient sign-off to the approved snapshot, and export the handover as a PDF.

## Local judge walkthrough

1. Start Docker Desktop, run `npx supabase start`, then `npx supabase db reset`.
2. Run `./scripts/setup-local-env.ps1` once to write local-only settings to `.env.local`.
3. Start the extractor in one terminal with `./services/extractor/scripts/start.ps1` and the web app in another with `npm run dev`.
4. Open <http://localhost:3000>, choose **Open workspace**, and sign in as `lead@relayops.local` with password `RelayOpsDemo!2026`.
5. Connect/import records, inspect Reconstruct and Verify, resolve or accept evidence statuses in Review, and approve the project.
6. Sign out; sign in as `contributor@relayops.local` with the same local demo password to see the clearance-filtered approved snapshot and acknowledge receipt.
7. Optional: configure `GEMINI_API_KEY` in ignored `.env.local`, restart both services, and run Gemini extraction from Reconstruct. Optional: import a public GitHub repository without a token.

## Submission links and current status

- Working local app: <http://localhost:3000> (available only while local services are running).
- Source repository: <https://github.com/karthik-258-code/RelayOps/tree/codex/relayops-round2>.
- Public judge link: not deployed yet. Do not submit the former static GitHub Pages URL as the Round 2 application; it cannot execute this server-backed build.

# RelayOps

RelayOps turns project records into an evidence-backed handover. It imports Markdown, RelayOps, Linear, Slack, or GitHub records; stores source passages and findings in PostgreSQL; checks evidence and disagreements; then requires a human review and lead approval before the incoming contributor can see the snapshot. The seeded Project Chronos scenario includes six docs, eighteen repository records, a Linear task record, and four Slack channels, including restricted evidence.

## Run the local product

Requires Node.js 22+, Python 3.12, and Docker Desktop.

1. Install the web dependencies: `npm install`.
2. Start the local database: `npx supabase start`.
3. Apply schema and synthetic Project Chronos data: `npx supabase db reset`.
4. Generate local Supabase connection settings: `./scripts/setup-local-env.ps1`.
5. In a terminal, install the extractor dependencies once: `./services/extractor/scripts/setup.ps1`.
6. In another terminal, start the extractor: `./services/extractor/scripts/start.ps1`.
7. In another terminal, start RelayOps: `npm run dev`.
8. Open <http://localhost:3000>.

The local Supabase CLI stack is the only database target in these commands. The service key, database URL, and extractor shared key are written to the ignored root `.env.local`; no key is needed from you to run the seeded local workflow. To stop services, press Ctrl+C in the Next.js and extractor terminals, then run `npx supabase stop`.

## Sign in

The seeded local database provides two sample accounts. Choose **Project lead** to connect sources, review every finding, approve, and preview the incoming view. Choose **Incoming contributor** to confirm that only an approved snapshot at clearance level 1 is available.

| Role | Email | Password |
| --- | --- | --- |
| Project lead | `lead@relayops.local` | `RelayOpsDemo!2026` |
| Incoming contributor | `contributor@relayops.local` | `RelayOpsDemo!2026` |

These credentials exist only in the local seeded database. They are not production accounts.

## Main workflow

1. Open **Connect**. The Project Chronos sample is already in PostgreSQL.
2. Add up to 10 `.md` or `.json` files (2 MB each), or enter a GitHub repository URL. Notion pages can be exported as Markdown. JSON accepts RelayOps source records, Linear issue arrays (`issues`), Slack exports (`messages` or a top-level message array), and DiscordChatExporter channel exports (`provider: "discord"`). Slack and Discord replies are grouped by thread; timestamps, authors, and per-channel/message clearance are retained. Explicit `Decision:`, `Owner:`, `Blocker:`, `Risk:`, and `Next action:` labels become evidence observations. GitHub imports a bounded sample of README/docs, recent commits and selected diffs, issues/comments, PRs/reviews/conversation comments/code review comments. Results are capped at 50 records. Public repositories need no token. Private imports use a fine-grained read-only token for that request only.
3. Review **Reconstruct** for the decision timeline, ownership map, blockers/risks, and next actions. Structured Markdown/JSON facts are grouped deterministically. With an active Nebius Token Factory key, select **Run Nebius extraction**; every model fact must cite an exact quote in a stored passage, and only verified citations are persisted. pgvector embeddings and temporal entity relationships are saved when available.
4. Inspect **Verify** for contradictions and missing evidence. With Nebius configured and passage embeddings generated, search source records with a natural-language question; pgvector returns clearance-filtered matches with links to their source.
5. In **Review**, a lead or reviewer confirms, resolves, accepts uncertainty, or excludes each finding. Only a project lead can approve. Decisions are written to PostgreSQL with an optimistic version check.
6. Approval creates a versioned snapshot. The contributor account sees no project evidence until that snapshot is approved. The recipient can acknowledge receipt against that snapshot.

## Enable Nebius Token Factory

Create a Token Factory API key for the project that owns your inference credits and add it to the root `.env.local`:

```dotenv
NEBIUS_API_KEY=your-token-factory-key
NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1
NEBIUS_MODEL=Qwen/Qwen3.5-397B-A17B
NEBIUS_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B
```

Restart both Next.js and the extractor, then open **Reconstruct** and choose **Run Nebius extraction**. The default chat model is `Qwen/Qwen3.5-397B-A17B`; embeddings use `Qwen/Qwen3-Embedding-8B` truncated to the database's 768 dimensions. Override `NEBIUS_MODEL`, `NEBIUS_EMBEDDING_MODEL`, and `NEBIUS_BASE_URL` if your Token Factory project exposes different models or an account-specific endpoint. The app uses Nebius' OpenAI-compatible chat and embeddings API. A missing or failed key does not create pretend AI results: deterministic imported facts remain available, the UI explains setup, and the model cannot approve a handover.

## Architecture

- **Next.js 16 / React 19 / TypeScript:** server-rendered public pages, cookie-based Supabase Auth, protected APIs, Octokit GitHub ingestion, Zod request validation, and the review UI.
- **Supabase local stack / PostgreSQL 17 / pgvector:** migrations, Auth, relational evidence, exact passages, 768-dimensional vectors, temporal entity edges, review history, approved snapshots, and receipt acknowledgements.
- **FastAPI / Pydantic / LangGraph:** local privacy filtering, Nebius Token Factory structured extraction, exact citation validation, temporal conflict grouping, and embedding generation.
- **Microsoft Presidio plus deterministic scanners:** run before source storage when the extractor is available. Common provider tokens, credentials, contact details, and private-key blocks are masked. Names remain available for ownership extraction.
- **Human decision boundary:** model findings enter as unapproved data. Database policies and server access checks enforce project membership and clearance; lower-clearance APIs omit restricted source IDs, text, citations, and graph edges.

Useful checks:

```powershell
npm run typecheck
npm run test
npx supabase test db
Set-Location services/extractor
./.venv/Scripts/python.exe -m unittest discover -s tests -v
Set-Location ../..
npm run build
```

## Current limits

- The seeded UI opens the synthetic Project Chronos workspace. Arbitrary workspace creation and team invitations are not included in this Round 2 build.
- Nebius extraction and semantic evidence search require a Token Factory API key and model access. If the key is missing, the deterministic Markdown/JSON path still works and unstructured content stays a visible evidence gap.
- Private GitHub import requires a user-provided read-only token. The importer captures a bounded, recent set of repository records, selected diffs, and Markdown documentation; it does not monitor future changes or mirror the full repository history.
- Long source imports and Nebius extractions take a project mutation lock that heartbeats while active. If the server stops mid-update, retry the import or extraction after the 15-minute lease expires; approval remains blocked until the retry completes.
- Authentication users and sample roles are seeded locally. A public deployment needs hosted Supabase project credentials and production auth configuration; the local demo key and demo passwords must never be deployed.
- The project should be run with the local Supabase stack and FastAPI extractor for complete Round 2 behavior. Static GitHub Pages cannot run these APIs or keep their credentials private. Render deployment needs a hosted Supabase project, environment variables, and a server-backed Next.js service; the existing static deployment is not the working Round 2 link.

See [Round 2 submission notes](docs/round-2-submission.md) for the feature list, implementation details, changes from the original proposal, limitations, and Round 3 commitments.

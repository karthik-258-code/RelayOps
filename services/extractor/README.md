# RelayOps evidence extractor

This FastAPI service runs locally beside the Next.js app. LangGraph coordinates privacy filtering, Gemini structured extraction, exact source-quote validation, temporal conflict reconciliation, document embeddings, and redacted query embeddings for semantic retrieval. It exposes only `/health`, `/redact`, `/extract`, and `/embed-query`; OpenAPI docs are disabled. The service binds to loopback and requires the generated internal shared token on private routes.

## Local setup

From the repository root:

```powershell
./scripts/setup-local-env.ps1
./services/extractor/scripts/setup.ps1
./services/extractor/scripts/start.ps1
```

The first setup installs dependencies and downloads spaCy's small English model for Microsoft Presidio. In another terminal, start the web app with `npm run dev`. Health is available at `http://127.0.0.1:8000/health` and reports readiness booleans only; it never returns API keys.

Add `GEMINI_API_KEY` to the root `.env.local`, then restart both Next.js and the extractor. A local demo works without that key; sources are redacted, persisted, and checked with deterministic rules, while AI extraction and semantic search stay clearly unavailable. Run Gemini extraction to generate passage embeddings, then use **Verify → Search the source record**. Query vectors use the `RETRIEVAL_QUERY` task; passage vectors use `RETRIEVAL_DOCUMENT`. Postgres performs bounded cosine-similarity search through a security-invoker RPC, with RLS filtering matches. The current default is `gemini-3.8-flash`; embeddings use `gemini-embedding-001` at 768 dimensions. Override them with `GEMINI_MODEL` and `GEMINI_EMBEDDING_MODEL` if your Google project supports different current models.

## Security and evidence rules

- Bind to `127.0.0.1`; never expose this development service directly to the internet.
- The shared service token is generated into the ignored root `.env.local`. Keep it aligned with the Next.js server and extractor process.
- GitHub tokens and Gemini keys are never sent to the model as source content or written to project records.
- Source passages are untrusted input. The prompt rejects instructions in source text and exposes no tools.
- The service omits any model fact with an unknown passage ID or quote that is not an exact substring of the redacted stored passage.
- Conflicting values remain conflicts; model output never approves or resolves a handover.
- Presidio masks contact and sensitive identifier types. It intentionally leaves employee names available for ownership extraction; the deterministic scanner masks emails, phone numbers, provider keys, bearer tokens, passwords, and private-key blocks.
- Embedding failure does not invalidate already verified claims; the API returns an explicit notice and empty vectors.

## Checks

Run unit tests from this directory:

```powershell
./.venv/Scripts/python.exe -m unittest discover -s tests -v
```

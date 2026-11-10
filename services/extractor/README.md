# RelayOps evidence extractor

This FastAPI service runs beside the Next.js app. LangGraph coordinates privacy filtering, Nebius structured extraction, exact source-quote validation, temporal conflict reconciliation, document embeddings, and redacted query embeddings for semantic retrieval. It exposes only `/health`, `/redact`, `/extract`, and `/embed-query`; OpenAPI docs are disabled. The service requires the generated internal shared token on private routes.

## Local setup

From the repository root:

```powershell
./scripts/setup-local-env.ps1
./services/extractor/scripts/setup.ps1
./services/extractor/scripts/start.ps1
```

The first setup installs dependencies and downloads spaCy's small English model for Microsoft Presidio. In another terminal, start the web app with `npm run dev`. Health is available at `http://127.0.0.1:8000/health` and reports readiness booleans only; it never returns API keys. Extraction sends only passage IDs to FastAPI. FastAPI retrieves the requested, clearance-filtered passage text from the authenticated Next.js callback at `RELAYOPS_WEB_URL`; source text no longer travels in the request to the extractor's public Render URL.

Add an active Token Factory API key as `NEBIUS_API_KEY` in the root `.env.local`, then restart both Next.js and the extractor. A local demo works without that key; sources are redacted, persisted, and checked with deterministic rules, while AI extraction and semantic search stay clearly unavailable. Run Nebius extraction to generate passage embeddings, then use **Verify → Search the source record**. Postgres performs bounded cosine-similarity search through a security-invoker RPC, with RLS filtering matches. Defaults are `Qwen/Qwen3-30B-A3B-Instruct-2507` for extraction and `Qwen/Qwen3-Embedding-8B` for embeddings, requested at the persisted 768 dimensions. Override `NEBIUS_MODEL`, `NEBIUS_EMBEDDING_MODEL`, or `NEBIUS_BASE_URL` to match the models and endpoint enabled for your project.

## Security and evidence rules

- Bind to `127.0.0.1`; never expose this development service directly to the internet.
- The shared service token is generated into the ignored root `.env.local`. Keep it aligned with the Next.js server and extractor process.
- GitHub tokens and Nebius keys are never sent to the model as source content or written to project records.
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

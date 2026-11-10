# Nebius Extraction Resilience and Live Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retain valid Nebius findings when a sibling finding is malformed, and show honest live extraction progress in Reconstruction.

**Architecture:** Validate model facts independently in the Python extractor, then keep strict passage and quote validation unchanged. Add an opt-in SSE response to the authenticated Next.js extraction POST while preserving JSON for existing callers; consume those events in Reconstruction with determinate batch progress and indeterminate provider activity.

**Tech Stack:** Python 3, FastAPI, Pydantic, LangGraph; Next.js 16.4.5 Route Handlers, TypeScript, Web Streams, React 19, native CSS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-10-nebius-extraction-resilience-progress-design.md`

## Global Constraints

- Keep `CitationReference.quote` at its existing 1,000-character maximum.
- Preserve the existing `/extract` JSON response contract for callers that do not request streaming.
- Progress belongs to the active request; persistent job history is out of scope.
- Do not add automatic Nebius retries beyond existing timeout subdivision.
- Continue to validate every returned fact and citation on the server before persistence.
- Stream messages contain no source text or raw model/provider payloads.
- Do not add a database migration or persistent job table.
- Keep the existing project mutation lock for the entire extraction and persistence operation.
- Do not stage or commit unrelated working-tree changes.

## Review Focus

- One overlong citation or malformed field among otherwise valid facts: the valid facts survive and the rejected count increments. Pin in Task 1 tests `test_parse_model_facts_rejects_only_invalid_items` and `test_parse_model_facts_rejects_quote_over_limit`.
- A valid-looking fact cites a passage that does not exist or a quote not present verbatim: it remains rejected. Pin in Task 1 test `test_rejects_invented_passage_and_nonmatching_quote` (existing test; retain and run).
- Nebius returns malformed top-level JSON or a non-array `facts` field: fail the batch safely instead of silently accepting an empty result. Pin in Task 1 test `test_parse_model_facts_rejects_malformed_top_level`.
- A slow batch times out and is divided: only actual completed sub-batches count, and the displayed total changes when the split is known. Pin in Task 2 tests for batch split progress events and terminal event ordering.
- A client receives a pre-stream JSON error, a failed terminal SSE event, or a stream cut between chunks: the UI reports a safe failure and never treats an incomplete stream as success. Pin in Task 2 tests `test_consumes_chunked_progress_and_terminal_event` and `test_rejects_stream_without_terminal_event`; verify pre-stream error handling in Task 3 local smoke test.

---

## File Structure

- `services/extractor/app/pipeline.py` — parse the model envelope and independently validate facts before strict citation validation.
- `services/extractor/tests/test_model_output.py` — pin per-fact rejection and malformed top-level behavior without calling Nebius.
- `lib/extraction/progress.ts` — shared SSE event contract, event encoder, and browser stream consumer.
- `lib/server/extraction-progress-stream.ts` — run a long operation inside a response stream, send heartbeats, and isolate a disconnected client from the mutation lifecycle.
- `app/api/v1/projects/[projectId]/extract/route.ts` — publish real extraction stages and batch counts while retaining the existing JSON path and mutation lock.
- `tests/extraction-progress.test.ts` — test framing, split counts, terminal events, stream truncation, and disconnected-client behavior.
- `components/RelayOpsApp.tsx` — request SSE and update extraction progress state; keep support for pre-stream JSON errors.
- `components/WorkspaceStageViews.tsx` — render the active stage, batch count, elapsed activity, and accessible progress/status display.
- `app/globals.css` — style the progress panel for the current visual system and responsive layout.

## Task 1: Isolate invalid model facts

**Files:**
- Modify: `services/extractor/app/pipeline.py`
- Modify: `services/extractor/app/main.py`
- Create: `services/extractor/tests/test_model_output.py`
- Test: `services/extractor/tests/test_validation.py`

**Interfaces:**
- Produces: `parse_model_facts(response_text: str) -> tuple[list[dict], int]` in `app.pipeline`.
- Consumes: existing `ObservedFact`, `ExtractionEnvelope`, and `validate_fact_citations` contracts.

- [ ] **Step 1: Add failing tests.** Cover an envelope with one valid fact and one citation quote of 8,153 characters (valid fact retained, rejected count 1), a malformed individual fact (valid sibling retained), malformed JSON/non-array or more than 300 facts (raises a safe validation error), and the user-facing rejection notice stating schema or evidence validation.
- [ ] **Step 2: Run only the new tests to confirm they fail.** Run: `.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_model_output.py' -v` from `services/extractor`; Expected: an import/function failure for the not-yet-implemented parser.
- [ ] **Step 3: Implement `parse_model_facts(response_text: str) -> tuple[list[dict], int]`.** Parse the top-level object and enforce the existing maximum of 300 facts; validate each fact independently with `ObservedFact.model_validate`; count and skip fact-level `ValidationError`s; raise on malformed top-level JSON or invalid envelope shape. Update `_make_prompt` to state citation quotes must be concise and at most 1,000 characters.
- [ ] **Step 4: Integrate the parser in `_model_node`.** Pass accepted facts to the unchanged exact citation validator and set `rejected_fact_count` to schema-invalid plus citation-invalid facts.
- [ ] **Step 5: Update the extractor response notice.** Add `build_rejected_fact_notice(rejected_count: int) -> str | None` to `main.py`, use it for response notices, and state rejected facts failed schema or evidence validation; test singular/plural behavior and zero count.
- [ ] **Step 6: Run targeted extractor tests.** Run: `.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_model_output.py' -v` and `.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_validation.py' -v` from `services/extractor`; Expected: all tests pass, including existing nonmatching-quote rejection.
- [ ] **Step 7: Commit only the Task 1 files.** Use commit message `fix: isolate malformed Nebius findings`.

## Task 2: Add an opt-in, safe progress stream

**Files:**
- Create: `lib/extraction/progress.ts`
- Create: `lib/server/extraction-progress-stream.ts`
- Modify: `app/api/v1/projects/[projectId]/extract/route.ts`
- Create: `tests/extraction-progress.test.ts`

**Interfaces:**
- Produces: `ExtractionProgressEvent`, `ExtractionCompletionSummary`, and `ExtractionTerminalEvent` in `lib/extraction/progress.ts`. Progress carries a stage, safe message, optional batch index/total, elapsed seconds, and optional heartbeat flag. Terminal success carries the existing summary fields; failure carries a safe code/message.
- Produces: `encodeExtractionEvent(event): Uint8Array` and `consumeExtractionEventStream(response, onProgress): Promise<ExtractionTerminalEvent>` in `lib/extraction/progress.ts`.
- Produces: `createBatchProgressReporter(initialTotal, report)` in `lib/extraction/progress.ts`, with `start(message)`, `split(replacementCount, message)`, `complete(message)`, and `snapshot()` methods; total grows only when a real timeout split replaces a pending batch.
- Produces: `createExtractionProgressStream(run, options?)` in `lib/server/extraction-progress-stream.ts`; `run` receives a bounded progress reporter and resolves to `ExtractionTerminalEvent`. The helper emits heartbeats and stops enqueuing after disconnect while awaiting `run` to settle.
- Consumes: existing `extractBatch`, `splitExtractionBatch`, `withProjectMutation`, `jsonError`, and extraction response schemas.

- [ ] **Step 1: Add failing SSE protocol tests.** Cover multiple events split across arbitrary byte chunks, ordered terminal success/failure, malformed event JSON, missing terminal event, client cancellation while the operation promise still settles, and a timeout split that revises `batchTotal` before child batches complete using `createBatchProgressReporter`.
- [ ] **Step 2: Run the focused TypeScript test.** Run: `npx tsx --test tests/extraction-progress.test.ts`; Expected: failures for missing progress helpers/behavior.
- [ ] **Step 3: Implement event encoding/consumption and stream lifecycle helpers.** Emit `text/event-stream`, `Cache-Control: no-store`, and heartbeat progress without claiming model percentage. If the stream closes, stop enqueueing but allow the operation to settle through the existing mutation lock.
- [ ] **Step 4: Integrate progress reporting in the extraction route.** Accept `Request`; use SSE only when `Accept` requests it. Preserve existing JSON behavior otherwise. In stream mode report preparation, extractor readiness, evidence load, batch start/completion, timeout subdivision with revised totals, citation validation, claim/graph/vector saving, and terminal result. Keep the full mutation operation awaited inside the stream producer and emit exactly one terminal event. Preflight errors may remain JSON responses.
- [ ] **Step 5: Run focused stream and existing batch tests.** Run: `npx tsx --test tests/extraction-progress.test.ts tests/extraction-request.test.ts tests/extraction-merge.test.ts`; Expected: all tests pass, ordinary extraction results remain unchanged, and timeout subdivision events count completed sub-batches accurately.
- [ ] **Step 6: Commit only the Task 2 files.** Use commit message `feat: stream Nebius extraction progress`.

## Task 3: Show progress in Reconstruction

**Files:**
- Modify: `components/RelayOpsApp.tsx`
- Modify: `components/WorkspaceStageViews.tsx`
- Modify: `app/globals.css`
- Test: `tests/extraction-progress.test.ts`

**Interfaces:**
- Consumes: `consumeExtractionEventStream(response, onProgress)` and the `ExtractionProgress` view model from Task 2.
- Produces: Reconstruction progress UI with a polite live region, labelled determinate progress when batch counts are known, and indeterminate activity while Nebius processes a batch.

- [ ] **Step 1: Add a server-rendered Reconstruction view test.** In `tests/extraction-progress-view.test.ts`, render `ReconstructView` with a progress fixture and assert the stage message, accessible live region, accurate batch count, and determinate/indeterminate progress state.
- [ ] **Step 2: Run the focused UI test to confirm it fails.** Run: `npx tsx --test tests/extraction-progress-view.test.ts`; Expected: failure because the view does not yet accept or render progress.
- [ ] **Step 3: Wire `runExtraction` to request SSE.** Add `Accept: text/event-stream`; detect and consume SSE responses; parse non-SSE JSON errors for authentication, configuration, readiness, and pre-stream failures. Refresh the workspace only after terminal success. Keep existing sources/findings available on failures.
- [ ] **Step 4: Render and style the progress panel.** Pass the progress view model to `ReconstructView`; show named stage, “batch N of M” only when accurate, and elapsed activity while waiting. Add `role="status"`/`aria-live="polite"` and a labelled native progress indicator; respect reduced motion and mobile width.
- [ ] **Step 5: Run focused UI and integration checks.** Run: `npx tsx --test tests/extraction-progress-view.test.ts tests/extraction-progress.test.ts tests/extraction-request.test.ts tests/extraction-merge.test.ts` and `npm run typecheck`; Expected: tests and typecheck pass. Then confirm the UI state transitions with mocked local stream events, without a provider request.
- [ ] **Step 6: Commit only the Task 3 files.** Use commit message `feat: show live extraction progress in reconstruction`.

## Task 4: End-to-end local verification and handoff

**Files:**
- Review: `services/extractor/app/pipeline.py`
- Review: `app/api/v1/projects/[projectId]/extract/route.ts`
- Review: `components/RelayOpsApp.tsx`
- Review: `components/WorkspaceStageViews.tsx`

- [ ] **Step 1: Run the complete local test suites.** Run extractor unit tests and `npm test`; Expected: all pass, including the synthetic overlong-quote case; this does not contact Nebius.
- [ ] **Step 2: Run `npm run typecheck` and `npm run build`.** Expected: no TypeScript or production-build errors.
- [ ] **Step 3: Start the existing local app and extractor; verify health endpoints.** Expected: Next.js and FastAPI respond healthy; do not run a paid provider call as part of this check.
- [ ] **Step 4: Verify the progress UI using a mocked extractor response.** Expected: visible stage changes, timed “still processing” heartbeat, accurate batch count, successful refresh behavior, safe failure behavior, and source records retained.
- [ ] **Step 5: Review `git diff --check` and `git status --short`.** Confirm only the planned extraction/progress files are included in implementation commits and all unrelated existing changes remain untouched.
- [ ] **Step 6: Deploy the locally verified implementation through the existing GitHub/Render path.** Push only the planned implementation commits to the existing branch, let the existing Render services build, then confirm both web and extractor services are live. Do not change Render service or environment configuration. Do not spend Nebius credits on the production smoke check; the synthetic regression tests cover the long-quote failure.

## Verification Commands

- Python focused: `.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_model_output.py' -v` and `.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_validation.py' -v` (cwd `services/extractor`).
- Python suite: `.venv/Scripts/python.exe -m unittest discover -s tests -v` (cwd `services/extractor`).
- TypeScript focused: `npx tsx --test tests/extraction-progress.test.ts tests/extraction-progress-view.test.ts tests/extraction-request.test.ts tests/extraction-merge.test.ts`.
- TypeScript suite: `npm test`.
- Type check: `npm run typecheck`.
- Production build: `npm run build`.
- Whitespace check: `git diff --check`.

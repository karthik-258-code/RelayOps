# Nebius Extraction Resilience and Live Progress

## Goal

Make Nebius extraction resilient to malformed individual findings and make a long extraction understandable while it is running. A single overlong or otherwise invalid model fact must not discard valid facts from the same response. In Reconstruction, a project lead should see real extraction stages and completed batch counts, not only a generic “fetching” label.

## Context and confirmed failure

The current Python extractor parses the complete model response directly as `ExtractionEnvelope`. `CitationReference.quote` is limited to 1,000 characters. In the failed Project Test - 3 run, Nebius returned a quote of 8,153 characters for one citation. Pydantic rejected the entire envelope before the existing exact citation validator could retain other valid facts. The browser then showed a generic extraction failure, while the source records and passages remained saved.

The Next.js extraction route already groups passages into bounded batches, validates extractor responses, rechecks exact citations before persistence, and holds a project mutation lock during writes. It currently waits for the complete request and returns JSON. The Reconstruction UI reduces the active state to a button label and one status string. There is no database-backed extraction job or progress history.

## User-visible behavior

- During extraction, Reconstruction shows the current stage in plain language, a live accessible status message, and real batch progress when the total is known.
- The lead can see preflight/readiness, evidence preparation, each batch starting and completing, citation validation, persistence, and completion. A long-running Nebius batch uses an indeterminate activity indicator and elapsed-time message; the interface must not imply a fabricated model percentage.
- When a batch is split after a timeout, the status names the split and updates the batch total before reporting progress for the smaller batches.
- A completed run reports the number of validated findings, rejected model facts, and any existing notices. A failed run identifies the stage and gives a safe actionable message without exposing keys, raw source passages, or raw model output.
- Progress belongs to the active request. If the page is refreshed or the connection is lost, the live display ends; previously saved evidence remains available and the user can retry. Persistent job history is out of scope.
- Keep the existing JSON request/response behavior for callers that do not request streaming. No automatic retry that could incur additional Nebius usage is introduced.

## Extraction validation behavior

- Parse the top-level JSON object first and validate each item in its `facts` array independently against the existing `ObservedFact` schema.
- Reject and count an invalid fact without rejecting other valid facts in the same response. This includes an individual citation quote longer than the existing 1,000-character maximum.
- Pass valid facts through the current strict source-passage membership and exact quote validation. Invalid citations remain rejected; no unsupported citation is persisted.
- Add an explicit instruction to the Nebius prompt to keep citation quotes concise and within the schema limit. Do not raise the limit to accommodate the failed oversized output.
- Report the combined count of schema-invalid and evidence-invalid facts through the existing rejected-fact count and user-facing notice.
- If the top-level JSON is malformed, or its `facts` field is not an array, fail the batch with a safe error as today. Do not silently invent or repair model output.

## Architecture and interfaces

### Python extractor

Keep the existing `/extract` endpoint and `ExtractResponse` contract. The pipeline adds per-fact validation and a rejected count before the existing citation validator. The extractor continues returning JSON to its current caller; it does not add a callback URL or expose source text in progress messages. The web API reports the extraction batch as active while the Python service is processing it. The extractor's LangGraph stages remain preparation, model extraction, reconciliation, and embeddings.

### Next.js extraction API

Keep the route and its authorization, project lock, batch handling, response validation, exact citation checks, and persistence rules. When the request `Accept` header includes `text/event-stream`, return a `text/event-stream` response with `Cache-Control: no-store` and keep the existing mutation lock alive until the streamed extraction has completed. Emit only structured, bounded progress events with a stable event name and JSON data. The event payload contains a stage identifier, safe display message, optional active batch index/total, completed batch count, and elapsed seconds; terminal events contain the existing success summary or safe error code/message. Do not send source content, model output, credentials, internal stack traces, or sensitive provider details.

When `Accept` does not request an event stream, preserve the current JSON contract and status codes. Preflight errors before streaming may remain normal JSON errors; the UI must understand both those responses and streamed terminal errors.

Progress stages are: `preparing`, `checking_extractor`, `loading_evidence`, `extracting_batch`, `validating_citations`, `saving_findings`, `saving_embeddings`, `completed`, and `failed`. Stage messages are display-safe. While a Nebius request is pending, send a periodic elapsed-time heartbeat that repeats the active batch and says it is still processing; this is activity feedback, not model completion progress. Batch counts represent completed bounded requests, including timeout-split sub-batches; totals may be revised only when an actual split occurs.

### Reconstruction UI

The Reconstruction stage owns the progress panel and consumes the stream from the existing POST. Use an accessible `role="status"`/live region for changing messages, plus a labelled progress element when determinate batch or stage progress is available. Use an indeterminate visual treatment during active provider work. Preserve the current disabled state while extraction is running. On success, refresh persisted workspace data and show the response summary; on error, show the safe terminal or JSON error message and leave existing saved records visible.

## Security and data integrity

- Reuse the existing authenticated route and lead/reviewer permission checks; do not add unauthenticated progress endpoints.
- Continue using the existing project mutation lock for the entire extraction and persistence operation. Do not release it when the stream response object is first created.
- Continue validating every returned fact and citation on the server before writing claims, citations, entities, edges, or vectors.
- Stream messages contain no source text or raw model/provider payloads.
- Do not add a database migration or persistent job table for this design.

## Failure handling

- A fact-level Pydantic validation error increments `rejected_fact_count` and extraction continues with valid facts.
- Invalid top-level JSON, unavailable Nebius, an invalid extractor response, failed database writes, and a lost mutation lease produce one terminal failure event for streaming callers and the existing JSON error for non-streaming callers.
- If the client disconnects, stop writing to the closed stream. The server must still finish or abort the mutation through the existing lock lifecycle; it must not leave the project locked indefinitely. Disconnect alone must not create a hidden retry or second Nebius request.
- A dropped client connection does not imply that a run failed or succeeded. The user can reload persisted workspace state and inspect whether the operation saved, then retry if needed.

## Verification criteria

- A response with one valid fact and one fact containing an 8,153-character citation quote returns the valid fact, counts the invalid fact, and completes extraction without a batch-level schema failure.
- A valid fact with a quote not exactly present in the referenced stored passage is still rejected.
- A normal non-streaming caller still receives the existing JSON success/error contract.
- A streaming caller receives ordered safe stage events, accurate completed batch counts, and exactly one terminal success or failure event.
- A timeout-split batch reports updated totals and no false completion count.
- The UI shows stage messages and live batch progress, handles pre-stream JSON errors, refreshes persisted data on success, and leaves the source/finding view usable on failure.
- The mutation lock covers the streaming operation and is released on both success and failure.

## Out of scope

- Persistent or refresh-resumable job history.
- Automatic Nebius retries beyond existing timeout subdivision.
- Changing model/provider, citation strictness, extraction schema limits, or review/approval rules.
- Render service or environment configuration changes. Once the implementation passes local verification, deploy the tested code through the existing GitHub/Render setup requested by the user.

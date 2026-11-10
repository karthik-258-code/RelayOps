from typing import Any


def classify_nebius_failure(error: Exception) -> tuple[int, str, int | str | None]:
    """Return actionable client detail without exposing provider messages or source text."""
    if type(error).__name__ == "ModelOutputTruncatedError":
        return 502, "Nebius reached its structured-output limit for this batch. Retry after narrowing the source set.", None
    if type(error).__name__ in {"APITimeoutError", "TimeoutError"}:
        return 504, "Nebius did not finish this extraction batch within 4 minutes. Imported sources remain saved; retry when the service is responsive.", None
    response = getattr(error, "response", None)
    raw_status = getattr(error, "status_code", None) or getattr(response, "status_code", None) or getattr(error, "code", None)
    status: int | str | None = raw_status if isinstance(raw_status, (int, str)) else None
    normalized = str(getattr(error, "status", "")).upper()
    code = str(getattr(error, "code", "")).upper()
    if status == 402:
        return 402, "Nebius Token Factory has no usable inference credit for this project. Check the selected project and balance.", status
    if status == 401 or normalized in {"UNAUTHENTICATED", "INVALID_API_KEY"}:
        return 502, "Nebius rejected the configured API key. Use an active Token Factory API key from the project with model access.", status
    if status == 403 or normalized == "PERMISSION_DENIED":
        return 502, "Nebius denied access to this model or endpoint. Check the key's project and model access.", status
    if status == 404 or normalized == "NOT_FOUND":
        return 502, "The configured Nebius model is unavailable. Check NEBIUS_MODEL or NEBIUS_EMBEDDING_MODEL against the account catalog.", status
    if status == 429 or normalized in {"RESOURCE_EXHAUSTED", "RATE_LIMIT_EXCEEDED"} or code in {"RESOURCE_EXHAUSTED", "RATE_LIMIT_EXCEEDED"}:
        return 429, "Nebius rate limited this extraction after automatic retries. Wait briefly for the limit to reset, then retry; imported sources remain saved.", status
    if isinstance(status, int) and status >= 500:
        return 503, "Nebius was temporarily unavailable after automatic retries. Imported sources remain saved; wait briefly and retry.", status
    if status in {400, 422} or normalized == "INVALID_ARGUMENT":
        return 502, "Nebius rejected the extraction request or response format. Check model compatibility and structured JSON support.", status
    return 502, "Nebius extraction failed. Imported source records remain available for manual review.", status


def safe_provider_metadata(error: Exception) -> dict[str, Any]:
    """Metadata intended for logs; never include exception messages, prompts, or credentials."""
    response = getattr(error, "response", None)
    status = getattr(error, "status_code", None) or getattr(response, "status_code", None) or getattr(error, "code", None)
    provider_status = getattr(error, "status", None)
    metadata = {
        "error_type": type(error).__name__[:100],
        "provider_status_code": status if isinstance(status, (int, str)) else None,
        "provider_status": str(provider_status)[:80] if provider_status else None,
    }
    finish_reason = getattr(error, "finish_reason", None)
    if isinstance(finish_reason, str):
        metadata["finish_reason"] = finish_reason[:40]
    for name in ("completion_tokens", "content_length", "reasoning_length"):
        value = getattr(error, name, None)
        if isinstance(value, int) and value >= 0:
            metadata[name] = value
    has_refusal = getattr(error, "has_refusal", None)
    if isinstance(has_refusal, bool):
        metadata["has_refusal"] = has_refusal
    error_details = getattr(error, "errors", None)
    if callable(error_details):
        try:
            failures = error_details(include_input=False, include_context=False, include_url=False)
        except TypeError:
            failures = error_details()
        if isinstance(failures, list):
            metadata["validation_errors"] = [
                {
                    "type": str(item.get("type", "unknown"))[:80],
                    "loc": [part if isinstance(part, int) else str(part)[:80] for part in item.get("loc", [])[:8]],
                }
                for item in failures[:8]
                if isinstance(item, dict)
            ]
    return metadata

from typing import Any


def classify_gemini_failure(error: Exception) -> tuple[int, str, int | str | None]:
    """Return safe client detail and provider status without exposing provider messages or source text."""
    response = getattr(error, "response", None)
    raw_status = getattr(response, "status_code", None) or getattr(error, "code", None)
    status: int | str | None = raw_status if isinstance(raw_status, (int, str)) else None
    normalized = str(getattr(error, "status", "")).upper()
    code = str(getattr(error, "code", "")).upper()
    if status == 429 or normalized == "RESOURCE_EXHAUSTED" or code == "RESOURCE_EXHAUSTED":
        return 429, "Gemini rate limit or quota reached. Wait for quota to renew before retrying.", status
    if status == 401 or normalized in {"UNAUTHENTICATED", "INVALID_API_KEY"}:
        return 502, "Gemini rejected the configured API key for generation. The key may be valid for model listing but lack generation access.", status
    if status == 403 or normalized == "PERMISSION_DENIED":
        return 502, "Gemini denied generation access for this key or model. Check the key's project and API access.", status
    if status == 400 or normalized == "INVALID_ARGUMENT":
        return 502, "Gemini rejected the extraction request. Check the configured model and structured response schema.", status
    if status == 404 or normalized == "NOT_FOUND":
        return 502, "The configured Gemini model is unavailable for generation. Check GEMINI_MODEL.", status
    return 502, "Gemini extraction failed. Imported source records remain available for manual review.", status


def safe_provider_metadata(error: Exception) -> dict[str, Any]:
    """Metadata intended for logs; never include exception messages, prompts, or credentials."""
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None) or getattr(error, "code", None)
    provider_status = getattr(error, "status", None)
    return {
        "error_type": type(error).__name__[:100],
        "provider_status_code": status if isinstance(status, (int, str)) else None,
        "provider_status": str(provider_status)[:80] if provider_status else None,
    }

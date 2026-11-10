import json
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.schemas import ExtractJobRequest, ExtractRequest

MAX_CALLBACK_RESPONSE_BYTES = 5_000_000
MAX_EXTRACTION_CHARACTERS = 200_000


class PassageLoadError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def fetch_stored_passages(
    job: ExtractJobRequest,
    relayops_web_url: str,
    shared_token: str,
    *,
    opener: Callable = urlopen,
) -> ExtractRequest:
    if not relayops_web_url.strip() or not shared_token.strip():
        raise PassageLoadError("callback_not_configured")

    callback_url = f"{relayops_web_url.rstrip('/')}/api/internal/extraction-passages"
    request = Request(
        callback_url,
        data=json.dumps({
            "project_id": job.project_id,
            "clearance": job.clearance,
            "passage_ids": job.passage_ids,
        }).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-RelayOps-Extractor-Key": shared_token,
        },
        method="POST",
    )
    try:
        with opener(request, timeout=30) as response:
            payload = response.read(MAX_CALLBACK_RESPONSE_BYTES + 1)
    except HTTPError as error:
        if error.code in (401, 403):
            raise PassageLoadError("callback_unauthorized") from None
        raise PassageLoadError("callback_http_error") from None
    except (URLError, TimeoutError, OSError):
        raise PassageLoadError("callback_unavailable") from None

    if len(payload) > MAX_CALLBACK_RESPONSE_BYTES:
        raise PassageLoadError("callback_response_too_large")
    try:
        body = json.loads(payload)
        result = ExtractRequest.model_validate({
            "project_id": job.project_id,
            "passages": body["passages"],
        })
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        raise PassageLoadError("callback_response_invalid") from None

    received_ids = [passage.passage_id for passage in result.passages]
    if len(received_ids) != len(job.passage_ids) or set(received_ids) != set(job.passage_ids):
        raise PassageLoadError("callback_passage_scope_mismatch")
    if any(passage.clearance > job.clearance for passage in result.passages):
        raise PassageLoadError("callback_clearance_mismatch")
    if sum(len(passage.content) for passage in result.passages) > MAX_EXTRACTION_CHARACTERS:
        raise PassageLoadError("extraction_batch_too_large")
    return result

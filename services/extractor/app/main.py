import hmac
import logging
import os
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.pipeline import EMBEDDING_MODEL, MODEL_NAME, run_extraction
from app.embeddings import embed_query_text
from app.privacy import PRESIDIO_READY, redact_sensitive_content
from app.schemas import ExtractRequest, ExtractResponse
from app.provider_errors import classify_nebius_failure, safe_provider_metadata

app = FastAPI(title="RelayOps Evidence Extractor", version="1.0.0", docs_url=None, redoc_url=None)
logger = logging.getLogger("relayops.extractor")


class RedactionObservation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    topic: str = Field(max_length=120)
    category: str = Field(max_length=40)
    statement: str = Field(max_length=1000)
    value: str = Field(max_length=300)
    excerpt: str | None = Field(default=None, max_length=4000)
    evidenceGap: bool | None = None
    ownerName: str | None = Field(default=None, max_length=160)
    dueAt: str | None = Field(default=None, max_length=100)


class RedactionSource(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(min_length=1, max_length=240)
    title: str = Field(min_length=1, max_length=240)
    author: str = Field(max_length=160)
    content: str = Field(max_length=2_000_000)
    observations: list[RedactionObservation] = Field(max_length=250)


class RedactionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sources: list[RedactionSource] = Field(min_length=1, max_length=10)


class EmbedQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=3, max_length=1000)


def require_internal_key(x_relayops_extractor_key: Annotated[str | None, Header()] = None) -> None:
    configured = os.getenv("EXTRACTOR_SHARED_TOKEN", "")
    if not configured:
        raise HTTPException(status_code=503, detail="The internal service key is not configured.")
    if not x_relayops_extractor_key or not hmac.compare_digest(x_relayops_extractor_key, configured):
        raise HTTPException(status_code=401, detail="Internal service authentication failed.")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_configured": bool(os.getenv("NEBIUS_API_KEY", "").strip()),
        "provider": "nebius",
        "model": MODEL_NAME,
        "embedding_model": EMBEDDING_MODEL,
        "presidio_ready": PRESIDIO_READY,
    }


@app.post("/redact", dependencies=[Depends(require_internal_key)])
def redact(request: RedactionRequest):
    redacted = []
    for source in request.sources:
        redacted.append({
            "id": source.id,
            "title": redact_sensitive_content(source.title),
            "author": redact_sensitive_content(source.author),
            "content": redact_sensitive_content(source.content),
            "observations": [
                {
                    **observation.model_dump(exclude_none=True),
                    "topic": redact_sensitive_content(observation.topic),
                    "statement": redact_sensitive_content(observation.statement),
                    "value": redact_sensitive_content(observation.value),
                    **({"excerpt": redact_sensitive_content(observation.excerpt)} if observation.excerpt else {}),
                    **({"ownerName": redact_sensitive_content(observation.ownerName)} if observation.ownerName else {}),
                }
                for observation in source.observations
            ],
        })
    return {"sources": redacted, "presidio_ready": PRESIDIO_READY}


@app.post("/extract", response_model=ExtractResponse, dependencies=[Depends(require_internal_key)])
async def extract(request: ExtractRequest):
    if not os.getenv("NEBIUS_API_KEY", "").strip():
        raise HTTPException(status_code=503, detail="Nebius is not configured. Add NEBIUS_API_KEY to the extractor service and restart it.")
    total_chars = sum(len(passage.content) for passage in request.passages)
    if total_chars > 200_000:
        raise HTTPException(status_code=413, detail="Limit one extraction to 200,000 characters. Split the source set and retry.")
    try:
        result = await run_extraction(request)
    except Exception as error:
        failure_status, safe_detail, _provider_status = classify_nebius_failure(error)
        logger.warning("Nebius extraction failed: %s", safe_provider_metadata(error))
        raise HTTPException(status_code=failure_status, detail=safe_detail) from None

    claims = result.get("claims", [])
    embeddings = result.get("embeddings", {})
    rejected = int(result.get("rejected_fact_count", 0))
    notices = list(result.get("notices", []))
    if rejected:
        notices.append(f"{rejected} model fact{'' if rejected == 1 else 's'} were excluded because their citations did not match stored evidence.")
    if not claims:
        notices.append("No cited handover facts were extracted. Source records remain available for human review.")
    return ExtractResponse(
        extraction_mode="nebius",
        model=MODEL_NAME,
        rejected_fact_count=rejected,
        embedding_model=EMBEDDING_MODEL if embeddings else None,
        redacted_passages=result.get("redacted_passages", {}),
        embeddings=embeddings,
        claims=claims,
        entities=result.get("entities", []),
        edges=result.get("edges", []),
        notices=notices,
    )


@app.post("/embed-query", dependencies=[Depends(require_internal_key)])
async def embed_query(request: EmbedQueryRequest):
    if not os.getenv("NEBIUS_API_KEY", "").strip():
        raise HTTPException(status_code=503, detail="Nebius is not configured. Add NEBIUS_API_KEY to the extractor service and restart it.")
    safe_query = redact_sensitive_content(request.query)
    try:
        vector = await embed_query_text(safe_query)
    except Exception:
        raise HTTPException(status_code=502, detail="Nebius could not prepare this evidence search. No search was run.") from None
    return {"embedding": vector, "model": EMBEDDING_MODEL}

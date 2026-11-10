from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["decision", "ownership", "blocker", "risk", "next-action"]
Status = Literal["verified", "conflict", "missing_evidence"]


class Passage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    passage_id: str = Field(min_length=1, max_length=80)
    source_id: str = Field(min_length=1, max_length=80)
    source_title: str = Field(min_length=1, max_length=240)
    provider: str = Field(min_length=1, max_length=20)
    url: str | None = Field(default=None, max_length=1000)
    author: str | None = Field(default=None, max_length=160)
    occurred_at: str | None = Field(default=None, max_length=100)
    clearance: int = Field(default=1, ge=1, le=3)
    content: str = Field(min_length=1, max_length=30_000)


class ExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str = Field(min_length=1, max_length=80)
    passages: list[Passage] = Field(min_length=1, max_length=100)


class ExtractJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project_id: str = Field(min_length=1, max_length=80)
    clearance: int = Field(ge=1, le=3)
    passage_ids: list[str] = Field(min_length=1, max_length=100)


class CitationReference(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    passage_id: str = Field(min_length=1, max_length=80)
    quote: str = Field(min_length=6, max_length=1000)


class ObservedFact(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    topic: str = Field(min_length=2, max_length=120, description="Stable kebab-case topic key")
    category: Category
    statement: str = Field(min_length=3, max_length=1000)
    value: str = Field(min_length=1, max_length=300, description="Normalised state or value for conflict comparison")
    owner_name: str | None = Field(default=None, max_length=160)
    due_at: str | None = Field(default=None, max_length=100)
    confidence: float = Field(default=0.6, ge=0, le=1)
    evidence_gap: bool = False
    citations: list[CitationReference] = Field(min_length=1, max_length=10)


class ExtractionEnvelope(BaseModel):
    facts: list[ObservedFact] = Field(max_length=300)


class ExtractedClaim(BaseModel):
    topic: str
    title: str
    category: Category
    statement: str
    status: Status
    confidence: float
    clearance: int
    owner_name: str | None
    due_at: str | None
    citations: list[dict]


class ExtractResponse(BaseModel):
    extraction_mode: Literal["nebius"]
    model: str
    rejected_fact_count: int
    embedding_model: str | None
    redacted_passages: dict[str, str]
    embeddings: dict[str, list[float]]
    claims: list[ExtractedClaim]
    entities: list[dict]
    edges: list[dict]
    notices: list[str]

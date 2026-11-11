import os
from typing import Any

from openai import OpenAI

BASE_URL = "https://api.tokenfactory.nebius.com/v1"
CHAT_MODEL = os.getenv("NEBIUS_MODEL", "Qwen/Qwen3-235B-A22B-Instruct-2507").strip()
EMBEDDING_MODEL = os.getenv("NEBIUS_EMBEDDING_MODEL", "Qwen/Qwen3-Embedding-8B").strip()
EMBEDDING_DIMENSIONS = 768


class ModelOutputTruncatedError(RuntimeError):
    def __init__(self, finish_reason: str, completion_tokens: int | None, content_length: int):
        super().__init__("Nebius extraction output reached its token limit.")
        self.finish_reason = finish_reason
        self.completion_tokens = completion_tokens
        self.content_length = content_length


def create_client() -> OpenAI:
    api_key = os.getenv("NEBIUS_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("NEBIUS_API_KEY is not configured")
    base_url = os.getenv("NEBIUS_BASE_URL", BASE_URL).strip().rstrip("/")
    return OpenAI(api_key=api_key, base_url=base_url, timeout=120, max_retries=0)


def generate_json(client: Any, prompt: str, *, model: str = CHAT_MODEL) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0,
        max_tokens=8192,
    )
    content = response.choices[0].message.content if response.choices else None
    choice = response.choices[0] if response.choices else None
    if choice and getattr(choice, "finish_reason", None) == "length":
        usage = response.usage
        raise ModelOutputTruncatedError(
            choice.finish_reason,
            getattr(usage, "completion_tokens", None),
            len(content or ""),
        )
    if not content:
        message = choice.message if choice else None
        usage = response.usage
        error = RuntimeError("Nebius returned no structured extraction.")
        error.finish_reason = choice.finish_reason if choice else None
        error.completion_tokens = getattr(usage, "completion_tokens", None)
        error.content_length = 0
        error.reasoning_length = len(message.reasoning_content) if message and getattr(message, "reasoning_content", None) else 0
        error.has_refusal = bool(getattr(message, "refusal", None)) if message else False
        raise error
    return content


def generate_embeddings(client: Any, contents: list[str], *, model: str = EMBEDDING_MODEL) -> list[list[float]]:
    response = client.embeddings.create(
        model=model,
        input=contents,
        dimensions=EMBEDDING_DIMENSIONS,
        encoding_format="float",
    )
    data = sorted(response.data or [], key=lambda item: item.index)
    vectors = [list(item.embedding) for item in data]
    if len(vectors) != len(contents) or any(len(vector) != EMBEDDING_DIMENSIONS for vector in vectors):
        raise RuntimeError("Nebius returned an invalid evidence embedding.")
    return vectors

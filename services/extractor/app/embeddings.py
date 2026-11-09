import asyncio

from google.genai import types

from app.pipeline import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, _client


async def embed_query_text(query: str, *, client=None) -> list[float]:
    provider = client or _client()
    response = await asyncio.to_thread(
        provider.models.embed_content,
        model=EMBEDDING_MODEL,
        contents=query,
        config=types.EmbedContentConfig(
            output_dimensionality=EMBEDDING_DIMENSIONS,
            task_type="RETRIEVAL_QUERY",
        ),
    )
    embeddings = response.embeddings or []
    values = getattr(embeddings[0], "values", None) if embeddings else None
    if not values or len(values) != EMBEDDING_DIMENSIONS:
        raise RuntimeError("Gemini returned an invalid evidence-search embedding.")
    return list(values)

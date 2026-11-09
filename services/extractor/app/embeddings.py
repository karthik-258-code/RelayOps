import asyncio

from app.nebius import create_client, generate_embeddings


async def embed_query_text(query: str, *, client=None) -> list[float]:
    provider = client or create_client()
    try:
        vectors = await asyncio.to_thread(generate_embeddings, provider, [query])
        return vectors[0]
    finally:
        if client is None:
            provider.close()

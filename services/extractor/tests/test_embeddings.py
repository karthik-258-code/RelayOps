import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from app.embeddings import embed_query_text


class EmbeddingTests(unittest.TestCase):
    def test_query_uses_nebius_embeddings_and_expected_vector_size(self):
        create = Mock(return_value=SimpleNamespace(data=[SimpleNamespace(index=0, embedding=[0.1] * 768)]))
        client = SimpleNamespace(embeddings=SimpleNamespace(create=create))
        vector = asyncio.run(embed_query_text("Who owns the migration?", client=client))

        self.assertEqual(len(vector), 768)
        self.assertEqual(create.call_args.kwargs["input"], ["Who owns the migration?"])
        self.assertEqual(create.call_args.kwargs["dimensions"], 768)
        self.assertEqual(create.call_args.kwargs["encoding_format"], "float")


if __name__ == "__main__":
    unittest.main()

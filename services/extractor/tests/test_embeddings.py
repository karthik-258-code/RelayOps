import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.embeddings import embed_query_text


class EmbeddingTests(unittest.TestCase):
    def test_query_uses_retrieval_query_task_and_expected_vector_size(self):
        captured = {}

        class Models:
            def embed_content(self, **kwargs):
                captured.update(kwargs)
                return SimpleNamespace(embeddings=[SimpleNamespace(values=[0.1] * 768)])

        client = SimpleNamespace(models=Models())
        vector = asyncio.run(embed_query_text("Who owns the migration?", client=client))

        self.assertEqual(len(vector), 768)
        self.assertEqual(captured["contents"], "Who owns the migration?")
        self.assertEqual(captured["config"].task_type, "RETRIEVAL_QUERY")


if __name__ == "__main__":
    unittest.main()

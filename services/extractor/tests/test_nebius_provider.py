import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch


class NebiusProviderTests(unittest.TestCase):
    def test_client_uses_token_factory_endpoint_and_nebius_key(self):
        from app.nebius import create_client

        with patch.dict(os.environ, {"NEBIUS_API_KEY": "test-nebius-key", "NEBIUS_BASE_URL": "https://api.tokenfactory.nebius.com/v1"}, clear=True):
            with patch("app.nebius.OpenAI") as openai_client:
                create_client()

        openai_client.assert_called_once_with(
            api_key="test-nebius-key",
            base_url="https://api.tokenfactory.nebius.com/v1",
            timeout=90,
            max_retries=0,
        )

    def test_client_fails_closed_when_nebius_key_is_missing(self):
        from app.nebius import create_client

        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "NEBIUS_API_KEY"):
                create_client()

    def test_chat_generation_requests_json_and_returns_model_content(self):
        from app.nebius import generate_json

        message = SimpleNamespace(content='{"facts": []}')
        response = SimpleNamespace(choices=[SimpleNamespace(message=message)])
        create = unittest.mock.Mock(return_value=response)
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

        content = generate_json(client, "Extract facts", model="test/model")

        self.assertEqual(content, '{"facts": []}')
        self.assertEqual(create.call_args.kwargs["model"], "test/model")
        self.assertEqual(create.call_args.kwargs["response_format"], {"type": "json_object"})
        self.assertEqual(create.call_args.kwargs["temperature"], 0)

    def test_embeddings_request_uses_persisted_vector_dimension(self):
        from app.nebius import EMBEDDING_DIMENSIONS, generate_embeddings

        response = SimpleNamespace(data=[
            SimpleNamespace(index=1, embedding=[0.0] * EMBEDDING_DIMENSIONS),
            SimpleNamespace(index=0, embedding=[1.0] * EMBEDDING_DIMENSIONS),
        ])
        create = unittest.mock.Mock(return_value=response)
        client = SimpleNamespace(embeddings=SimpleNamespace(create=create))

        vectors = generate_embeddings(client, ["first", "second"], model="test/embed")

        self.assertEqual(vectors[0][0], 1.0)
        self.assertEqual(vectors[1][0], 0.0)
        create.assert_called_once_with(
            model="test/embed",
            input=["first", "second"],
            dimensions=EMBEDDING_DIMENSIONS,
            encoding_format="float",
        )


if __name__ == "__main__":
    unittest.main()

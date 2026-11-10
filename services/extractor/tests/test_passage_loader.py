import json
import unittest
from io import BytesIO
from urllib.error import HTTPError
from pydantic import ValidationError

from app.main import RedactionRequest
from app.passage_loader import PassageLoadError, fetch_stored_passages
from app.schemas import ExtractJobRequest


class PassageLoaderTests(unittest.TestCase):
    def setUp(self):
        self.job = ExtractJobRequest(
            project_id="20000000-0000-4000-8000-000000000011",
            clearance=2,
            passage_ids=["31000000-0000-4000-8000-000000000001"],
        )
        self.body = {
            "passages": [{
                "passage_id": self.job.passage_ids[0],
                "source_id": "30000000-0000-4000-8000-000000000001",
                "source_title": "Runbook",
                "provider": "document",
                "url": None,
                "author": "Mina",
                "occurred_at": "2026-11-10T10:00:00Z",
                "clearance": 1,
                "content": "Rotate the key before rollout.",
            }]
        }

    def test_extraction_job_accepts_ids_but_rejects_source_text(self):
        payload = {
            "project_id": self.job.project_id,
            "clearance": 2,
            "passage_ids": self.job.passage_ids,
        }
        self.assertEqual(ExtractJobRequest.model_validate(payload), self.job)
        with self.assertRaises(ValidationError):
            ExtractJobRequest.model_validate({**payload, "content": "source text"})

    def test_fetches_only_requested_ids_from_authenticated_callback(self):
        captured = {}

        def opener(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return BytesIO(json.dumps(self.body).encode())

        result = fetch_stored_passages(self.job, "http://127.0.0.1:3000/", "shared-key", opener=opener)

        payload = json.loads(captured["request"].data)
        self.assertEqual(captured["request"].full_url, "http://127.0.0.1:3000/api/internal/extraction-passages")
        self.assertEqual(captured["request"].get_header("X-relayops-extractor-key"), "shared-key")
        self.assertEqual(captured["timeout"], 30)
        self.assertEqual(payload, {
            "project_id": self.job.project_id,
            "clearance": 2,
            "passage_ids": self.job.passage_ids,
        })
        self.assertNotIn("content", payload)
        self.assertEqual(result.passages[0].content, "Rotate the key before rollout.")

    def test_rejects_callback_that_returns_an_unrequested_passage(self):
        self.body["passages"][0]["passage_id"] = "31000000-0000-4000-8000-000000000099"

        with self.assertRaisesRegex(PassageLoadError, "callback_passage_scope_mismatch"):
            fetch_stored_passages(self.job, "http://127.0.0.1:3000", "shared-key", opener=lambda *_args, **_kwargs: BytesIO(json.dumps(self.body).encode()))

    def test_maps_callback_authorization_failure_without_exposing_response_body(self):
        def opener(*_args, **_kwargs):
            raise HTTPError("http://127.0.0.1:3000/callback", 403, "blocked", {}, BytesIO(b"sensitive response"))

        with self.assertRaisesRegex(PassageLoadError, "callback_unauthorized") as failure:
            fetch_stored_passages(self.job, "http://127.0.0.1:3000", "shared-key", opener=opener)
        self.assertNotIn("sensitive response", str(failure.exception))

    def test_redaction_request_accepts_the_full_import_batch(self):
        source = {"id": "source", "title": "Title", "author": "Author", "content": "Text", "observations": []}
        self.assertEqual(len(RedactionRequest(sources=[source] * 50).sources), 50)
        with self.assertRaises(ValidationError):
            RedactionRequest(sources=[source] * 51)


if __name__ == "__main__":
    unittest.main()

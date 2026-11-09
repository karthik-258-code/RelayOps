import unittest

from app.provider_errors import classify_nebius_failure, safe_provider_metadata


class ProviderFailureTests(unittest.TestCase):
    def test_classifies_quota_without_returning_raw_provider_text(self):
        error = RuntimeError("RESOURCE_EXHAUSTED: private prompt text and key=secret")
        error.status = "RESOURCE_EXHAUSTED"
        status, detail, provider_status = classify_nebius_failure(error)
        self.assertEqual(status, 429)
        self.assertIn("limit", detail)
        self.assertNotIn("secret", detail)
        self.assertIsNone(provider_status)

    def test_classifies_invalid_request_and_sanitizes_log_metadata(self):
        error = RuntimeError("request included sensitive source text")
        error.code = 400
        error.status = "INVALID_ARGUMENT"
        status, detail, provider_status = classify_nebius_failure(error)
        self.assertEqual(status, 502)
        self.assertEqual(provider_status, 400)
        self.assertIn("structured JSON", detail)
        metadata = safe_provider_metadata(error)
        self.assertEqual(metadata["provider_status_code"], 400)
        self.assertNotIn("private", str(metadata))
        self.assertNotIn("sensitive", str(metadata))

    def test_does_not_expose_error_message_for_unknown_failures(self):
        error = RuntimeError("secret-bearing provider detail")
        status, detail, _ = classify_nebius_failure(error)
        self.assertEqual(status, 502)
        self.assertNotIn("secret", detail)

    def test_classifies_token_factory_payment_required(self):
        error = RuntimeError("balance details and secret token must stay private")
        error.status_code = 402
        status, detail, provider_status = classify_nebius_failure(error)
        self.assertEqual(status, 402)
        self.assertEqual(provider_status, 402)
        self.assertIn("credit", detail)
        self.assertNotIn("secret", detail)

    def test_logs_safe_completion_diagnostics_without_model_content(self):
        error = RuntimeError("private model output must not appear")
        error.finish_reason = "length"
        error.completion_tokens = 8192
        error.content_length = 0
        error.reasoning_length = 2048
        metadata = safe_provider_metadata(error)
        self.assertEqual(metadata["finish_reason"], "length")
        self.assertEqual(metadata["completion_tokens"], 8192)
        self.assertEqual(metadata["content_length"], 0)
        self.assertEqual(metadata["reasoning_length"], 2048)
        self.assertNotIn("private model output", str(metadata))

    def test_logs_validation_error_paths_without_untrusted_values(self):
        error = RuntimeError("untrusted generated content")
        error.errors = lambda **_kwargs: [{"type": "missing", "loc": ("facts", 0, "topic"), "input": "secret source text"}]
        metadata = safe_provider_metadata(error)
        self.assertEqual(metadata["validation_errors"], [{"type": "missing", "loc": ["facts", 0, "topic"]}])
        self.assertNotIn("secret source text", str(metadata))


if __name__ == "__main__":
    unittest.main()

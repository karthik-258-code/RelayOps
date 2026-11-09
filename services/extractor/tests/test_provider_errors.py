import unittest

from app.provider_errors import classify_gemini_failure, safe_provider_metadata


class ProviderFailureTests(unittest.TestCase):
    def test_classifies_quota_without_returning_raw_provider_text(self):
        error = RuntimeError("RESOURCE_EXHAUSTED: private prompt text and key=secret")
        error.status = "RESOURCE_EXHAUSTED"
        status, detail, provider_status = classify_gemini_failure(error)
        self.assertEqual(status, 429)
        self.assertIn("quota", detail)
        self.assertNotIn("secret", detail)
        self.assertIsNone(provider_status)

    def test_classifies_invalid_request_and_sanitizes_log_metadata(self):
        error = RuntimeError("request included sensitive source text")
        error.code = 400
        error.status = "INVALID_ARGUMENT"
        status, detail, provider_status = classify_gemini_failure(error)
        self.assertEqual(status, 502)
        self.assertEqual(provider_status, 400)
        self.assertIn("structured response schema", detail)
        metadata = safe_provider_metadata(error)
        self.assertEqual(metadata["provider_status_code"], 400)
        self.assertNotIn("private", str(metadata))
        self.assertNotIn("sensitive", str(metadata))

    def test_does_not_expose_error_message_for_unknown_failures(self):
        error = RuntimeError("secret-bearing provider detail")
        status, detail, _ = classify_gemini_failure(error)
        self.assertEqual(status, 502)
        self.assertNotIn("secret", detail)


if __name__ == "__main__":
    unittest.main()

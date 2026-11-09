import unittest

from app.validation import reconcile_facts, validate_fact_citations
from app.privacy import redact_sensitive_content
from app.schemas import ExtractionEnvelope


class CitationValidationTests(unittest.TestCase):
    def test_extraction_uses_low_gemini_thinking_level_for_bounded_latency(self):
        from app.pipeline import build_extraction_config

        self.assertEqual(build_extraction_config().thinking_config.thinking_level.value, "LOW")

    def test_gemini_response_schema_omits_unsupported_additional_properties(self):
        def contains_additional_properties(value):
            if isinstance(value, dict):
                return "additionalProperties" in value or any(contains_additional_properties(item) for item in value.values())
            if isinstance(value, list):
                return any(contains_additional_properties(item) for item in value)
            return False

        self.assertFalse(contains_additional_properties(ExtractionEnvelope.model_json_schema()))

    def test_accepts_exact_quote_and_calculates_offsets(self):
        passages = {"p-1": {"content": "The migration ships on Friday.", "clearance": 2}}
        facts = [{"topic": "migration-date", "category": "decision", "statement": "Migration ships Friday.", "value": "friday", "citations": [{"passage_id": "p-1", "quote": "ships on Friday"}]}]
        validated, rejected = validate_fact_citations(facts, passages)
        self.assertEqual(rejected, 0)
        self.assertEqual(validated[0]["citations"][0]["start_offset"], 14)
        self.assertEqual(validated[0]["citations"][0]["end_offset"], 29)

    def test_rejects_invented_passage_and_nonmatching_quote(self):
        passages = {"p-1": {"content": "The migration ships on Friday.", "clearance": 1}}
        facts = [
            {"topic": "fake-source", "category": "risk", "statement": "Secret.", "value": "secret", "citations": [{"passage_id": "not-real", "quote": "Secret"}]},
            {"topic": "fake-quote", "category": "risk", "statement": "Monday.", "value": "monday", "citations": [{"passage_id": "p-1", "quote": "ships on Monday"}]},
        ]
        validated, rejected = validate_fact_citations(facts, passages)
        self.assertEqual(validated, [])
        self.assertEqual(rejected, 2)


class PrivacyTests(unittest.TestCase):
    def test_redacts_provider_keys_and_email_before_model_use(self):
        fake_token = "ghp_" + "abcdefghijklmnopqrstuvwxyz1234567890"
        text = f"Contact alex@example.com; token={fake_token}"
        redacted = redact_sensitive_content(text)
        self.assertNotIn("alex@example.com", redacted)
        self.assertNotIn(fake_token, redacted)
        self.assertIn("[REDACTED_PII]", redacted)


class ReconciliationTests(unittest.TestCase):
    def test_conflicting_values_remain_unresolved_with_both_citations(self):
        facts = [
            {"topic": "session-store", "category": "decision", "statement": "Use Redis.", "value": "redis", "confidence": .9, "evidence_gap": False, "clearance": 1, "owner_name": None, "due_at": None, "citations": [{"passage_id": "p1", "quote": "Use Redis.", "clearance": 1}]},
            {"topic": "session-store", "category": "decision", "statement": "Use Postgres.", "value": "postgres", "confidence": .8, "evidence_gap": False, "clearance": 2, "owner_name": None, "due_at": None, "citations": [{"passage_id": "p2", "quote": "Use Postgres.", "clearance": 2}]},
        ]
        claim = reconcile_facts(facts)[0]
        self.assertEqual(claim["status"], "conflict")
        self.assertEqual(len(claim["citations"]), 2)
        self.assertEqual(claim["clearance"], 2)
        self.assertNotIn("approved_at", claim)


if __name__ == "__main__":
    unittest.main()

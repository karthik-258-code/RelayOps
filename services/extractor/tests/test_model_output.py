import json
import unittest

from app.pipeline import parse_model_facts
from app.main import build_rejected_fact_notice


def fact(topic: str, quote: str) -> dict:
    return {
        "topic": topic,
        "category": "decision",
        "statement": f"The {topic} decision is recorded.",
        "value": "recorded",
        "citations": [{"passage_id": "p-1", "quote": quote}],
    }


class ModelOutputParsingTests(unittest.TestCase):
    def test_parse_model_facts_rejects_only_invalid_items(self):
        response = json.dumps({"facts": [
            fact("database-choice", "PostgreSQL is the approved database."),
            {"topic": "missing-statement", "category": "decision", "value": "unknown", "citations": [{"passage_id": "p-1", "quote": "The evidence remains available."}]},
        ]})

        parsed, rejected = parse_model_facts(response)

        self.assertEqual([item["topic"] for item in parsed], ["database-choice"])
        self.assertEqual(rejected, 1)

    def test_parse_model_facts_rejects_quote_over_limit(self):
        response = json.dumps({"facts": [
            fact("database-choice", "PostgreSQL is the approved database."),
            fact("oversized-quote", "x" * 8153),
        ]})

        parsed, rejected = parse_model_facts(response)

        self.assertEqual([item["topic"] for item in parsed], ["database-choice"])
        self.assertEqual(rejected, 1)

    def test_parse_model_facts_rejects_malformed_top_level(self):
        too_many_facts = [fact("database-choice", "PostgreSQL is the database.") for _ in range(301)]
        for response in ("not json", json.dumps({"facts": "not-an-array"}), json.dumps({"facts": too_many_facts})):
            with self.subTest(response=response[:20]):
                with self.assertRaises(ValueError):
                    parse_model_facts(response)

    def test_rejected_fact_notice_explains_schema_and_evidence_filtering(self):
        self.assertIsNone(build_rejected_fact_notice(0))
        self.assertEqual(
            build_rejected_fact_notice(1),
            "1 model fact was excluded because it failed schema or evidence validation.",
        )
        self.assertEqual(
            build_rejected_fact_notice(2),
            "2 model facts were excluded because they failed schema or evidence validation.",
        )


if __name__ == "__main__":
    unittest.main()

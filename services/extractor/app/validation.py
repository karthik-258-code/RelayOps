from collections import defaultdict
import re

ALLOWED_CATEGORIES = {"decision", "ownership", "blocker", "risk", "next-action"}


def _normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def validate_fact_citations(facts: list[dict], passages: dict[str, dict]) -> tuple[list[dict], int]:
    """Return only well-formed facts whose quotes resolve verbatim to stored passages."""
    accepted: list[dict] = []
    rejected = 0
    for fact in facts:
        topic = fact.get("topic")
        category = fact.get("category")
        statement = fact.get("statement")
        value = fact.get("value")
        citations = fact.get("citations")
        if (
            not isinstance(topic, str) or not topic.strip() or len(topic) > 120
            or category not in ALLOWED_CATEGORIES
            or not isinstance(statement, str) or not statement.strip()
            or not isinstance(value, str) or not value.strip()
            or not isinstance(citations, list) or not citations
        ):
            rejected += 1
            continue

        verified_citations = []
        invalid = False
        for citation in citations:
            passage_id = citation.get("passage_id") if isinstance(citation, dict) else None
            quote = citation.get("quote") if isinstance(citation, dict) else None
            passage = passages.get(passage_id) if isinstance(passage_id, str) else None
            if not passage or not isinstance(quote, str) or not quote.strip():
                invalid = True
                break
            content = passage["content"]
            start = content.find(quote)
            if start < 0:
                invalid = True
                break
            verified_citations.append({
                "passage_id": passage_id,
                "quote": quote,
                "start_offset": start,
                "end_offset": start + len(quote),
                "clearance": int(passage.get("clearance", 1)),
            })
        if invalid:
            rejected += 1
            continue

        accepted.append({
            "topic": topic.strip().lower(),
            "category": category,
            "statement": statement.strip(),
            "value": _normalise(value),
            "owner_name": fact.get("owner_name"),
            "due_at": fact.get("due_at"),
            "confidence": max(0.0, min(1.0, float(fact.get("confidence", 0.5)))),
            "evidence_gap": bool(fact.get("evidence_gap", False)),
            "citations": verified_citations,
            "clearance": max(citation["clearance"] for citation in verified_citations),
        })
    return accepted, rejected


def reconcile_facts(facts: list[dict]) -> list[dict]:
    """Group facts by stable topic and preserve disagreements as unresolved conflicts."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for fact in facts:
        groups[fact["topic"]].append(fact)

    claims = []
    for topic, group in groups.items():
        values = {fact["value"] for fact in group}
        categories = {fact["category"] for fact in group}
        citations = [citation for fact in group for citation in fact["citations"]]
        clearance = max(citation["clearance"] for citation in citations)
        status = "conflict" if len(values) > 1 else "missing_evidence" if any(fact["evidence_gap"] for fact in group) else "verified"
        if len(categories) > 1:
            status = "conflict"
        statement = group[-1]["statement"]
        if status == "conflict":
            label = topic.replace("-", " ")
            statement = f"Sources report different states for {label}. Review both before sharing."
        claims.append({
            "topic": topic,
            "title": topic.replace("-", " "),
            "category": group[-1]["category"],
            "statement": statement,
            "status": status,
            "confidence": min(fact["confidence"] for fact in group),
            "clearance": clearance,
            "citations": citations,
            "owner_name": next((fact["owner_name"] for fact in reversed(group) if fact.get("owner_name")), None),
            "due_at": next((fact["due_at"] for fact in reversed(group) if fact.get("due_at")), None),
        })
    return sorted(claims, key=lambda claim: (claim["category"], claim["topic"]))

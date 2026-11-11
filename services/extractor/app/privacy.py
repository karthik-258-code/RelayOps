import re

_private_key = re.compile(r"-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----", re.I)
_provider_secret = re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b")
_bearer = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}", re.I)
_assigned_secret = re.compile(r"\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|password|passwd|authorization)\b\s*[:=]\s*[\"']?([^\s,;\"'}]{8,})[\"']?", re.I)
_email = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_phone = re.compile(r"(?<![\w-])(?:\+?\d[\d .()/-]{8,}\d)(?![\w-])")
_technical_location_terms = {"postgres", "postgresql"}

_analyzer = None
_anonymizer = None
PRESIDIO_READY = False

try:
    from presidio_analyzer import AnalyzerEngine
    from presidio_analyzer.nlp_engine import NlpEngineProvider
    from presidio_anonymizer import AnonymizerEngine
    from presidio_anonymizer.entities import OperatorConfig

    provider = NlpEngineProvider(nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
    })
    _analyzer = AnalyzerEngine(nlp_engine=provider.create_engine(), supported_languages=["en"])
    _anonymizer = AnonymizerEngine()
    _operator_config = OperatorConfig("replace", {"new_value": "[REDACTED_PII]"})
    PRESIDIO_READY = True
except Exception:
    # Service still starts without the optional language model; regex scanners remain active.
    _operator_config = None


def redact_sensitive_content(text: str) -> str:
    redacted = _private_key.sub("[REDACTED_PRIVATE_KEY]", text)
    redacted = _provider_secret.sub("[REDACTED_SECRET]", redacted)
    redacted = _bearer.sub("Bearer [REDACTED_SECRET]", redacted)
    redacted = _assigned_secret.sub(lambda match: f"{match.group(1)}=[REDACTED_SECRET]", redacted)
    redacted = _email.sub("[REDACTED_PII]", redacted)
    redacted = _phone.sub(lambda match: "[REDACTED_PII]" if sum(ch.isdigit() for ch in match.group(0)) >= 10 else match.group(0), redacted)

    if _analyzer and _anonymizer and _operator_config:
        try:
            findings = _analyzer.analyze(
                text=redacted,
                language="en",
                entities=["PHONE_NUMBER", "EMAIL_ADDRESS", "CREDIT_CARD", "US_SSN", "IBAN_CODE", "IP_ADDRESS", "LOCATION"],
            )
            findings = [
                finding for finding in findings
                if not (
                    finding.entity_type == "LOCATION"
                    and redacted[finding.start:finding.end].casefold() in _technical_location_terms
                )
            ]
            redacted = _anonymizer.anonymize(
                text=redacted,
                analyzer_results=findings,
                operators={"DEFAULT": _operator_config},
            ).text
        except Exception:
            # A Presidio runtime issue must not bypass the deterministic secret masks above.
            pass
    return redacted

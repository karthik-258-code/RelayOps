const privateKeyPattern = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/gi;
const providerSecretPattern = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/g;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/gi;
const assignedSecretPattern = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|password|passwd|authorization)\b\s*[:=]\s*["']?([^\s,;"'}]{8,})["']?/gi;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /(?<![\w-])(?:\+?\d[\d .()/-]{8,}\d)(?![\w-])/g;

/** Redacts common credentials and direct contact details before storage or model use. */
export function redactSensitiveData(value: string): string {
  return value
    .replace(privateKeyPattern, '[REDACTED_PRIVATE_KEY]')
    .replace(providerSecretPattern, '[REDACTED_SECRET]')
    .replace(bearerPattern, 'Bearer [REDACTED_SECRET]')
    .replace(assignedSecretPattern, (_match, label: string) => `${label}=[REDACTED_SECRET]`)
    .replace(emailPattern, '[REDACTED_PII]')
    .replace(phonePattern, (match) => (match.match(/\d/g)?.length ?? 0) >= 10 ? '[REDACTED_PII]' : match);
}

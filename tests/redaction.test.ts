import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveData } from '../lib/security/redact';

test('masks common provider secrets and bearer credentials', () => {
  const fakeGitHubToken = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz1234567890';
  const input = `token=${fakeGitHubToken} and Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456`;
  const output = redactSensitiveData(input);
  assert.doesNotMatch(output, new RegExp(fakeGitHubToken));
  assert.doesNotMatch(output, /Bearer abcdefghijklmnopqrstuvwxyz123456/);
  assert.match(output, /\[REDACTED_SECRET\]/);
});

test('masks email addresses and private key blocks while preserving surrounding evidence', () => {
  const input = 'Owner contact: alex@example.com\n-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----\nThe migration starts next week.';
  const output = redactSensitiveData(input);
  assert.doesNotMatch(output, /alex@example.com|private-material/);
  assert.match(output, /Owner contact: \[REDACTED_PII\]/);
  assert.match(output, /The migration starts next week\./);
});

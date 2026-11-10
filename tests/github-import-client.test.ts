import assert from 'node:assert/strict';
import test from 'node:test';
import { submitGitHubImport } from '../lib/github/import-client';

test('GitHub import sends repository details once and receives a saved receipt', async () => {
  const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const message = '12 sources saved. 4 evidence-backed findings ready for review.';

  const receipt = await submitGitHubImport(
    '20000000-0000-4000-8000-000000000011',
    'https://github.com/acme/handbook',
    'fine-grained-token',
    async (input, init) => {
      requests.push({ input, init });
      return Response.json({ repository: 'acme/handbook', imported: 12, findings: 4, message }, { status: 201 });
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(String(requests[0].input), '/api/v1/projects/20000000-0000-4000-8000-000000000011/github');
  assert.equal(requests[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    url: 'https://github.com/acme/handbook',
    token: 'fine-grained-token',
  });
  assert.equal(receipt.message, message);
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseGitHubRepositoryUrl } from "../lib/github/repository";

test("accepts canonical public GitHub repository URLs", () => {
  assert.deepEqual(
    parseGitHubRepositoryUrl("https://github.com/owner/project"),
    { ok: true, value: { owner: "owner", repo: "project" } },
  );
});

test("normalizes an optional .git suffix", () => {
  assert.deepEqual(
    parseGitHubRepositoryUrl("https://github.com/owner/project.git"),
    { ok: true, value: { owner: "owner", repo: "project" } },
  );
});

test("rejects non-GitHub hosts and non-HTTPS URLs", () => {
  assert.equal(parseGitHubRepositoryUrl("https://github.com.evil.test/o/r").ok, false);
  assert.equal(parseGitHubRepositoryUrl("http://github.com/o/r").ok, false);
});

test("rejects credentials, extra paths, and missing repository names", () => {
  assert.equal(parseGitHubRepositoryUrl("https://user@github.com/o/r").ok, false);
  assert.equal(parseGitHubRepositoryUrl("https://github.com/o/r/tree/main").ok, false);
  assert.equal(parseGitHubRepositoryUrl("https://github.com/o/").ok, false);
});

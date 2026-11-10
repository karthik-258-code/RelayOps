import assert from "node:assert/strict";
import test from "node:test";
import { interviewPromptFor } from "../lib/domain/interview-prompts";

test("exit interview prompt targets the missing context for each claim category", () => {
  assert.equal(interviewPromptFor("ownership"), "What does this person own today, and what should the next teammate know to maintain it?");
  assert.equal(interviewPromptFor("decision"), "What led to this decision, and which alternatives or trade-offs should the next teammate know?");
  assert.equal(interviewPromptFor("blocker"), "What is blocking progress, who or what can unblock it, and what has already been tried?");
  assert.equal(interviewPromptFor("risk"), "What could go wrong, what warning signs should the next teammate watch, and what mitigation exists?");
  assert.equal(interviewPromptFor("next-action"), "What is the next concrete action, who should take it, and what needs to happen first?");
});

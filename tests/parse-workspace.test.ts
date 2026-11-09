import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceFiles } from "../lib/ingestion/parse-workspace";

function jsonFile(name: string, value: unknown): File {
  return new File([JSON.stringify(value)], name, { type: "application/json" });
}

test("normalizes Linear issue exports with stable provenance and labeled facts", async () => {
  const sources = await parseWorkspaceFiles([jsonFile("linear.json", { issues: [{ id: "issue-1", identifier: "CH-184", title: "Session rollout", description: "Decision: keep Redis for pilot\nOwner: Mina Patel", createdAt: "2026-10-30T11:30:00Z", assignee: "Mina Patel" }] })]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].kind, "task");
  assert.equal(sources[0].id, "LINEAR-ch-184");
  assert.equal(sources[0].author, "Mina Patel");
  assert.equal(sources[0].observations.length, 2);
  assert.equal(sources[0].observations[0].category, "decision");
  assert.equal(sources[0].observations[1].category, "ownership");
  assert.equal(sources[0].observations[1].ownerName, "Mina Patel");
});

test("normalizes Slack channel exports and retains restricted clearance", async () => {
  const sources = await parseWorkspaceFiles([jsonFile("slack.json", { channel_name: "launch-war-room", clearance: 3, messages: [{ ts: "2026-11-01T08:30:00Z", user_name: "Project lead", text: "Risk: credentials must rotate before rollout" }] })]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].kind, "discussion");
  assert.equal(sources[0].clearance, 3);
  assert.match(sources[0].title, /launch-war-room/);
  assert.equal(sources[0].observations[0].category, "risk");
  assert.match(sources[0].observations[0].excerpt ?? "", /Project lead: Risk: credentials must rotate before rollout/);
});

test("groups Slack thread replies and converts Slack Unix timestamps", async () => {
  const sources = await parseWorkspaceFiles([jsonFile("channel.json", [
    { ts: "1793510400.000001", user_name: "Mina", text: "Decision: keep Redis for pilot", thread_ts: "1793510400.000001" },
    { ts: "1793510460.000001", user_name: "Arjun", text: "Next action: add rollback evidence", thread_ts: "1793510400.000001" },
  ])]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].author, "2 messages");
  assert.equal(sources[0].observations.length, 2);
  assert.equal(Date.parse(sources[0].occurredAt), 1793510400 * 1000);
});

test("normalizes native DiscordChatExporter thread exports and nested author metadata", async () => {
  const sources = await parseWorkspaceFiles([jsonFile("discord.json", { guild: { name: "Chronos" }, channel: { id: "thread-1", name: "migration", type: 11, parentId: "channel-1" }, clearance: 2, messages: [
    { id: "m1", thread_id: "t1", timestamp: "2026-11-01T10:00:00Z", author: { name: "Mina" }, content: "Decision: keep Redis for pilot" },
    { id: "m2", thread_id: "t1", timestamp: "2026-11-01T10:02:00Z", author: { name: "Arjun" }, content: "Next action: document rollback" },
  ] })]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].kind, "discussion");
  assert.equal(sources[0].clearance, 2);
  assert.equal(sources[0].author, "2 messages");
  assert.match(sources[0].content, /Mina: Decision: keep Redis/);
  assert.equal(sources[0].observations.length, 2);
});

test("rejects normalized source batches beyond the API record limit", async () => {
  const messages = Array.from({ length: 51 }, (_, index) => ({ ts: `${1793510400 + index}`, user_name: "Mina", text: `Decision: keep Redis ${index}` }));
  await assert.rejects(() => parseWorkspaceFiles([jsonFile("large-channel.json", messages)]), /batches of 50 records or fewer/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { detectOrphanedOwnership } from "../lib/reconstruction/orphaned-ownership";
import type { SourceRecord } from "../lib/domain/types";

function source(id: string, author: string, occurredAt: string, kind: SourceRecord["kind"] = "repository", content = "Commit summary"): SourceRecord {
  return { id, title: id, kind, occurredAt, author, clearance: 1, content, observations: [] };
}

test("flags a contributor above the 70 percent threshold with no linked handover context", () => {
  const sources = [
    ...Array.from({ length: 8 }, (_, i) => source(`github:o/r:commit:${i}`, "Asha", `2026-11-${String(2 + i).padStart(2, "0")}T10:00:00Z`)),
    ...Array.from({ length: 2 }, (_, i) => source(`github:o/r:commit:other-${i}`, "Dev", `2026-11-${String(8 + i).padStart(2, "0")}T10:00:00Z`)),
  ];
  const result = detectOrphanedOwnership(sources, new Date("2026-11-11T00:00:00Z"));
  assert.equal(result.length, 1);
  assert.equal(result[0].author, "Asha");
  assert.equal(result[0].commitCount, 8);
  assert.equal(result[0].share, 0.8);
  assert.equal(result[0].sourceIds.length, 8);
});

test("does not flag when the author has linked documentation or when commits fall outside 14 days", () => {
  const commits = Array.from({ length: 8 }, (_, i) => source(`github:o/r:commit:${i}`, "Asha", `2026-11-${String(2 + i).padStart(2, "0")}T10:00:00Z`));
  const other = Array.from({ length: 2 }, (_, i) => source(`github:o/r:commit:other-${i}`, "Dev", `2026-11-${String(8 + i).padStart(2, "0")}T10:00:00Z`));
  assert.equal(detectOrphanedOwnership([...commits, ...other, source("doc", "Team", "2026-11-10T10:00:00Z", "document", "Asha owns the adapter")], new Date("2026-11-11T00:00:00Z")).length, 0);
  assert.equal(detectOrphanedOwnership([...commits, ...other].map((item) => ({ ...item, occurredAt: "2026-10-01T10:00:00Z" })), new Date("2026-11-11T00:00:00Z")).length, 0);
});

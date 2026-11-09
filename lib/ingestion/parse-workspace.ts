import type { ClaimCategory, Clearance, Observation, SourceKind, SourceRecord } from "@/lib/domain/types";

const categories: ClaimCategory[] = ["decision", "ownership", "blocker", "risk", "next-action"];
const sourceKinds: SourceKind[] = ["document", "task", "discussion", "repository"];
const maxFiles = 10;
const maxFileBytes = 2 * 1024 * 1024;

function slug(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "source";
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  return Object.fromEntries(match[1].split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf(":");
    if (separator < 1) return [];
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    return [[key, value]];
  }));
}

function categoryFromHeading(heading: string): ClaimCategory | null {
  const normalized = heading.toLocaleLowerCase().replace(/[^a-z ]/g, "").trim();
  if (normalized.startsWith("decision")) return "decision";
  if (normalized.startsWith("ownership")) return "ownership";
  if (normalized.startsWith("blocker")) return "blocker";
  if (normalized.startsWith("risk")) return "risk";
  if (normalized.startsWith("next action") || normalized.startsWith("next step")) return "next-action";
  return null;
}

function parseMarkdown(fileName: string, text: string): SourceRecord {
  const metadata = parseFrontmatter(text);
  const body = text.replace(/^---\s*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
  const observations: Observation[] = [];
  let activeCategory: ClaimCategory | null = null;

  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      activeCategory = categoryFromHeading(heading[1]);
      continue;
    }
    const item = line.match(/^\s*[-*]\s*(?:\[([^\]]+)\]\s*)?([^:]+):\s*(.+)$/);
    if (!item || !activeCategory) continue;
    const topicLabel = (item[1] || item[2]).trim();
    const statement = `${item[2].trim()}: ${item[3].trim()}`;
    const value = item[3].trim().toLocaleLowerCase();
    observations.push({ topic: slug(topicLabel), category: activeCategory, statement, value, excerpt: line.trim() });
  }

  const title = metadata.title || fileName.replace(/\.md$/i, "");
  const id = metadata.id || `MD-${slug(fileName)}`;
  if (metadata.occurredAt && Number.isNaN(Date.parse(metadata.occurredAt))) {
    throw new Error(`${fileName}: occurredAt must be a valid date or ISO timestamp.`);
  }
  if (!observations.length) {
    observations.push({
      topic: `unparsed-${slug(id)}`,
      category: "risk",
      statement: `No structured handover facts were extracted from ${title}. Add a supported heading and bullet to include claims from this file.`,
      value: "missing-structured-facts",
      excerpt: body.slice(0, 500) || fileName,
      evidenceGap: true,
    });
  }

  const kind = sourceKinds.includes(metadata.kind as SourceKind) ? metadata.kind as SourceKind : "document";
  const clearanceValue = Number(metadata.clearance || 1);
  const clearance: Clearance = clearanceValue === 2 || clearanceValue === 3 ? clearanceValue : 1;
  return {
    id,
    title,
    kind,
    occurredAt: metadata.occurredAt || new Date().toISOString(),
    author: metadata.author || "Imported Markdown",
    clearance,
    content: body,
    observations,
  };
}

export function parseMarkdownSource(fileName: string, text: string): SourceRecord {
  return parseMarkdown(fileName, text);
}

function isObservation(value: unknown): value is Observation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Observation>;
  return typeof item.topic === "string" && typeof item.statement === "string" && typeof item.value === "string" && categories.includes(item.category as ClaimCategory);
}

function isSourceRecord(value: unknown): value is SourceRecord {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<SourceRecord>;
  return typeof source.id === "string" && typeof source.title === "string" &&
    (source.url === undefined || (typeof source.url === "string" && /^https:\/\//i.test(source.url))) &&
    sourceKinds.includes(source.kind as SourceKind) && typeof source.occurredAt === "string" && !Number.isNaN(Date.parse(source.occurredAt)) &&
    typeof source.author === "string" && [1, 2, 3].includes(source.clearance as number) &&
    typeof source.content === "string" && Array.isArray(source.observations) && source.observations.every(isObservation);
}

function parseJson(fileName: string, text: string): SourceRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${fileName}: JSON is not valid. Check commas, quotes, and brackets.`);
  }
  const sources = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { sources?: unknown }).sources) ? (parsed as { sources: unknown[] }).sources : [parsed];
  if (!sources.length || !sources.every(isSourceRecord)) {
    throw new Error(`${fileName}: expected a source record or { "sources": [...] } with id, title, kind, occurredAt, author, clearance, content, and observations.`);
  }
  return sources;
}

export async function parseWorkspaceFiles(files: File[]): Promise<SourceRecord[]> {
  if (!files.length) throw new Error("Choose at least one Markdown or JSON file.");
  if (files.length > maxFiles) throw new Error(`Choose up to ${maxFiles} files at a time.`);
  const sources: SourceRecord[] = [];

  for (const file of files) {
    if (file.size > maxFileBytes) throw new Error(`${file.name} is over 2 MB. Split it into smaller files and retry.`);
    const text = await file.text();
    if (/\.md$/i.test(file.name)) sources.push(parseMarkdown(file.name, text));
    else if (/\.json$/i.test(file.name)) sources.push(...parseJson(file.name, text));
    else throw new Error(`${file.name}: use a .md or .json file.`);
  }

  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) throw new Error(`Duplicate source ID “${source.id}” in selected files.`);
    ids.add(source.id);
  }
  return sources;
}

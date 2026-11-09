import type { ClaimCategory, Clearance, Observation, SourceKind, SourceRecord } from "@/lib/domain/types";

const categories: ClaimCategory[] = ["decision", "ownership", "blocker", "risk", "next-action"];
const sourceKinds: SourceKind[] = ["document", "task", "discussion", "repository"];
const maxFiles = 10;
const maxFileBytes = 2 * 1024 * 1024;
const maxSourceRecords = 50;

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

function observationFromText(topic: string, text: string, excerpt: string): Observation[] {
  const patterns: Array<[RegExp, ClaimCategory]> = [
    [/\bdecision\s*[:=-]\s*(.+)/i, "decision"],
    [/\b(?:owner|owned by)\s*[:=-]?\s*(.+)/i, "ownership"],
    [/\bblocker\s*[:=-]\s*(.+)/i, "blocker"],
    [/\brisk\s*[:=-]\s*(.+)/i, "risk"],
    [/\b(?:next action|next step)\s*[:=-]\s*(.+)/i, "next-action"],
  ];
  const observations: Observation[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const [pattern, category] of patterns) {
      const match = line.match(pattern);
      if (!match?.[1]?.trim()) continue;
      const statement = match[1].trim().slice(0, 1000);
      const keyTerms = slug(statement).split("-").filter((word) => !["the", "and", "for", "with", "from", "that", "this", "will", "must", "before", "after", "still", "only", "need", "needs"].includes(word)).slice(0, 5);
      observations.push({ topic: `${category}-${keyTerms.join("-")}`.slice(0, 120) || topic, category, statement, value: statement.toLocaleLowerCase().slice(0, 300), excerpt: line.trim() || excerpt });
    }
  }
  return observations;
}

function sourceFromExternalRecord(value: Record<string, unknown>, provider: "linear" | "slack" | "discord", fileName: string, index: number): SourceRecord | null {
  const source = value as Record<string, unknown>;
  const get = (...keys: string[]) => keys.map((key) => source[key]).find((item) => typeof item === "string") as string | undefined;
  const content = get("content", "body", "text", "description", "message") ?? "";
  if (!content.trim()) return null;
  const title = get("title", "name", "channel_name") ?? (provider === "slack" ? `Slack message ${index + 1}` : provider === "discord" ? `Discord thread ${index + 1}` : `Linear issue ${index + 1}`);
  const id = get("identifier", "id", "key", "issue_key", "ts", "timestamp") ?? `${fileName}:${index + 1}`;
  const occurredAt = get("occurredAt", "createdAt", "created_at", "timestamp", "date", "ts") ?? new Date(0).toISOString();
  const numericTimestamp = Number(occurredAt);
  const parsedDate = Number.isFinite(numericTimestamp) && numericTimestamp > 1_000_000_000
    ? new Date(numericTimestamp * 1000).toISOString()
    : Number.isNaN(Date.parse(occurredAt)) ? new Date(0).toISOString() : new Date(occurredAt).toISOString();
  const nestedAuthor = [source.author, source.user, source.assignee].find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const author = get("author", "user_name", "username", "user", "assignee") ?? [nestedAuthor?.name, nestedAuthor?.username, nestedAuthor?.display_name].find((item) => typeof item === "string") as string | undefined ?? "Unknown";
  const clearance = Number(source.clearance ?? (source.tier === 3 || source.confidential === true ? 3 : 1));
  const kind: SourceKind = provider === "linear" ? "task" : "discussion";
  return { id: `${provider.toUpperCase()}-${slug(id)}`, title, kind, occurredAt: parsedDate, author, clearance: clearance === 2 || clearance === 3 ? clearance : 1, content, observations: observationFromText(slug(title), content, content.slice(0, 1000)) };
}

function parseExternalJson(parsed: unknown, fileName: string): SourceRecord[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const root = (Array.isArray(parsed) ? {} : parsed) as Record<string, unknown>;
  const linearItems = Array.isArray(root.issues) ? root.issues : Array.isArray(root.data) && root.provider === "linear" ? root.data : null;
  if (linearItems) return linearItems.flatMap((item, index) => item && typeof item === "object" ? [sourceFromExternalRecord(item as Record<string, unknown>, "linear", fileName, index)].filter((record): record is SourceRecord => Boolean(record)) : []);
  const discordChannel = root.channel && typeof root.channel === "object" ? root.channel as Record<string, unknown> : null;
  const discordItems = Array.isArray(root.messages) && (root.provider === "discord" || Boolean(root.guild) || Boolean(discordChannel)) ? root.messages : null;
  if (discordItems) {
    const channelInfo = discordChannel ?? {};
    const channel = typeof channelInfo.name === "string" ? channelInfo.name : typeof root.channel === "string" ? root.channel : fileName.replace(/\.json$/i, "");
    const clearance = Number(root.clearance ?? (root.tier === 3 || root.confidential === true ? 3 : 1));
    const isThreadChannel = root.isThread === true || channelInfo.parentId !== undefined || channelInfo.parent_id !== undefined || [10, 11, 12].includes(Number(channelInfo.type));
    const threads = new Map<string, Record<string, unknown>[]>();
    discordItems.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const message = item as Record<string, unknown>;
      const threadId = String(message.thread_id ?? message.threadId ?? (isThreadChannel ? channelInfo.id ?? channel : message.id ?? index + 1));
      threads.set(threadId, [...(threads.get(threadId) ?? []), message]);
    });
    return [...threads.entries()].flatMap(([threadId, messages], index) => {
      const first = messages[0];
      const authorName = (message: Record<string, unknown>) => {
        const author = message.author && typeof message.author === "object" ? message.author as Record<string, unknown> : {};
        return author.name ?? author.username ?? "Unknown";
      };
      const content = messages.map((message) => `${String(authorName(message))}: ${String(message.content ?? "")}`).join("\n");
      const record = sourceFromExternalRecord({ ...first, id: `${channel}:${threadId}`, title: `${channel} thread`, author: authorName(first), content, text: content, clearance: first.clearance ?? clearance }, "discord", fileName, index);
      return record ? [{ ...record, title: `${channel} · ${record.title}`, author: `${messages.length} message${messages.length === 1 ? "" : "s"}` }] : [];
    });
  }
  const slackItems = Array.isArray(parsed) ? parsed : Array.isArray(root.messages) ? root.messages : null;
  if (slackItems) {
    const channel = typeof root.channel_name === "string" ? root.channel_name : typeof root.channel === "string" ? root.channel : fileName.replace(/\.json$/i, "");
    const clearance = Number(root.clearance ?? (root.tier === 3 || root.confidential === true ? 3 : 1));
    const threads = new Map<string, Record<string, unknown>[]>();
    slackItems.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const message = item as Record<string, unknown>;
      const threadId = typeof message.thread_ts === "string" ? message.thread_ts : typeof message.ts === "string" ? message.ts : String(index + 1);
      threads.set(threadId, [...(threads.get(threadId) ?? []), message]);
    });
    return [...threads.entries()].flatMap(([threadId, messages], index) => {
      const first = messages[0];
      const content = messages.map((message) => {
        const author = message.user_name ?? message.username ?? message.user ?? "Unknown";
        const body = message.text ?? message.message ?? "";
        return `${author}: ${String(body)}`;
      }).join("\n");
      const record = sourceFromExternalRecord({ ...first, id: `${channel}:${threadId}`, text: content, clearance: first.clearance ?? clearance, channel_name: channel }, "slack", fileName, index);
      return record ? [{ ...record, title: `${channel} · ${record.title}`, author: `${messages.length} message${messages.length === 1 ? "" : "s"}` }] : [];
    });
  }
  return null;
}

function parseJson(fileName: string, text: string): SourceRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${fileName}: JSON is not valid. Check commas, quotes, and brackets.`);
  }
  const externalRecords = parseExternalJson(parsed, fileName);
  if (externalRecords) {
    if (!externalRecords.length) throw new Error(`${fileName}: no supported Slack messages or Linear issues were found.`);
    return externalRecords;
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

  if (sources.length > maxSourceRecords) throw new Error(`This import contains ${sources.length} records. Split it into batches of ${maxSourceRecords} records or fewer.`);

  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) throw new Error(`Duplicate source ID “${source.id}” in selected files.`);
    ids.add(source.id);
  }
  return sources;
}

import {
  type Attachment,
  type Message,
  parseJsonPage,
  parseTextPage,
} from "./parse";
import type { ZipEntry } from "./zip";

/**
 * `pnpm discord-notes` (#84, Monarch's spec, Oct 28, 2026): Discrub exports in, the messages not
 * seen before out, with context, cleaned for reading, plus a summary. Pure: `main.ts` reads the
 * zips and folders and writes the files. No AI calls; Monarch does the extraction.
 */

/** Earlier messages shown before a channel's first new one (Monarch: the parent plus 20). */
export const CONTEXT = 20;

/** One page file from a zip or folder. */
export interface PageFile {
  /** Where it came from, for the summary (the zip or folder name). */
  source: string;
  /** Path inside the export, e.g. `rule_questions/rule_questions-page-1.json`. */
  path: string;
  text: string;
}

const PAGE = /^(.*)\/[^/]*-page-\d+\.(json|txt)$/;

/** The page files among a zip's entries (READMEs and anything else are left out). */
export function pagesOf(
  source: string,
  entries: readonly ZipEntry[],
): PageFile[] {
  return entries
    .filter((e) => PAGE.test(e.name))
    .map((e) => ({ source, path: e.name, text: e.data.toString("utf8") }));
}

export interface Loaded {
  /** Every message, deduplicated by key, per channel in time order. */
  channels: Map<string, Message[]>;
  /** Channels whose text pages were skipped because a JSON export of them was read. */
  skippedText: string[];
  sources: string[];
}

/**
 * Parses every page. A channel exported in both formats is read from JSON only: the text format
 * gives local times without a time zone and no ids, so its messages can't be matched to JSON's.
 * Duplicates (overlapping exports) are kept once, by key.
 */
export function load(pages: readonly PageFile[]): Loaded {
  const channelOf = (path: string) => PAGE.exec(path)?.[1] ?? "";
  const jsonChannels = new Set(
    pages.filter((p) => p.path.endsWith(".json")).map((p) => channelOf(p.path)),
  );
  const byKey = new Map<string, Message>();
  const skipped = new Set<string>();
  for (const page of pages) {
    const channel = channelOf(page.path);
    const json = page.path.endsWith(".json");
    if (!json && jsonChannels.has(channel)) {
      skipped.add(channel);
      continue;
    }
    const messages = json
      ? parseJsonPage(page.text, channel)
      : parseTextPage(page.text, channel);
    for (const m of messages) if (!byKey.has(m.key)) byKey.set(m.key, m);
  }
  // JSON replies name their parent by id: fill in its author and text.
  for (const m of byKey.values()) {
    if (!m.replyTo?.key) continue;
    const parent = byKey.get(m.replyTo.key);
    m.replyTo = parent
      ? { key: parent.key, author: parent.author, text: parent.text }
      : { key: m.replyTo.key, author: "", text: "" };
  }
  const channels = new Map<string, Message[]>();
  for (const m of byKey.values()) {
    const list = channels.get(m.channel) ?? [];
    list.push(m);
    channels.set(m.channel, list);
  }
  for (const list of channels.values())
    list.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return {
    channels,
    skippedText: [...skipped].sort(),
    sources: [...new Set(pages.map((p) => p.source))].sort(),
  };
}

/**
 * A message's text for reading: custom emoji as `:name:`, mentions as `@name`, links as `[link]`
 * (attachment links are listed in the summary instead), line breaks as " / ".
 */
export function clean(message: Pick<Message, "text" | "mentions">): string {
  return message.text
    .replace(/<a?:(\w+):\d+>/g, ":$1:")
    .replace(
      /<@!?(\d+)>/g,
      (_, id: string) => `@${message.mentions?.[id] ?? "user"}`,
    )
    .replace(/<@&\d+>/g, "@role")
    .replace(/<#\d+>/g, "#channel")
    .replace(/https?:\/\/\S+/g, "[link]")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join(" / ");
}

/** A message's line, or `null` when nothing is left to read (a bare link, an empty message). */
export function lineFor(message: Message, seen: boolean): string | null {
  const text = clean(message);
  const files = message.attachments.map((a) => a.name);
  if ((text === "" || text === "[link]") && files.length === 0) return null;
  const reply = message.replyTo
    ? message.replyTo.author
      ? ` [reply to ${message.replyTo.author}: "${clean(message.replyTo).slice(0, 80)}"]`
      : " [reply to an earlier message]"
    : "";
  const attached = files.length > 0 ? ` [attached: ${files.join(", ")}]` : "";
  const when = message.time.replace("T", " ").slice(0, 16);
  return `${seen ? "(seen) " : ""}${message.author} (${when})${reply}: ${text}${attached}`;
}

export interface ChannelNotes {
  channel: string;
  /** The transcript's file name in the output folder. */
  file: string;
  lines: string[];
  newCount: number;
  contextCount: number;
  first: string;
  last: string;
  attachments: (Attachment & { author: string; time: string })[];
}

export interface Notes {
  channels: ChannelNotes[];
  /** Keys of the new messages, for `seen.json`. */
  newKeys: string[];
}

/** A file name for a channel path: `rule_questions`, `rule_questions--threads--Some thread`. */
export function fileFor(channel: string): string {
  return `${channel.replace(/\//g, "--").replace(/[^\p{L}\p{N} _.-]+/gu, "_")}.txt`;
}

/**
 * Each channel with new messages: a transcript from 20 messages before its first new one to its
 * last new one, the earlier ones marked `(seen)`. A reply carries its parent's author and start,
 * however far back the parent is.
 */
export function buildNotes(loaded: Loaded, seen: ReadonlySet<string>): Notes {
  const channels: ChannelNotes[] = [];
  const newKeys: string[] = [];
  for (const [channel, messages] of [...loaded.channels].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const fresh = messages
      .map((m, i) => (seen.has(m.key) ? -1 : i))
      .filter((i) => i >= 0);
    if (fresh.length === 0) continue;
    const from = Math.max(0, (fresh[0] ?? 0) - CONTEXT);
    const to = fresh[fresh.length - 1] ?? 0;
    const lines: string[] = [];
    let contextCount = 0;
    const attachments: ChannelNotes["attachments"] = [];
    for (const m of messages.slice(from, to + 1)) {
      const old = seen.has(m.key);
      const line = lineFor(m, old);
      if (line) lines.push(line);
      if (old) contextCount++;
      else {
        newKeys.push(m.key);
        for (const a of m.attachments)
          attachments.push({ ...a, author: m.author, time: m.time });
      }
    }
    const firstNew = messages[fresh[0] ?? 0] as Message;
    const lastNew = messages[to] as Message;
    channels.push({
      channel,
      file: fileFor(channel),
      lines,
      newCount: fresh.length,
      contextCount,
      first: firstNew.time,
      last: lastNew.time,
      attachments,
    });
  }
  return { channels, newKeys };
}

/** `summary.md`: what was read, each channel's new messages, and the attachments to look at. */
export function summary(
  loaded: Loaded,
  notes: Notes,
  date: string,
  seenBefore: number,
): string {
  const out = [`# Discord notes, ${date}`, ""];
  out.push(`Sources: ${loaded.sources.join(", ") || "none"}.`);
  out.push(
    `New messages: ${notes.newKeys.length} in ${notes.channels.length} channel(s); ${seenBefore} were seen before.`,
  );
  if (loaded.skippedText.length > 0)
    out.push(
      `Text pages skipped (a JSON export of the same channel was read): ${loaded.skippedText.join(", ")}.`,
    );
  out.push("", "## Channels", "");
  if (notes.channels.length === 0) out.push("Nothing new.");
  for (const c of notes.channels)
    out.push(
      `- \`${c.file}\`: ${c.channel}, ${c.newCount} new (${c.first.slice(0, 16)} to ${c.last.slice(0, 16)}), ${c.contextCount} earlier for context`,
    );
  const attachments = notes.channels.flatMap((c) =>
    c.attachments.map((a) => ({ ...a, channel: c.channel })),
  );
  out.push("", "## Images and attachments", "");
  if (attachments.length === 0) out.push("None.");
  for (const a of attachments)
    out.push(
      `- ${a.channel} · ${a.author} · ${a.time.slice(0, 16)} · ${a.name}: ${a.url}`,
    );
  return `${out.join("\n")}\n`;
}

/** `seen.json`: every message key handed out so far, sorted. */
export interface Seen {
  version: 1;
  keys: string[];
}

export function readSeen(text: string | null): Set<string> {
  if (!text) return new Set();
  const seen = JSON.parse(text) as Partial<Seen>;
  if (seen.version !== 1 || !Array.isArray(seen.keys))
    throw new Error("seen.json isn't a version 1 file");
  return new Set(seen.keys);
}

export function writeSeen(seen: ReadonlySet<string>): string {
  return `${JSON.stringify({ version: 1, keys: [...seen].sort() } satisfies Seen, null, 2)}\n`;
}

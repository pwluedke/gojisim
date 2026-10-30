import { createHash } from "node:crypto";

/**
 * Discrub's two export formats (#84) as one message shape. JSON pages (`*-page-N.json`) are
 * arrays of Discord API messages; text pages (`*-page-N.txt`) are newest first, each message a
 * header `@Name (MM/DD/YYYY h:mm AM[, edited …])`, an optional `> @Name: text` quote line above it
 * for a reply, then its lines (paragraphs included) up to the next header.
 */

export interface Attachment {
  name: string;
  url: string;
}

export interface Message {
  /** `json:<id>`, or for the text format `text:<hash of channel, author, time and text>`. */
  key: string;
  /** The page's folder: the channel, or `<channel>/threads/<thread>`. */
  channel: string;
  author: string;
  /** JSON: ISO time (UTC). Text: `YYYY-MM-DD HH:MM`, the exporter's local time. */
  time: string;
  /** The message as written (cleaned later). */
  text: string;
  /** What it replies to: the parent's key when known, its author and the start of its text. */
  replyTo?: { key?: string; author: string; text: string };
  attachments: Attachment[];
  /** User ids to names, for mentions (JSON only). */
  mentions?: Record<string, string>;
}

interface ApiUser {
  id: string;
  username: string;
  global_name?: string | null;
}

interface ApiMessage {
  id: string;
  type: number;
  timestamp: string;
  content?: string | null;
  author: ApiUser;
  attachments?: { filename: string; url: string }[];
  mentions?: ApiUser[];
  message_reference?: { message_id?: string };
}

/** Discord message types kept: default (0), reply (19) and slash commands (20). */
const KEPT_TYPES = new Set([0, 19, 20]);

const nameOf = (user: ApiUser) => user.global_name || user.username;

/** A JSON page's messages; replies name their parent by key (filled in once all pages are read). */
export function parseJsonPage(text: string, channel: string): Message[] {
  const page = JSON.parse(text) as ApiMessage[];
  if (!Array.isArray(page))
    throw new Error(`${channel}: a JSON page isn't an array`);
  return page
    .filter((m) => KEPT_TYPES.has(m.type))
    .map((m) => {
      const parent = m.message_reference?.message_id;
      return {
        key: `json:${m.id}`,
        channel,
        author: nameOf(m.author),
        time: m.timestamp,
        text: m.content ?? "",
        ...(parent
          ? { replyTo: { key: `json:${parent}`, author: "", text: "" } }
          : {}),
        attachments: (m.attachments ?? []).map((a) => ({
          name: a.filename,
          url: a.url,
        })),
        mentions: Object.fromEntries(
          (m.mentions ?? []).map((u) => [u.id, nameOf(u)]),
        ),
      };
    });
}

const HEADER =
  /^@(.+?) \((\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}) (AM|PM)(?:, edited [^)]*)?\)$/;
const QUOTE = /^> @(.+?): (.*)$/;
const SYSTEM = /^-- @.+: system event \(.*\) --$/;
const ATTACHMENT = /^\[Attachment: (.+?) — (\S+)\]$/;

function textTime(m: RegExpExecArray): string {
  const [, , month, day, year, hour, minute, half] = m;
  let h = Number(hour) % 12;
  if (half === "PM") h += 12;
  return `${year}-${month}-${day} ${String(h).padStart(2, "0")}:${minute}`;
}

/** A text page's messages, oldest first. */
export function parseTextPage(text: string, channel: string): Message[] {
  const out: Message[] = [];
  let quote: { author: string; text: string } | undefined;
  let current: (Message & { lines: string[] }) | undefined;
  const finish = () => {
    if (!current) return;
    const { lines, ...message } = current;
    // Drop trailing blank lines and the reactions line.
    const body = lines.filter((l) => !l.startsWith("Reactions: "));
    while (body.length > 0 && body[body.length - 1]?.trim() === "") body.pop();
    message.text = body.join("\n");
    message.key = `text:${createHash("sha1")
      .update(`${channel}\n${message.author}\n${message.time}\n${message.text}`)
      .digest("hex")
      .slice(0, 16)}`;
    out.push(message);
    current = undefined;
  };
  for (const line of text.split(/\r?\n/)) {
    const header = HEADER.exec(line);
    if (header) {
      finish();
      current = {
        key: "",
        channel,
        author: header[1] ?? "",
        time: textTime(header),
        text: "",
        ...(quote ? { replyTo: quote } : {}),
        attachments: [],
        lines: [],
      };
      quote = undefined;
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      // A quote line belongs to the next header: the message it starts replies to it.
      finish();
      quote = { author: q[1] ?? "", text: q[2] ?? "" };
      continue;
    }
    if (SYSTEM.test(line)) {
      finish();
      continue;
    }
    if (!current) continue;
    const attachment = ATTACHMENT.exec(line);
    if (attachment)
      current.attachments.push({
        name: attachment[1] ?? "",
        url: attachment[2] ?? "",
      });
    else current.lines.push(line);
  }
  finish();
  // Pages are newest first.
  return out.reverse();
}

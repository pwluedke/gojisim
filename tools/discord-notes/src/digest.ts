import type { ApiChannel, ApiMessage, ApiUser } from "./discordApi";
import { clean } from "./notes";

/**
 * The daily digest's text (#140): one section per COMMUNITY channel (its threads under it), each
 * message with its author, time and text; a reply under its parent's author and first 80
 * characters; attachments as links. Pure; `digestMain.ts` reads Discord and posts to Slack.
 */

/** Discord message types kept: default (0), reply (19) and slash commands (20), as discord-notes. */
const KEPT_TYPES = new Set([0, 19, 20]);
/** Slack's limit for one message's text is 40,000 characters; it reads best under 4,000. */
export const SLACK_MESSAGE_MAX = 3800;
export const PARENT_PREVIEW = 80;

const nameOf = (user: ApiUser) => user.global_name || user.username;

/** Text for Slack mrkdwn: `&`, `<` and `>` escaped, so nothing in a message makes a mention or link. */
export const slackEscape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A message's readable text: discord-notes' cleaning (mentions and emoji by name), links kept. */
function textOf(m: ApiMessage): string {
  const mentions = Object.fromEntries(
    (m.mentions ?? []).map((u) => [u.id, nameOf(u)]),
  );
  // Links stay (the digest is for reading them); `clean` turns them into "[link]".
  const links: string[] = [];
  const marked = (m.content ?? "").replace(/https?:\/\/\S+/g, (url) => {
    links.push(url);
    return `\uE000${links.length - 1}\uE000`;
  });
  return clean({ text: marked, mentions }).replace(
    /\uE000(\d+)\uE000/g,
    (_, i: string) => links[Number(i)] ?? "",
  );
}

/** "Oct 31, 14:05 UTC". */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${month} ${d.getUTCDate()}, ${hh}:${mm} UTC`;
}

/** One message's lines: author, time and text; a reply with its parent; attachments as links. */
export function messageLines(m: ApiMessage): string[] {
  const text = textOf(m);
  const lines = [
    `*${slackEscape(nameOf(m.author))}* (${shortTime(m.timestamp)}): ${slackEscape(text)}`,
  ];
  const parent = m.referenced_message;
  if (m.type === 19 || m.message_reference?.message_id) {
    const preview = parent
      ? `${slackEscape(nameOf(parent.author))}: ${slackEscape(textOf(parent).slice(0, PARENT_PREVIEW))}`
      : "a message that's gone";
    lines.unshift(`↳ replying to ${preview}`);
  }
  for (const a of m.attachments ?? [])
    lines.push(`  📎 <${a.url}|${slackEscape(a.filename)}>`);
  return lines;
}

export interface ChannelMessages {
  channel: ApiChannel;
  /** The channel's own messages, oldest first. */
  messages: ApiMessage[];
  /** Its threads that have new messages, each oldest first. */
  threads: { thread: ApiChannel; messages: ApiMessage[] }[];
}

const kept = (messages: readonly ApiMessage[]) =>
  messages.filter(
    (m) =>
      KEPT_TYPES.has(m.type) &&
      (textOf(m) !== "" || (m.attachments ?? []).length > 0),
  );

/** Each channel's section as blocks (a heading, then one block per message), skipping empty ones. */
export function sections(channels: readonly ChannelMessages[]): string[][] {
  const out: string[][] = [];
  for (const { channel, messages, threads } of channels) {
    const blocks: string[] = [];
    for (const m of kept(messages)) blocks.push(messageLines(m).join("\n"));
    for (const { thread, messages: inThread } of threads) {
      const ms = kept(inThread);
      if (ms.length === 0) continue;
      blocks.push(`_Thread: ${slackEscape(thread.name)}_`);
      for (const m of ms)
        blocks.push(
          messageLines(m)
            .map((l) => `>${l}`)
            .join("\n"),
        );
    }
    if (blocks.length > 0)
      out.push([`*#${slackEscape(channel.name)}*`, ...blocks]);
  }
  return out;
}

/** How many messages a digest holds (for the log's counts). */
export function messageCount(channels: readonly ChannelMessages[]): number {
  return channels.reduce(
    (n, c) =>
      n +
      kept(c.messages).length +
      c.threads.reduce((t, th) => t + kept(th.messages).length, 0),
    0,
  );
}

/**
 * The Slack messages: a title, then the sections, packed into messages of at most `max`
 * characters. A block never splits unless it alone is too long (then it's cut with "…"); a
 * section carried into the next message repeats its heading with "(continued)".
 */
export function slackMessages(
  title: string,
  sectionList: readonly string[][],
  max = SLACK_MESSAGE_MAX,
): string[] {
  if (sectionList.length === 0) return [];
  const messages: string[] = [];
  let current = title;
  const fit = (block: string) =>
    block.length <= max - 20 ? block : `${block.slice(0, max - 21)}…`;
  for (const [heading = "", ...blocks] of sectionList) {
    let first = true;
    for (const raw of blocks) {
      const block = fit(raw);
      const add = `${first ? `\n\n${heading}` : ""}\n${block}`;
      if (current.length + add.length > max) {
        messages.push(current);
        current = `${first ? heading : `${heading} (continued)`}\n${block}`;
      } else current += add;
      first = false;
    }
  }
  messages.push(current);
  return messages;
}

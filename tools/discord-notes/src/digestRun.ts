import {
  type ApiChannel,
  type ApiMessage,
  digestChannels,
  notAllowed,
  type DiscordGet,
  MESSAGE_CHANNELS,
  messagesAfter,
  snowflakeAt,
  threadsOf,
} from "./discordApi";
import {
  type ChannelMessages,
  messageCount,
  sections,
  slackMessages,
} from "./digest";

/**
 * The Discord digest's run (#140; every 3 hours since #148), with Discord and Slack passed in
 * (tests use recorded answers). The log gets counts only.
 */
export interface DigestRun {
  get: DiscordGet;
  guildId: string;
  hours: number;
  /** #148: minutes read before the window too, so a late run misses nothing (`seen` drops repeats). */
  overlapMinutes?: number;
  /**
   * #148: Discord message ids already posted. Messages in it are left out; after every Slack
   * message goes through, the posted ids are added and ids older than `SEEN_KEEP_MS` dropped.
   */
  seen?: Set<string>;
  now: number;
  /** Posts one Slack message; resolves to the HTTP status. */
  post: (text: string) => Promise<number>;
  log: (line: string) => void;
}

/** Reads, builds and posts the digest; returns the Slack messages sent. */
export async function runDigest({
  get,
  guildId,
  hours,
  overlapMinutes = 0,
  seen = new Set<string>(),
  now,
  post,
  log,
}: DigestRun): Promise<number> {
  const since = now - hours * 3600_000 - overlapMinutes * 60_000;
  const after = snowflakeAt(since);
  const all = await get<ApiChannel[]>(`/guilds/${guildId}/channels`);
  const read = digestChannels(all);
  const community = read.map((r) => r.channel);
  const threads = await threadsOf(get, guildId, community, since);
  const byChannel: ChannelMessages[] = [];
  // A channel or thread the bot can't read is skipped (and counted).
  let skipped = 0;
  const read403 = async (id: string) => {
    try {
      return await messagesAfter(get, id, after);
    } catch (e) {
      if (!notAllowed(e)) throw e;
      skipped++;
      return [];
    }
  };
  for (const { channel, category } of read) {
    const messages = MESSAGE_CHANNELS.has(channel.type)
      ? await read403(channel.id)
      : [];
    const inThreads: ChannelMessages["threads"] = [];
    for (const thread of threads.filter((t) => t.parent_id === channel.id))
      inThreads.push({ thread, messages: await read403(thread.id) });
    byChannel.push({ channel, category, messages, threads: inThreads });
  }
  // #148: what an earlier run already posted (the overlap) is left out.
  const fresh = (ms: ApiMessage[]) => ms.filter((m) => !seen.has(m.id));
  const before = messageCount(byChannel);
  const unseen = byChannel.map((c) => ({
    ...c,
    messages: fresh(c.messages),
    threads: c.threads.map((t) => ({ ...t, messages: fresh(t.messages) })),
  }));
  const count = messageCount(unseen);
  log(
    `${community.length} channels in ${new Set(read.map((r) => r.category)).size} categories, ${threads.length} threads, ${count} new messages in the last ${hours} h (${before - count} already posted)${skipped > 0 ? `; ${skipped} not readable by the bot, skipped` : ""}.`,
  );
  pruneSeen(seen, now);
  if (count === 0) {
    log("Nothing new: no digest posted.");
    return 0;
  }
  const day = new Date(now).toISOString().slice(0, 10);
  const texts = slackMessages(
    `*GojiSim Discord digest, ${day}* (last ${hours} h, ${count} messages)`,
    sections(unseen, guildId),
  );
  let sent = 0;
  for (const text of texts) {
    const status = await post(text);
    if (status >= 200 && status < 300) sent++;
    else log(`::warning::A Slack digest message failed (HTTP ${status}).`);
  }
  log(`Posted ${sent} of ${texts.length} Slack messages.`);
  if (sent < texts.length) process.exitCode = 1;
  // Only a digest that went out whole counts as posted; otherwise the next run tries again.
  else
    for (const c of unseen) {
      for (const m of c.messages) seen.add(m.id);
      for (const t of c.threads) for (const m of t.messages) seen.add(m.id);
    }
  return sent;
}

/** How long a posted id is kept: far past any window and its overlap. */
export const SEEN_KEEP_MS = 48 * 3600_000;

/** Drops ids older than `SEEN_KEEP_MS` (a snowflake holds its time). */
export function pruneSeen(seen: Set<string>, now: number): void {
  const oldest = BigInt(snowflakeAt(now - SEEN_KEEP_MS));
  for (const id of seen) {
    try {
      if (BigInt(id) < oldest) seen.delete(id);
    } catch {
      seen.delete(id);
    }
  }
}

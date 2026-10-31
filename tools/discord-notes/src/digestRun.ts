import {
  type ApiChannel,
  communityChannels,
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
 * The daily Discord digest's run (#140), with Discord and Slack passed in (tests use recorded
 * answers). The log gets counts only.
 */
export interface DigestRun {
  get: DiscordGet;
  guildId: string;
  hours: number;
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
  now,
  post,
  log,
}: DigestRun): Promise<number> {
  const since = now - hours * 3600_000;
  const after = snowflakeAt(since);
  const all = await get<ApiChannel[]>(`/guilds/${guildId}/channels`);
  const community = communityChannels(all);
  const threads = await threadsOf(get, guildId, community, since);
  const byChannel: ChannelMessages[] = [];
  for (const channel of community) {
    const messages = MESSAGE_CHANNELS.has(channel.type)
      ? await messagesAfter(get, channel.id, after)
      : [];
    const inThreads: ChannelMessages["threads"] = [];
    for (const thread of threads.filter((t) => t.parent_id === channel.id))
      inThreads.push({
        thread,
        messages: await messagesAfter(get, thread.id, after),
      });
    byChannel.push({ channel, messages, threads: inThreads });
  }
  const count = messageCount(byChannel);
  log(
    `${community.length} COMMUNITY channels, ${threads.length} threads, ${count} new messages in the last ${hours} h.`,
  );
  if (count === 0) {
    log("Nothing new: no digest posted.");
    return 0;
  }
  const day = new Date(now).toISOString().slice(0, 10);
  const texts = slackMessages(
    `*GojiSim Discord digest, ${day}* (last ${hours} h, ${count} messages)`,
    sections(byChannel),
  );
  let sent = 0;
  for (const text of texts) {
    const status = await post(text);
    if (status >= 200 && status < 300) sent++;
    else log(`::warning::A Slack digest message failed (HTTP ${status}).`);
  }
  log(`Posted ${sent} of ${texts.length} Slack messages.`);
  if (sent < texts.length) process.exitCode = 1;
  return sent;
}

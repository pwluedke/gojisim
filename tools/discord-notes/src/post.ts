/**
 * Posts and edits in the GojiSim Discord's #bugs channel through its webhook
 * (`.github/workflows/discord-post.yml`). Run by hand only. Mentions only ping the user ids
 * listed (`mentions`), never @everyone or roles. A post waits for Discord's answer (`?wait=true`),
 * so the new message's id can be kept, and `edit_id` later edits that message instead of
 * posting. A webhook can only edit its own messages. The repo is public: the log has the HTTP
 * status and the message id only, never the text or the webhook URL (docs/discord.md).
 *
 * Paul, Nov 15: with `channel_id` (a channel or thread id) the post goes through the bot
 * (`DISCORD_BOT_TOKEN`) to that channel or thread instead, so Monarch can answer anywhere; a
 * reply is then a real Discord reply. The log shows only the channel id and the message id.
 */

const API = "https://discord.com/api/v10";

/** Discord's message limit, counting a reply link. */
export const MESSAGE_MAX = 2000;
/** Discord allows at most 100 user ids in `allowed_mentions.users`. */
export const MENTIONS_MAX = 100;

const SNOWFLAKE = /^[0-9]{15,22}$/;

/** Paul, Nov 15: reaction names the `reactions` input takes, and the emoji they add. */
const REACTION_NAMES: Record<string, string> = {
  white_check_mark: "✅",
  x: "❌",
};

/** The `reactions` input: comma-separated names (`white_check_mark,x`) or the emoji themselves. */
export function parseReactions(input: string): string[] {
  const out: string[] = [];
  for (const raw of input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const emoji = REACTION_NAMES[raw.replace(/^:|:$/g, "")] ?? raw;
    // An emoji is a few code points and no letters or digits (a typo'd name is refused).
    if (/[A-Za-z0-9_]/.test(emoji) || [...emoji].length > 8)
      throw new Error(
        `reactions takes ${Object.keys(REACTION_NAMES).join(", ")} or emoji: not "${raw}".`,
      );
    if (!out.includes(emoji)) out.push(emoji);
  }
  return out;
}

/** The `mentions` input: comma-separated Discord user ids, each once. Empty is none. */
export function parseMentions(input: string): string[] {
  const ids = [
    ...new Set(
      input
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  for (const id of ids)
    if (!SNOWFLAKE.test(id))
      throw new Error(
        "mentions must be Discord user ids (digits), comma-separated.",
      );
  if (ids.length > MENTIONS_MAX)
    throw new Error(`At most ${MENTIONS_MAX} mentions.`);
  return ids;
}

/** Every listed id must be tagged in the text as `<@id>`; a listed id the text doesn't tag is a typo. */
export function checkTagged(text: string, mentions: string[]): void {
  const missing = mentions.filter(
    (id) => !text.includes(`<@${id}>`) && !text.includes(`<@!${id}>`),
  );
  if (missing.length > 0)
    throw new Error(
      `The message doesn't tag ${missing.map((id) => `<@${id}>`).join(", ")}; write each mention as <@id>.`,
    );
}

/** The webhook body: only the listed users can be pinged; @everyone, roles and other users never. */
export const postPayload = (content: string, mentions: string[]) => ({
  content,
  allowed_mentions: { parse: [] as never[], users: mentions },
});

/** A new post (`?wait=true`, so Discord answers with the message) or an edit of one of the webhook's messages. */
export function postRequest(
  webhook: string,
  editId: string | null,
): { url: string; method: "POST" | "PATCH" } {
  const url = new URL(webhook);
  if (editId) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/messages/${editId}`;
    return { url: url.toString(), method: "PATCH" };
  }
  url.searchParams.set("wait", "true");
  return { url: url.toString(), method: "POST" };
}

export interface PostOptions {
  webhook: string;
  /** A channel or thread id: post through the bot there instead of the #bugs webhook. */
  channelId?: string;
  /** Reactions the bot adds to its own new message (`white_check_mark,x`). */
  reactions?: string;
  /** `DISCORD_BOT_TOKEN`, for `channelId`. */
  botToken?: string;
  message: string;
  replyTo?: string;
  mentions?: string;
  editId?: string;
  fetchImpl?: typeof fetch;
  /** Log lines: the HTTP status and the message id only. */
  log?: (line: string) => void;
  /** The run summary's lines (`$GITHUB_STEP_SUMMARY`). */
  summary?: (line: string) => void;
}

/** Posts or edits; returns the message id. Throws with a message that names neither the text nor the URL. */
export async function runPost({
  webhook,
  channelId = "",
  botToken = "",
  reactions = "",
  message,
  replyTo = "",
  mentions = "",
  editId = "",
  fetchImpl = fetch,
  log = (line) => console.log(line),
  summary = () => {},
}: PostOptions): Promise<string> {
  for (const [name, id] of [
    ["channel_id", channelId],
    ["reply_to", replyTo],
    ["edit_id", editId],
  ] as const)
    if (id && !SNOWFLAKE.test(id))
      throw new Error(`${name} must be a Discord message id (digits only).`);
  const users = parseMentions(mentions);
  checkTagged(message, users);
  const emoji = parseReactions(reactions);
  const viaBot = (channel: string) =>
    botPost({
      channelId: channel,
      botToken,
      message,
      replyTo,
      users,
      editId,
      emoji,
      fetchImpl,
      log,
      summary,
    });
  if (channelId) return viaBot(channelId);
  if (!webhook) throw new Error("The DISCORD_BUGS_WEBHOOK secret isn't set.");
  // Paul, Nov 15 (the bot is "Monarch"): #bugs posts go through the bot too, to the webhook's
  // own channel, so every post shows as Monarch; the webhook is the fallback when that fails.
  if (botToken) {
    try {
      return await viaBot((await webhookChannel(webhook, fetchImpl)).channel);
    } catch (e) {
      const status =
        e instanceof Error
          ? (/HTTP \d+/.exec(e.message)?.[0] ?? "no answer")
          : "no answer";
      log(
        `The bot post failed (${status}); posting through the #bugs webhook.`,
      );
    }
  }
  if (emoji.length > 0)
    log("::warning::Reactions need the bot; the webhook post has none.");
  let text = message;
  // A webhook can't thread-reply in a text channel, so a reply starts with a link to the message.
  // The webhook's own record names its server and channel.
  if (replyTo) {
    const { guild, channel } = await webhookChannel(webhook, fetchImpl);
    text = `↪ Re: https://discord.com/channels/${guild}/${channel}/${replyTo}\n${message}`;
  }
  const length = [...text].length;
  if (length > MESSAGE_MAX)
    throw new Error(
      `The post is ${length} characters (with any reply link); Discord's limit is ${MESSAGE_MAX}.`,
    );
  const { url, method } = postRequest(webhook, editId || null);
  const res = await fetchImpl(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postPayload(text, users)),
    signal: AbortSignal.timeout(20_000),
  });
  log(`Discord answered HTTP ${res.status}`);
  if (!res.ok)
    throw new Error(
      editId
        ? `The edit failed (HTTP ${res.status}). Only this webhook's own messages can be edited.`
        : `The post failed (HTTP ${res.status}).`,
    );
  const id = ((await res.json()) as { id?: string }).id ?? editId;
  if (!id) throw new Error("Discord's answer had no message id.");
  log(`Message id ${id}`);
  summary(
    editId
      ? `Edited #bugs message \`${id}\`.`
      : `Posted #bugs message \`${id}\` (edit it later with \`edit_id\`).`,
  );
  return id;
}

/** The webhook's own record: its server and channel (#bugs). */
async function webhookChannel(
  webhook: string,
  fetchImpl: typeof fetch,
): Promise<{ guild: string; channel: string }> {
  const res = await fetchImpl(webhook, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error("Couldn't read the webhook's channel.");
  const info = (await res.json()) as {
    guild_id?: string;
    channel_id?: string;
  };
  if (!info.guild_id || !info.channel_id)
    throw new Error("The webhook's record has no server or channel.");
  return { guild: info.guild_id, channel: info.channel_id };
}

/**
 * Paul, Nov 15: a post or an edit in any channel or thread through the bot. A reply is a real
 * Discord reply (`message_reference`); only the listed users can be pinged, as with the webhook.
 */
async function botPost({
  channelId,
  botToken,
  message,
  replyTo,
  users,
  editId,
  emoji,
  fetchImpl,
  log,
  summary,
}: {
  emoji: string[];
  channelId: string;
  botToken: string;
  message: string;
  replyTo: string;
  users: string[];
  editId: string;
  fetchImpl: typeof fetch;
  log: (line: string) => void;
  summary: (line: string) => void;
}): Promise<string> {
  if (!botToken) throw new Error("The DISCORD_BOT_TOKEN secret isn't set.");
  const length = [...message].length;
  if (length > MESSAGE_MAX)
    throw new Error(
      `The post is ${length} characters; Discord's limit is ${MESSAGE_MAX}.`,
    );
  const body = {
    ...postPayload(message, users),
    ...(replyTo && !editId
      ? {
          message_reference: { message_id: replyTo, fail_if_not_exists: false },
        }
      : {}),
  };
  const res = await fetchImpl(
    editId
      ? `${API}/channels/${channelId}/messages/${editId}`
      : `${API}/channels/${channelId}/messages`,
    {
      method: editId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    },
  );
  log(`Discord answered HTTP ${res.status}`);
  if (!res.ok)
    throw new Error(
      editId
        ? `The edit failed (HTTP ${res.status}). Only the bot's own messages can be edited.`
        : `The post failed (HTTP ${res.status}). Check the bot can send messages in that channel or thread.`,
    );
  const id = ((await res.json()) as { id?: string }).id ?? editId;
  if (!id) throw new Error("Discord's answer had no message id.");
  log(`Channel id ${channelId}, message id ${id}`);
  // Paul, Nov 15: the reactions Paul approves or declines with, on the bot's own new message.
  for (const e of editId ? [] : emoji) {
    const r = await fetchImpl(
      `${API}/channels/${channelId}/messages/${id}/reactions/${encodeURIComponent(e)}/@me`,
      {
        method: "PUT",
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!r.ok)
      log(
        `::warning::A reaction couldn't be added (HTTP ${r.status}); the bot needs Add Reactions there.`,
      );
  }
  summary(
    editId
      ? `Edited message \`${id}\` in channel \`${channelId}\`.`
      : `Posted message \`${id}\` in channel \`${channelId}\` (edit it later with \`edit_id\` and the same \`channel_id\`).`,
  );
  return id;
}

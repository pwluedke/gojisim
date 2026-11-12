/**
 * Posts and edits in the GojiSim Discord's #bugs channel through its webhook
 * (`.github/workflows/discord-post.yml`). Run by hand only. Mentions only ping the user ids
 * listed (`mentions`), never @everyone or roles. A post waits for Discord's answer (`?wait=true`),
 * so the new message's id can be kept, and `edit_id` later edits that message instead of
 * posting. A webhook can only edit its own messages. The repo is public: the log has the HTTP
 * status and the message id only, never the text or the webhook URL (docs/discord.md).
 */

/** Discord's message limit, counting a reply link. */
export const MESSAGE_MAX = 2000;
/** Discord allows at most 100 user ids in `allowed_mentions.users`. */
export const MENTIONS_MAX = 100;

const SNOWFLAKE = /^[0-9]{15,22}$/;

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
  message,
  replyTo = "",
  mentions = "",
  editId = "",
  fetchImpl = fetch,
  log = (line) => console.log(line),
  summary = () => {},
}: PostOptions): Promise<string> {
  if (!webhook) throw new Error("The DISCORD_BUGS_WEBHOOK secret isn't set.");
  for (const [name, id] of [
    ["reply_to", replyTo],
    ["edit_id", editId],
  ] as const)
    if (id && !SNOWFLAKE.test(id))
      throw new Error(`${name} must be a Discord message id (digits only).`);
  const users = parseMentions(mentions);
  checkTagged(message, users);
  let text = message;
  // A webhook can't thread-reply in a text channel, so a reply starts with a link to the message.
  // The webhook's own record names its server and channel.
  if (replyTo) {
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
    text = `↪ Re: https://discord.com/channels/${info.guild_id}/${info.channel_id}/${replyTo}\n${message}`;
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

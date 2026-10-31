/**
 * The Discord REST calls the daily digest needs (#140), with Paul's bot token. Read-only: the
 * client can only send GET requests, so nothing is ever posted to Discord. A 429 waits for
 * `retry_after` and tries again (up to 5 times).
 */

const API = "https://discord.com/api/v10";

export interface ApiUser {
  id: string;
  username: string;
  global_name?: string | null;
}

export interface ApiMessage {
  id: string;
  type: number;
  timestamp: string;
  content?: string | null;
  author: ApiUser;
  attachments?: { filename: string; url: string }[];
  mentions?: ApiUser[];
  message_reference?: { message_id?: string };
  /** For a reply (type 19): the parent, when Discord still has it. */
  referenced_message?: ApiMessage | null;
}

export interface ApiChannel {
  id: string;
  type: number;
  name: string;
  parent_id?: string | null;
}

/** Channel types: text (0), category (4), announcement (5), threads (10, 11, 12), forum (15). */
export const CATEGORY = 4;
export const MESSAGE_CHANNELS = new Set([0, 5]);
export const THREAD_PARENTS = new Set([0, 5, 15]);

export type DiscordGet = <T>(path: string) => Promise<T>;

/** A GET-only client for the bot token. */
export function discordClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
): DiscordGet {
  return async <T>(path: string): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(`${API}${path}`, {
        method: "GET",
        headers: { Authorization: `Bot ${token}` },
      });
      if (res.status === 429 && attempt < 5) {
        const body = (await res.json().catch(() => ({}))) as {
          retry_after?: number;
        };
        await sleep(Math.ceil((body.retry_after ?? 1) * 1000));
        continue;
      }
      // The path holds only ids; never the token or any message text.
      if (!res.ok)
        throw new Error(`Discord GET ${path} answered ${res.status}`);
      return (await res.json()) as T;
    }
  };
}

/** Discord's epoch (2015-01-01) in ms: a snowflake's top bits are ms since then. */
const DISCORD_EPOCH = 1420070400000n;

/** The smallest snowflake at `ms`: messages `after` it were sent at or after that time. */
export function snowflakeAt(ms: number): string {
  return (
    (BigInt(Math.max(0, Math.floor(ms))) - DISCORD_EPOCH) <<
    22n
  ).toString();
}

/** The channels in the COMMUNITY category (by name, any case) that hold messages or threads. */
export function communityChannels(
  channels: readonly ApiChannel[],
): ApiChannel[] {
  const category = channels.find(
    (c) => c.type === CATEGORY && c.name.trim().toUpperCase() === "COMMUNITY",
  );
  if (!category) return [];
  return channels.filter(
    (c) => c.parent_id === category.id && THREAD_PARENTS.has(c.type),
  );
}

/** A channel's messages sent after `after` (a snowflake), oldest first, every page. */
export async function messagesAfter(
  get: DiscordGet,
  channelId: string,
  after: string,
): Promise<ApiMessage[]> {
  const all: ApiMessage[] = [];
  let cursor = after;
  for (;;) {
    const page = await get<ApiMessage[]>(
      `/channels/${channelId}/messages?after=${cursor}&limit=100`,
    );
    if (page.length === 0) break;
    all.push(...page);
    // Pages come newest first; the next page starts after this page's newest.
    cursor = page.reduce(
      (max, m) => (BigInt(m.id) > BigInt(max) ? m.id : max),
      page[0]?.id ?? cursor,
    );
    if (page.length < 100) break;
  }
  return all.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

/**
 * The threads of `parents` that may hold messages after `since` (ms): the guild's active threads,
 * plus each parent's public archived threads archived since then.
 */
export async function threadsOf(
  get: DiscordGet,
  guildId: string,
  parents: readonly ApiChannel[],
  since: number,
): Promise<ApiChannel[]> {
  const ids = new Set(parents.map((p) => p.id));
  const active = await get<{ threads: ApiChannel[] }>(
    `/guilds/${guildId}/threads/active`,
  );
  const threads = new Map<string, ApiChannel>();
  for (const t of active.threads)
    if (ids.has(t.parent_id ?? "")) threads.set(t.id, t);
  for (const parent of parents) {
    const archived = await get<{
      threads: (ApiChannel & {
        thread_metadata?: { archive_timestamp?: string };
      })[];
    }>(`/channels/${parent.id}/threads/archived/public?limit=50`);
    for (const t of archived.threads) {
      const at = Date.parse(t.thread_metadata?.archive_timestamp ?? "");
      if (Number.isFinite(at) && at >= since) threads.set(t.id, t);
    }
  }
  return [...threads.values()];
}

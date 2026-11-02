/**
 * The Slack watcher (#85): it polls #gojisim-dev and prints one line for each Monarch message
 * that has no check mark yet (the read-receipt rule), so Mecha's session wakes on the output.
 * The Slack API is passed in, so tests run without a network.
 */

export const CHANNEL = "C0CAKK9QHL3";
export const POLL_MS = 30_000;
/** #148: an unchecked Monarch message prints again after this long, so a busy session can't miss it. */
export const REMIND_MS = 15 * 60_000;
/** The read-receipt reaction. */
const CHECK = "white_check_mark";

export interface SlackMessage {
  ts: string;
  text?: string;
  reply_count?: number;
  latest_reply?: string;
  reactions?: { name: string }[];
}

/** One Web API call's outcome: the JSON body, or a 429 with its `Retry-After` in seconds. */
export type ApiResult =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "rateLimited"; retryAfter: number }
  | { kind: "error"; message: string };

export type Api = (
  method: string,
  params: Record<string, string>,
) => Promise<ApiResult>;

/** What one run remembers: when each message last printed, and each thread's last reply seen. */
export interface WatchState {
  printed: Map<string, number>;
  /** #148: the thread each printed reply is in, so a due reminder reads that thread again. */
  replyThread: Map<string, string>;
  threads: Map<string, string>;
}

export const newState = (): WatchState => ({
  printed: new Map(),
  replyThread: new Map(),
  threads: new Map(),
});

/** A poll's printed lines, and how long to wait before the next one. */
export interface PollResult {
  lines: string[];
  waitMs: number;
}

/** A Monarch message (its text starts with "[Monarch]") with no check mark. */
export function needsCheck(message: SlackMessage): boolean {
  return (
    (message.text ?? "").startsWith("[Monarch]") &&
    !(message.reactions ?? []).some((r) => r.name === CHECK)
  );
}

/** "HH:MM" in local time from a Slack ts (seconds since the epoch). */
function time(ts: string): string {
  const d = new Date(Number(ts) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The printed line: `[slack] Monarch <time> <first 80 chars> ts=<ts>`. */
export function lineFor(message: SlackMessage): string {
  const text = (message.text ?? "")
    .replace(/^\[Monarch\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `[slack] Monarch ${time(message.ts)} ${text} ts=${message.ts}`;
}

/**
 * One poll: the channel's latest page, then the replies of every thread whose latest reply is
 * new to this run. A rate limit stops the poll and waits `Retry-After`; any other error prints
 * one line and the next poll tries again (a thread whose replies failed is read again then).
 * #148: a message still unchecked `REMIND_MS` after it printed prints again, marked "(still
 * unchecked)"; replies are read for that too, since a thread's unchecked reply needs no new reply.
 */
export async function poll(
  api: Api,
  state: WatchState,
  channel = CHANNEL,
  now = Date.now(),
): Promise<PollResult> {
  const lines: string[] = [];
  const report = (message: SlackMessage) => {
    if (!needsCheck(message)) return;
    const last = state.printed.get(message.ts);
    if (last !== undefined && now - last < REMIND_MS) return;
    state.printed.set(message.ts, now);
    lines.push(
      last === undefined
        ? lineFor(message)
        : `${lineFor(message)} (still unchecked)`,
    );
  };
  // A thread holding a printed reply that is due a reminder is read again.
  const due = (thread: string) =>
    [...state.replyThread].some(
      ([reply, parent]) =>
        parent === thread &&
        now - (state.printed.get(reply) ?? now) >= REMIND_MS,
    );
  const history = await api("conversations.history", {
    channel,
    limit: "200",
  });
  if (history.kind === "rateLimited")
    return { lines, waitMs: history.retryAfter * 1000 };
  if (history.kind === "error")
    return {
      lines: [`[slack] error conversations.history: ${history.message}`],
      waitMs: POLL_MS,
    };
  const messages = (history.body["messages"] ?? []) as SlackMessage[];
  // Oldest first, so lines print in the order Monarch posted.
  for (const message of [...messages].reverse()) {
    report(message);
    if (!message.reply_count || !message.latest_reply) continue;
    if (
      state.threads.get(message.ts) === message.latest_reply &&
      !due(message.ts)
    )
      continue;
    const replies = await api("conversations.replies", {
      channel,
      ts: message.ts,
      limit: "200",
    });
    if (replies.kind === "rateLimited")
      return { lines, waitMs: replies.retryAfter * 1000 };
    if (replies.kind === "error") {
      lines.push(`[slack] error conversations.replies: ${replies.message}`);
      continue;
    }
    // The first entry is the parent, already checked above.
    for (const reply of (
      (replies.body["messages"] ?? []) as SlackMessage[]
    ).filter((r) => r.ts !== message.ts)) {
      if (needsCheck(reply)) state.replyThread.set(reply.ts, message.ts);
      else state.replyThread.delete(reply.ts);
      report(reply);
    }
    state.threads.set(message.ts, message.latest_reply);
  }
  return { lines, waitMs: POLL_MS };
}

/** The Slack Web API over `fetch`, with the token as a bearer header. */
export function slackApi(token: string, fetchFn: typeof fetch = fetch): Api {
  return async (method, params) => {
    try {
      const response = await fetchFn(
        `https://slack.com/api/${method}?${new URLSearchParams(params)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.status === 429)
        return {
          kind: "rateLimited",
          retryAfter: Number(response.headers.get("Retry-After") ?? "30") || 30,
        };
      if (!response.ok)
        return { kind: "error", message: `HTTP ${response.status}` };
      const body = (await response.json()) as Record<string, unknown>;
      if (body["ok"] !== true)
        return { kind: "error", message: String(body["error"] ?? "not ok") };
      return { kind: "ok", body };
    } catch (err) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

/**
 * The token: `SLACK_WATCH_TOKEN` from the environment (direnv loads `.envrc`), else read from the
 * repo's `.envrc` directly, since a background shell may not run direnv. It is never printed.
 */
export function tokenFrom(
  env: Record<string, string | undefined>,
  envrc: string | null,
): string | null {
  if (env["SLACK_WATCH_TOKEN"]) return env["SLACK_WATCH_TOKEN"];
  const match = envrc?.match(
    /^\s*(?:export\s+)?SLACK_WATCH_TOKEN=["']?([^"'\s]+)["']?\s*$/m,
  );
  return match?.[1] ?? null;
}

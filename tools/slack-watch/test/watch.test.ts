import { describe, expect, it } from "vitest";
import {
  type Api,
  type ApiResult,
  newState,
  poll,
  POLL_MS,
  type SlackMessage,
  slackApi,
  tokenFrom,
} from "../src/watch";

/** A mocked Web API: history and replies from fixed data, recording each call. */
function mockApi(
  history: SlackMessage[],
  replies: Record<string, SlackMessage[]> = {},
  override?: (method: string) => ApiResult | undefined,
) {
  const calls: string[] = [];
  const api: Api = (method, params) => {
    calls.push(
      method === "conversations.replies" ? `replies ${params["ts"]}` : method,
    );
    const forced = override?.(method);
    if (forced) return Promise.resolve(forced);
    const messages =
      method === "conversations.history"
        ? history
        : (replies[params["ts"] ?? ""] ?? []);
    return Promise.resolve({ kind: "ok", body: { ok: true, messages } });
  };
  return { api, calls };
}

const checked = [{ name: "white_check_mark" }];

describe("slack watcher (#85)", () => {
  it("prints each unchecked Monarch message once; checked ones and Mecha's don't print", async () => {
    // Newest first, as conversations.history returns them.
    const history: SlackMessage[] = [
      {
        ts: "1793319000.000300",
        text: "[Monarch] Start #85 now:\nSlack watcher.",
      },
      { ts: "1793319000.000200", text: "[Mecha] Status", reactions: checked },
      {
        ts: "1793319000.000100",
        text: "[Monarch] Old answer",
        reactions: checked,
      },
      { ts: "1793318000.000100", text: "[Monarch] Earlier question" },
    ];
    const { api } = mockApi(history);
    const state = newState();
    const first = await poll(api, state);
    expect(first.waitMs).toBe(POLL_MS);
    expect(first.lines).toHaveLength(2);
    // Oldest first, Monarch's prefix dropped, newlines collapsed, the ts at the end.
    expect(first.lines[0]).toMatch(
      /^\[slack\] Monarch \d\d:\d\d Earlier question ts=1793318000\.000100$/,
    );
    expect(first.lines[1]).toMatch(
      / Start #85 now: Slack watcher\. ts=1793319000\.000300$/,
    );
    // The same messages, still unchecked, don't print again in this run.
    expect((await poll(api, state)).lines).toEqual([]);
  });

  it("cuts the text at 80 characters", async () => {
    const { api } = mockApi([
      { ts: "1.000001", text: `[Monarch] ${"x".repeat(100)}` },
    ]);
    const [line] = (await poll(api, newState())).lines;
    expect(line).toContain(` ${"x".repeat(80)} ts=1.000001`);
  });

  it("finds unchecked Monarch replies in threads, and reads a thread again only when its latest reply changes", async () => {
    const parent: SlackMessage = {
      ts: "100.000001",
      text: "[Mecha] PR open",
      reactions: checked,
      reply_count: 2,
      latest_reply: "100.000003",
    };
    const replies = {
      "100.000001": [
        parent,
        {
          ts: "100.000002",
          text: "[Monarch] Checked reply",
          reactions: checked,
        },
        { ts: "100.000003", text: "[Monarch] Question in the thread" },
      ],
    };
    const { api, calls } = mockApi([parent], replies);
    const state = newState();
    const lines = (await poll(api, state)).lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/Question in the thread ts=100\.000003$/);
    // Unchanged thread: no replies call on the next poll.
    await poll(api, state);
    expect(calls.filter((c) => c.startsWith("replies"))).toHaveLength(1);
    // A new reply: the thread is read again and the new message prints.
    parent.latest_reply = "100.000004";
    replies["100.000001"].push({
      ts: "100.000004",
      text: "[Monarch] Follow-up",
    });
    const next = (await poll(api, state)).lines;
    expect(next).toHaveLength(1);
    expect(next[0]).toMatch(/Follow-up ts=100\.000004$/);
  });

  it("a 429 backs off for Retry-After; another error prints one line and keeps polling", async () => {
    const limited = mockApi([], {}, () => ({
      kind: "rateLimited",
      retryAfter: 45,
    }));
    expect(await poll(limited.api, newState())).toEqual({
      lines: [],
      waitMs: 45_000,
    });
    const failing = mockApi([], {}, () => ({
      kind: "error",
      message: "invalid_auth",
    }));
    expect(await poll(failing.api, newState())).toEqual({
      lines: ["[slack] error conversations.history: invalid_auth"],
      waitMs: POLL_MS,
    });
  });

  it("slackApi: a 429 reads Retry-After; a not-ok body is an error; the token goes in the header only", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const respond = (response: Response): typeof fetch =>
      ((url: string, init?: RequestInit) => {
        seen.push({
          url,
          auth: new Headers(init?.headers).get("Authorization"),
        });
        return Promise.resolve(response);
      }) as typeof fetch;
    const limited = slackApi(
      "xoxp-secret",
      respond(
        new Response("", { status: 429, headers: { "Retry-After": "12" } }),
      ),
    );
    expect(await limited("conversations.history", { channel: "C1" })).toEqual({
      kind: "rateLimited",
      retryAfter: 12,
    });
    expect(seen[0]?.auth).toBe("Bearer xoxp-secret");
    expect(seen[0]?.url).not.toContain("xoxp-secret");
    const notOk = slackApi(
      "xoxp-secret",
      respond(
        new Response(JSON.stringify({ ok: false, error: "missing_scope" })),
      ),
    );
    expect(await notOk("conversations.history", { channel: "C1" })).toEqual({
      kind: "error",
      message: "missing_scope",
    });
  });

  it("the token comes from the environment, else from .envrc", () => {
    expect(
      tokenFrom({ SLACK_WATCH_TOKEN: "a" }, "export SLACK_WATCH_TOKEN=b"),
    ).toBe("a");
    expect(
      tokenFrom({}, 'export OTHER=1\nexport SLACK_WATCH_TOKEN="xoxp-1"\n'),
    ).toBe("xoxp-1");
    expect(tokenFrom({}, "SLACK_WATCH_TOKEN=xoxp-2")).toBe("xoxp-2");
    expect(tokenFrom({}, null)).toBeNull();
  });
});

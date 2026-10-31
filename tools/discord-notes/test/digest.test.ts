import { describe, expect, it, vi } from "vitest";
import {
  type ApiChannel,
  type ApiMessage,
  communityChannels,
  discordClient,
  snowflakeAt,
} from "../src/discordApi";
import { messageLines, sections, slackMessages } from "../src/digest";
import { runDigest } from "../src/digestRun";

// Made-up server, names and messages (#140): recorded answers in Discord's API shape.

const NOW = Date.UTC(2026, 9, 31, 13, 0);
const HOUR = 3600_000;
const id = (ms: number, n = 0) =>
  (BigInt(snowflakeAt(ms)) + BigInt(n)).toString();
const user = (name: string, uid = name) => ({
  id: uid,
  username: name.toLowerCase(),
  global_name: name,
});

const CHANNELS: ApiChannel[] = [
  { id: "cat-info", type: 4, name: "INFO" },
  { id: "cat-staff", type: 4, name: "Staff" },
  { id: "cat-community", type: 4, name: "Community" },
  { id: "rules", type: 0, name: "rules", parent_id: "cat-info" },
  { id: "reports", type: 0, name: "reports", parent_id: "cat-staff" },
  { id: "general", type: 0, name: "general", parent_id: "cat-community" },
  { id: "bugs", type: 15, name: "bug-forum", parent_id: "cat-community" },
  { id: "voice", type: 2, name: "Voice", parent_id: "cat-community" },
];

const msg = (
  over: Partial<ApiMessage> & { id: string; author: ApiMessage["author"] },
): ApiMessage => ({
  type: 0,
  timestamp: new Date(
    Number((BigInt(over.id) >> 22n) + 1420070400000n),
  ).toISOString(),
  content: "",
  ...over,
});

const OLD = msg({
  id: id(NOW - 30 * HOUR),
  author: user("Rodan"),
  content: "from yesterday morning",
});
const HELLO = msg({
  id: id(NOW - 5 * HOUR),
  author: user("Mothra Fan", "1001"),
  content:
    "Space Beam <:beam:123> looks off <@1002> @everyone https://example.com/shot",
  mentions: [user("Kiryu", "1002")],
  attachments: [
    { filename: "shot.png", url: "https://cdn.example.com/shot.png" },
  ],
});
const REPLY = msg({
  id: id(NOW - 4 * HOUR),
  type: 19,
  author: user("Kiryu", "1002"),
  content: "same here <script>",
  message_reference: { message_id: HELLO.id },
  referenced_message: HELLO,
});
const THREAD: ApiChannel = {
  id: "t1",
  type: 11,
  name: "Bot froze on turn 3",
  parent_id: "bugs",
};
const IN_THREAD = msg({
  id: id(NOW - 2 * HOUR),
  author: user("Anguirus"),
  content: "it froze after Counter",
});

/** A fake Discord: answers by path; records every request's method and path. */
function fakeDiscord(answers: Record<string, unknown>) {
  const calls: { method: string; path: string }[] = [];
  const fetchImpl = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).replace("https://discord.com/api/v10", "");
      calls.push({ method: init?.method ?? "GET", path });
      const key = Object.keys(answers).find((k) => path.startsWith(k));
      if (!key) return new Response("[]", { status: 404 });
      return new Response(JSON.stringify(answers[key]));
    },
  );
  return {
    get: discordClient(
      "bot-token",
      fetchImpl as unknown as typeof fetch,
      async () => {},
    ),
    calls,
    fetchImpl,
  };
}

describe("Discord digest (#140)", () => {
  it("reads only the COMMUNITY category's text, announcement and forum channels, never STAFF or INFO", () => {
    expect(communityChannels(CHANNELS).map((c) => c.id)).toEqual([
      "general",
      "bugs",
    ]);
    expect(
      communityChannels(CHANNELS.filter((c) => c.id !== "cat-community")),
    ).toEqual([]);
  });

  it("a message shows author, time and cleaned text with links; a reply its parent's author and first 80 characters; attachments as links; nothing can mention", () => {
    expect(messageLines(HELLO)).toEqual([
      "*Mothra Fan* (Oct 31, 08:00 UTC): Space Beam :beam: looks off @Kiryu @everyone https://example.com/shot",
      "  📎 <https://cdn.example.com/shot.png|shot.png>",
    ]);
    const lines = messageLines(REPLY);
    expect(lines[0]).toBe(
      "↳ replying to Mothra Fan: Space Beam :beam: looks off @Kiryu @everyone https://example.com/shot",
    );
    const long = msg({
      id: id(NOW - HOUR, 7),
      author: user("Long"),
      content: "x".repeat(200),
    });
    const toLong = msg({
      id: id(NOW - HOUR, 8),
      type: 19,
      author: user("B"),
      content: "ok",
      referenced_message: long,
      message_reference: { message_id: long.id },
    });
    expect(messageLines(toLong)[0]).toBe(
      `↳ replying to Long: ${"x".repeat(80)}`,
    );
    const orphan = msg({
      id: id(NOW - HOUR, 9),
      type: 19,
      author: user("C"),
      content: "?",
      referenced_message: null,
      message_reference: { message_id: "1" },
    });
    expect(messageLines(orphan)[0]).toBe("↳ replying to a message that's gone");
    expect(lines[1]).toContain("same here &lt;script&gt;");
  });

  it("the 24-hour window: `after` is the snowflake 24 h back, so yesterday's morning is left out; threads included; GET only", async () => {
    const after = snowflakeAt(NOW - 24 * HOUR);
    const { get, calls } = fakeDiscord({
      "/guilds/g1/channels": CHANNELS,
      "/guilds/g1/threads/active": {
        threads: [
          THREAD,
          { id: "t-staff", type: 11, name: "staff talk", parent_id: "reports" },
        ],
      },
      "/channels/general/threads/archived": { threads: [] },
      "/channels/bugs/threads/archived": { threads: [] },
      [`/channels/general/messages?after=${after}`]: [REPLY, HELLO],
      [`/channels/t1/messages?after=${after}`]: [IN_THREAD],
    });
    const posts: string[] = [];
    const logs: string[] = [];
    const sent = await runDigest({
      get,
      guildId: "g1",
      hours: 24,
      now: NOW,
      post: async (t) => (posts.push(t), 200),
      log: (l) => logs.push(l),
    });
    expect(sent).toBe(1);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.path.includes("reports") ||
          c.path.includes("t-staff") ||
          c.path.includes("rules"),
      ),
    ).toBe(false);
    const text = posts.join("\n");
    expect(text).toContain("*#general*");
    expect(text.indexOf("Mothra Fan")).toBeLessThan(text.indexOf("same here"));
    expect(text).toContain("_Thread: Bot froze on turn 3_");
    expect(text).toContain(">*Anguirus*");
    expect(text).not.toContain(OLD.content ?? "x");
    // The log: counts only.
    expect(logs).toEqual([
      "2 COMMUNITY channels, 1 threads, 3 new messages in the last 24 h.",
      "Posted 1 of 1 Slack messages.",
    ]);
    for (const secretish of [
      "Mothra",
      "Kiryu",
      "Space Beam",
      "froze",
      "bot-token",
      "example.com",
    ])
      expect(logs.join("\n")).not.toContain(secretish);
  });

  it("an empty day posts nothing", async () => {
    const { get } = fakeDiscord({
      "/guilds/g1/channels": CHANNELS,
      "/guilds/g1/threads/active": { threads: [] },
      "/channels/general/threads/archived": { threads: [] },
      "/channels/bugs/threads/archived": { threads: [] },
      "/channels/general/messages": [],
    });
    const post = vi.fn(async () => 200);
    const logs: string[] = [];
    expect(
      await runDigest({
        get,
        guildId: "g1",
        hours: 24,
        now: NOW,
        post,
        log: (l) => logs.push(l),
      }),
    ).toBe(0);
    expect(post).not.toHaveBeenCalled();
    expect(logs.at(-1)).toBe("Nothing new: no digest posted.");
  });

  it("splits across Slack messages under the limit, repeating a carried section's heading", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      msg({
        id: id(NOW - HOUR, i),
        author: user(`Tester${i}`),
        content: `note ${i} ${"words ".repeat(20)}`,
      }),
    );
    const texts = slackMessages(
      "*Digest*",
      sections([
        { channel: CHANNELS[5] as ApiChannel, messages: many, threads: [] },
      ]),
      1500,
    );
    expect(texts.length).toBeGreaterThan(3);
    for (const t of texts) expect(t.length).toBeLessThanOrEqual(1500);
    expect(texts[0]?.startsWith("*Digest*\n\n*#general*\n")).toBe(true);
    expect(texts[1]?.startsWith("*#general* (continued)\n")).toBe(true);
    expect(texts.join("\n").match(/Tester\d+\*/g)).toHaveLength(60);
    // One block too long for any message is cut.
    const huge = msg({
      id: id(NOW - HOUR, 99),
      author: user("Big"),
      content: "z".repeat(5000),
    });
    const cut = slackMessages(
      "*D*",
      sections([
        { channel: CHANNELS[5] as ApiChannel, messages: [huge], threads: [] },
      ]),
      1500,
    );
    expect(cut.every((t) => t.length <= 1500)).toBe(true);
    expect(cut.join("")).toContain("…");
  });

  it("pages through more than 100 messages, waits out a 429, and refuses anything but GET", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      msg({
        id: id(NOW - 3 * HOUR, 200 - i),
        author: user("A"),
        content: `m${200 - i}`,
      }),
    );
    const page2 = [
      msg({ id: id(NOW - 3 * HOUR, 300), author: user("A"), content: "last" }),
    ];
    let n = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      n++;
      if (n === 1)
        return new Response(JSON.stringify({ retry_after: 0.01 }), {
          status: 429,
        });
      return new Response(
        JSON.stringify(
          String(url).includes(`after=${id(NOW - 3 * HOUR, 200)}`)
            ? page2
            : page1,
        ),
      );
    });
    const sleep = vi.fn(async () => {});
    const get = discordClient("t", fetchImpl as unknown as typeof fetch, sleep);
    const { messagesAfter } = await import("../src/discordApi");
    const all = await messagesAfter(
      get,
      "general",
      snowflakeAt(NOW - 24 * HOUR),
    );
    expect(all).toHaveLength(101);
    expect(all.at(-1)?.content).toBe("last");
    expect(sleep).toHaveBeenCalledWith(10);
    for (const call of fetchImpl.mock.calls)
      expect((call as unknown[])[1]).toMatchObject({ method: "GET" });
  });
});

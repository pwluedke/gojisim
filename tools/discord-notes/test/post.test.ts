import { describe, expect, it, vi } from "vitest";
import { parseMentions, postPayload, postRequest, runPost } from "../src/post";

// A made-up webhook and made-up Discord ids.
const WEBHOOK = "https://discord.com/api/webhooks/111/secret-token";
const IAN = "266700000000000001";
const PAUL = "340600000000000002";

/** A fetch that records each call and answers with `answer`. */
function fakeFetch(answer: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(answer(String(url), init));
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const bodyOf = (init?: RequestInit) =>
  JSON.parse(String(init?.body)) as {
    content: string;
    allowed_mentions: { parse: string[]; users: string[] };
  };

describe("Discord post: mentions (Paul, Nov 12)", () => {
  it("reads comma-separated user ids, each once, and refuses anything else", () => {
    expect(parseMentions("")).toEqual([]);
    expect(parseMentions(` ${IAN}, ${PAUL},${IAN} `)).toEqual([IAN, PAUL]);
    expect(() => parseMentions("@everyone")).toThrow(/user ids/);
    expect(() => parseMentions("<@266700000000000001>")).toThrow(/user ids/);
    expect(() => parseMentions("12345")).toThrow(/user ids/);
  });

  it("lets only the listed users be pinged: never @everyone, roles or other users", () => {
    expect(postPayload(`Thanks <@${IAN}>`, [IAN])).toEqual({
      content: `Thanks <@${IAN}>`,
      allowed_mentions: { parse: [], users: [IAN] },
    });
    // No mentions listed: nothing pings, as before.
    expect(postPayload("@everyone hi", []).allowed_mentions).toEqual({
      parse: [],
      users: [],
    });
  });

  it("posts with ?wait=true and reports the new message's id in the summary", async () => {
    const { impl, calls } = fakeFetch(() =>
      json({ id: "1570000000000000099" }),
    );
    const summary: string[] = [];
    const log: string[] = [];
    const id = await runPost({
      webhook: WEBHOOK,
      message: `Picked up, <@${IAN}>: #247.`,
      mentions: IAN,
      fetchImpl: impl,
      log: (l) => log.push(l),
      summary: (l) => summary.push(l),
    });
    expect(id).toBe("1570000000000000099");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${WEBHOOK}?wait=true`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(bodyOf(calls[0]?.init).allowed_mentions).toEqual({
      parse: [],
      users: [IAN],
    });
    expect(summary.join("\n")).toContain("1570000000000000099");
    // The log never has the text or the webhook.
    expect(log.join("\n")).not.toMatch(/Picked up|secret-token/);
  });

  it("refuses a listed id the text doesn't tag as <@id>", async () => {
    const { impl, calls } = fakeFetch(() => json({ id: "1" }));
    await expect(
      runPost({
        webhook: WEBHOOK,
        message: "Thanks Ian",
        mentions: IAN,
        fetchImpl: impl,
      }),
    ).rejects.toThrow(/doesn't tag/);
    expect(calls).toHaveLength(0);
  });
});

describe("Discord post: editing a webhook message (Paul, Nov 12)", () => {
  it("PATCHes /messages/<id> with the new text and mentions instead of posting", async () => {
    const editId = "1570000000000000042";
    const { impl, calls } = fakeFetch(() => json({ id: editId }));
    const summary: string[] = [];
    await runPost({
      webhook: WEBHOOK,
      message: `Fixed in #249, <@${PAUL}>.`,
      mentions: PAUL,
      editId,
      fetchImpl: impl,
      summary: (l) => summary.push(l),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${WEBHOOK}/messages/${editId}`);
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(bodyOf(calls[0]?.init)).toEqual({
      content: `Fixed in #249, <@${PAUL}>.`,
      allowed_mentions: { parse: [], users: [PAUL] },
    });
    expect(summary.join("\n")).toContain(`Edited #bugs message \`${editId}\``);
  });

  it("keeps a reply's link on an edit, and says only the webhook's own messages can be edited", async () => {
    expect(postRequest(`${WEBHOOK}/`, "9".repeat(18)).url).toBe(
      `${WEBHOOK}/messages/${"9".repeat(18)}`,
    );
    const { impl, calls } = fakeFetch((url, init) =>
      init?.method === "PATCH"
        ? json({ message: "Unknown Message" }, 404)
        : json({ guild_id: "222", channel_id: "333" }),
    );
    await expect(
      runPost({
        webhook: WEBHOOK,
        message: "Edited",
        replyTo: "1567000000000000001",
        editId: "1570000000000000042",
        fetchImpl: impl,
      }),
    ).rejects.toThrow(/HTTP 404.*own messages/);
    expect(bodyOf(calls[1]?.init).content).toBe(
      "↪ Re: https://discord.com/channels/222/333/1567000000000000001\nEdited",
    );
  });

  it("refuses an edit_id that isn't a message id", async () => {
    const { impl, calls } = fakeFetch(() => json({ id: "1" }));
    await expect(
      runPost({
        webhook: WEBHOOK,
        message: "x",
        editId: "../../1",
        fetchImpl: impl,
      }),
    ).rejects.toThrow(/edit_id/);
    expect(calls).toHaveLength(0);
  });
});

describe("Discord post through the bot to any channel or thread (Paul, Nov 15)", () => {
  const BOT = "bot-secret-token";
  const THREAD = "1450000000000000077";
  const PARENT = "1570000000000000055";

  it("with channel_id, posts through the bot to that channel or thread as a real reply, only the listed users pinged; the log has the channel id and message id only", async () => {
    const { impl, calls } = fakeFetch(() =>
      json({ id: "1570000000000000101" }),
    );
    const log: string[] = [];
    const summary: string[] = [];
    const id = await runPost({
      webhook: WEBHOOK,
      channelId: THREAD,
      botToken: BOT,
      message: `Thanks <@${IAN}>, fixed in #350.`,
      mentions: IAN,
      replyTo: PARENT,
      fetchImpl: impl,
      log: (l) => log.push(l),
      summary: (l) => summary.push(l),
    });
    expect(id).toBe("1570000000000000101");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://discord.com/api/v10/channels/${THREAD}/messages`,
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(
      (calls[0]?.init?.headers as Record<string, string>)["Authorization"],
    ).toBe(`Bot ${BOT}`);
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      content: string;
      allowed_mentions: { parse: string[]; users: string[] };
      message_reference?: { message_id: string };
    };
    expect(body.allowed_mentions).toEqual({ parse: [], users: [IAN] });
    expect(body.message_reference?.message_id).toBe(PARENT);
    // A real reply: no link line in the text.
    expect(body.content).toBe(`Thanks <@${IAN}>, fixed in #350.`);
    expect(log).toEqual([
      "Discord answered HTTP 200",
      `Channel id ${THREAD}, message id 1570000000000000101`,
    ]);
    expect(log.join("\n")).not.toMatch(/Thanks|bot-secret-token|secret-token/);
    expect(summary.join("\n")).toContain(THREAD);
  });

  it("with channel_id and edit_id, PATCHes the bot's message in that channel", async () => {
    const { impl, calls } = fakeFetch(() =>
      json({ id: "1570000000000000101" }),
    );
    await runPost({
      webhook: "",
      channelId: THREAD,
      botToken: BOT,
      message: "Fixed in #350 (released).",
      editId: "1570000000000000101",
      fetchImpl: impl,
      log: () => {},
    });
    expect(calls[0]?.url).toBe(
      `https://discord.com/api/v10/channels/${THREAD}/messages/1570000000000000101`,
    );
    expect(calls[0]?.init?.method).toBe("PATCH");
  });

  it("refuses a channel_id that isn't an id, or a missing bot token, before any call", async () => {
    const { impl, calls } = fakeFetch(() => json({}));
    await expect(
      runPost({
        webhook: WEBHOOK,
        channelId: "#general",
        botToken: BOT,
        message: "x",
        fetchImpl: impl,
        log: () => {},
      }),
    ).rejects.toThrow(/channel_id/);
    await expect(
      runPost({
        webhook: WEBHOOK,
        channelId: THREAD,
        botToken: "",
        message: "x",
        fetchImpl: impl,
        log: () => {},
      }),
    ).rejects.toThrow(/DISCORD_BOT_TOKEN/);
    expect(calls).toHaveLength(0);
  });

  it("without channel_id, the #bugs webhook posts as before", async () => {
    const { impl, calls } = fakeFetch(() =>
      json({ id: "1570000000000000099" }),
    );
    await runPost({
      webhook: WEBHOOK,
      botToken: BOT,
      message: "Hi",
      fetchImpl: impl,
      log: () => {},
    });
    expect(calls[0]?.url).toBe(`${WEBHOOK}?wait=true`);
  });
});

import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppServer } from "./index.js";
import {
  firstAppFrame,
  gameContext,
  MESSAGE_MAX,
  newReports,
  POSTS_PER_UPLOAD,
  reportMessage,
  reportPoster,
} from "./reports.js";

const GAME = "11111111-2222-4333-8444-555555555555";
const AT = (s: number) => `2026-10-30T21:00:${String(s).padStart(2, "0")}.000Z`;
const base = {
  version: 1,
  seed: 7,
  gameId: GAME,
  decks: [
    {
      id: "P1",
      monsterDeck: ["SECRET-MONSTER-1"],
      mainDeck: ["SECRET-CARD-1"],
    },
    {
      id: "P2",
      monsterDeck: ["SECRET-MONSTER-2"],
      mainDeck: ["SECRET-CARD-2"],
    },
  ],
  actions: [{ type: "pass", player: "P1" }],
  seats: {
    P1: { kind: "human" },
    P2: { kind: "bot", bot: "ismcts", settings: { difficulty: 20 } },
  },
  deckNames: { P1: "ESD01 official", P2: "Kaiju Rush" },
};
const bug = {
  actionIndex: 35,
  when: "Turn 6, Main phase",
  text: "Godzilla left zone 8 @everyone",
  reporter: "Tester",
  at: AT(1),
};
const bad = {
  kind: "bad",
  actionIndex: 34,
  label: "Bot (Easy): Move Godzilla (2023) to zone 2 (Turn 6, Main phase)",
  text: "big blunder",
  reporter: "Tester",
  at: AT(2),
};
const good = { ...bad, kind: "good", text: "nice", at: AT(3) };
const idea = {
  kind: "idea",
  actionIndex: 3,
  text: "Add a timer",
  reporter: "Tester",
  at: AT(4),
};
const crash = {
  message: "TypeError: x is undefined",
  stack:
    "TypeError: x is undefined\n    at applyAction (https://gojisim.somanygames.app/assets/index-abc.js:1:200)\n    at y (https://gojisim.somanygames.app/assets/index-abc.js:1:300)",
  source: "bot",
  at: AT(5),
  actionIndex: 40,
  when: "Turn 7, Battle phase",
};

describe("Discord staff reports (#136)", () => {
  it("finds each kind's new entries, and none that the game's earlier upload already had", () => {
    const record = {
      ...base,
      bugReports: [bug],
      botFeedback: [bad, good],
      ideas: [idea],
      crash,
    };
    expect(newReports(record, null).map((r) => r.kind)).toEqual([
      "Report bug",
      "Bad Bot!",
      "Good Bot!",
      "Mailbox",
      "Crash",
    ]);
    expect(newReports(record, record)).toEqual([]);
    const later = {
      ...record,
      bugReports: [bug, { ...bug, text: "second", at: AT(9) }],
    };
    expect(newReports(later, record).map((r) => r.text)).toEqual(["second"]);
    // An entry from before Good Bot! (no kind) is a Bad Bot!.
    const { kind: _k, ...old } = bad;
    expect(newReports({ ...base, botFeedback: [old] }, null)[0]?.kind).toBe(
      "Bad Bot!",
    );
    expect(newReports("junk", null)).toEqual([]);
  });

  it("a post names the kind, reporter, turn and phase, bots, decks, note and file, and never a decklist", () => {
    const record = { ...base, bugReports: [bug] };
    const [report] = newReports(record, null);
    const text = reportMessage(
      report!,
      gameContext(record),
      `2026-10-30/${GAME}.json`,
    );
    expect(text.split("\n")).toEqual([
      "**Report bug** · from Tester · Turn 6, Main phase",
      "human vs Easy · ESD01 official vs Kaiju Rush",
      "> Godzilla left zone 8 @everyone",
      `\`2026-10-30/${GAME}.json\` --at 35`,
    ]);
    expect(text).not.toContain("SECRET");
    const [b] = newReports({ ...base, botFeedback: [bad] }, null);
    expect(reportMessage(b!, gameContext(base), "f.json")).toContain(
      "**Bad Bot!** · from Tester · Turn 6, Main phase\nhuman vs Easy · ESD01 official vs Kaiju Rush\nMove: Bot (Easy): Move Godzilla (2023) to zone 2 (Turn 6, Main phase)",
    );
    const [m] = newReports({ ...base, ideas: [idea] }, null);
    const mail = reportMessage(m!, gameContext(base), "f.json");
    expect(mail.startsWith("**Mailbox** · from Tester\n")).toBe(true);
    expect(mail.endsWith("`f.json`")).toBe(true);
  });

  it("a crash post has the error and the first app frame; levels and Mystery Deck fill in", () => {
    const [c] = newReports({ ...base, crash }, null);
    const text = reportMessage(
      c!,
      gameContext({
        seats: {
          P1: { kind: "bot", settings: { difficulty: 90 } },
          P2: { kind: "bot", settings: { difficulty: 42 } },
        },
      }),
      "f.json",
    );
    expect(text).toContain(
      "**Crash** · Turn 7, Battle phase · source: bot\nHard vs Level 42 · Mystery Deck vs Mystery Deck",
    );
    expect(text).toContain("> TypeError: x is undefined");
    expect(text).toContain(
      "Frame: `at applyAction (https://gojisim.somanygames.app/assets/index-abc.js:1:200)`",
    );
    expect(text.endsWith("`f.json` --at 40")).toBe(true);
    expect(
      firstAppFrame(
        "Error\n@debugger eval code:1:1\nfn@https://a.app/x.js:1:2",
      ),
    ).toBe("fn@https://a.app/x.js:1:2");
  });

  it("a long note is cut so the post stays under Discord's limit, with the file last; multi-line notes stay quoted", () => {
    const [r] = newReports(
      {
        ...base,
        bugReports: [{ ...bug, text: `# heading\n${"x".repeat(5000)}` }],
      },
      null,
    );
    const text = reportMessage(r!, gameContext(base), "f.json");
    expect(text.length).toBeLessThanOrEqual(MESSAGE_MAX);
    expect(text).toContain("> # heading\n> xxx");
    expect(text).toContain("…");
    expect(text.endsWith("`f.json` --at 35")).toBe(true);
  });

  it("posts each new entry once with mentions off, caps a flood, and never throws", async () => {
    const bodies: unknown[] = [];
    const fake = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      },
    );
    const logs: string[] = [];
    const post = reportPoster({
      webhook: "https://discord.com/api/webhooks/1/secret",
      fetchImpl: fake as unknown as typeof fetch,
      log: (l) => logs.push(l),
    });
    expect(await post({ ...base, bugReports: [bug] }, null, "f.json")).toBe(1);
    expect(bodies[0]).toMatchObject({ allowed_mentions: { parse: [] } });
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...bug,
      at: AT(10 + i),
    }));
    expect(await post({ ...base, bugReports: many }, null, "f.json")).toBe(
      POSTS_PER_UPLOAD + 1,
    );
    expect((bodies.at(-1) as { content: string }).content).toBe(
      "…and 7 more new entries in `f.json` (`pnpm feedback`).",
    );
    expect(logs).toEqual([]);

    const down = reportPoster({
      webhook: "https://discord.com/api/webhooks/1/secret",
      fetchImpl: (async () => {
        throw new DOMException("timed out", "TimeoutError");
      }) as typeof fetch,
      log: (l) => logs.push(l),
    });
    expect(await down({ ...base, bugReports: [bug] }, null, "f.json")).toBe(0);
    const refused = reportPoster({
      webhook: "https://discord.com/api/webhooks/1/secret",
      fetchImpl: (async () =>
        new Response("", { status: 429 })) as typeof fetch,
      log: (l) => logs.push(l),
    });
    expect(await refused({ ...base, bugReports: [bug] }, null, "f.json")).toBe(
      0,
    );
    const missing = reportPoster({
      webhook: undefined,
      log: (l) => logs.push(l),
    });
    await missing({ ...base, bugReports: [bug] }, null, "f.json");
    await missing({ ...base, bugReports: [bug] }, null, "f.json");
    expect(logs).toEqual([
      "GojiSim: a Discord report post failed (TimeoutError).",
      "GojiSim: a Discord report post failed (HTTP 429).",
      "GojiSim: DISCORD_REPORTS_WEBHOOK isn't set; tester reports aren't posted to Discord.",
    ]);
    expect(logs.join("\n")).not.toContain("secret");
  });
});

describe("the upload route posts to a fake webhook (#136)", () => {
  let servers: ReturnType<typeof createAppServer>[] = [];
  afterEach(() => {
    for (const s of servers) s.close();
    servers = [];
  });
  async function serve(reportsFetch: typeof fetch) {
    const recordsDir = mkdtempSync(join(tmpdir(), "gojisim-reports-"));
    const server = createAppServer({
      distDir: recordsDir,
      cardsDir: recordsDir,
      recordsDir,
      reportsWebhook: "https://discord.com/api/webhooks/1/secret",
      reportsFetch,
      now: () => Date.UTC(2026, 9, 30, 12),
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    return (record: unknown) =>
      fetch(`http://localhost:${port}/api/games`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.7",
        },
        body: JSON.stringify(record),
      });
  }

  it("each kind is posted once, a re-upload of the same game posts only what's new, and the file is named", async () => {
    const contents: string[] = [];
    const send = await serve((async (_u: unknown, init?: RequestInit) => {
      contents.push(
        (JSON.parse(String(init?.body)) as { content: string }).content,
      );
      return new Response(null, { status: 204 });
    }) as typeof fetch);
    const first = { ...base, bugReports: [bug], botFeedback: [bad] };
    expect((await send(first)).status).toBe(201);
    await vi.waitFor(() => expect(contents).toHaveLength(2));
    expect(contents[0]).toContain(`\`2026-10-30/${GAME}.json\` --at 35`);
    const again = { ...first, botFeedback: [bad, good], ideas: [idea], crash };
    expect((await send(again)).status).toBe(201);
    await vi.waitFor(() => expect(contents).toHaveLength(5));
    expect(contents.slice(2).map((c) => c.split(" ")[0])).toEqual([
      "**Good",
      "**Mailbox**",
      "**Crash**",
    ]);
    expect((await send(again)).status).toBe(201);
    await new Promise((r) => setTimeout(r, 50));
    expect(contents).toHaveLength(5);
    expect(contents.join("\n")).not.toContain("SECRET");
  });

  it("a webhook that hangs or fails never holds up or changes the upload's answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const hang = await serve(
        (() => new Promise<Response>(() => {})) as typeof fetch,
      );
      const started = Date.now();
      const res = await hang({ ...base, bugReports: [bug] });
      expect(res.status).toBe(201);
      expect(Date.now() - started).toBeLessThan(2000);
      const fail = await serve((async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch);
      expect((await fail({ ...base, bugReports: [bug] })).status).toBe(201);
      await vi.waitFor(() =>
        expect(warn).toHaveBeenCalledWith(
          "GojiSim: a Discord report post failed (TypeError).",
        ),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

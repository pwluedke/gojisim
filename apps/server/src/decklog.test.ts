import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DECKLOG_VIEW_API, fetchDecklog } from "./decklog.js";
import { createAppServer } from "./index.js";

/** Decklog's recorded answer for deck 1STAP (no network in tests). */
const recorded = readFileSync(
  new URL(
    "../../../packages/cards/test/fixtures/decklog-1STAP.json",
    import.meta.url,
  ),
  "utf8",
);

const answering = (body: string, status = 200) =>
  vi.fn<typeof fetch>(
    async () =>
      new Response(body, {
        status,
        headers: { "content-type": "application/json" },
      }),
  );

describe("fetchDecklog", () => {
  it("POSTs {} to Decklog's view API and keeps only the fields GojiSim reads", async () => {
    const fetchMock = answering(recorded);
    const result = await fetchDecklog("1STAP", fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${DECKLOG_VIEW_API}1STAP`);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("{}");
    // Without the deck page as referer, Decklog answers [] even for a real deck.
    expect((init?.headers as Record<string, string>)["referer"]).toBe(
      "https://decklog-en.bushiroad.com/view/1STAP",
    );
    expect(result.status).toBe(200);
    const body = result.body as {
      code: string;
      title: string;
      list: { card_number: string; num: number }[];
      p_list: unknown[];
      sub_list: unknown[];
    };
    expect(Object.keys(body).sort()).toEqual(
      ["code", "list", "p_list", "sub_list", "title"].sort(),
    );
    expect(body.code).toBe("1STAP");
    expect(body.title).toBe("The Despangler");
    expect(body.p_list).toHaveLength(4);
    expect(body.list.reduce((n, e) => n + e.num, 0)).toBe(50);
    expect(body.list[0]).toEqual({ card_number: "EBP01-002+", num: 4 });
  });

  it("deck not found: Decklog answers [] for an unknown code", async () => {
    const result = await fetchDecklog("ZZZZZ9", answering("[]"));
    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      error: "not-found",
      message: "Decklog has no deck ZZZZZ9",
    });
  });

  it("Decklog unreachable: a network error, an error status or unreadable JSON", async () => {
    const down = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await fetchDecklog("1STAP", down)).status).toBe(502);
    expect(
      (await fetchDecklog("1STAP", answering("<html>", 403))).body,
    ).toEqual({
      error: "unreachable",
      message: "Decklog can't be reached right now",
    });
    expect((await fetchDecklog("1STAP", answering("not json"))).status).toBe(
      502,
    );
    expect(
      (await fetchDecklog("1STAP", answering('{"list":"x"}'))).status,
    ).toBe(502);
  });

  it("another game's deck is refused", async () => {
    const other = JSON.stringify({ ...JSON.parse(recorded), game_title_id: 1 });
    const result = await fetchDecklog("1STAP", answering(other));
    expect(result.status).toBe(422);
  });

  it("a code that can't be a Decklog code is refused without a request", async () => {
    const fetchMock = answering(recorded);
    expect((await fetchDecklog("../x", fetchMock)).status).toBe(400);
    expect((await fetchDecklog("", fetchMock)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/decklog/<code> on the app server", () => {
  const server = createAppServer({ fetchImpl: answering(recorded) });
  afterEach(() => {
    server.close();
  });

  it("answers the deck as JSON; the health route answers ok", async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/decklog/1STAP`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(((await res.json()) as { title: string }).title).toBe(
      "The Despangler",
    );
    const bad = await fetch(`http://localhost:${port}/api/decklog/%E0%A4%A`);
    expect(bad.status).toBe(400);
    const ok = await fetch(`http://localhost:${port}/healthz`);
    expect(await ok.json()).toMatchObject({ status: "ok" });
  });
});

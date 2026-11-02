import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMe, fetchMyGame, fetchMyGames, meFrom, resetMe } from "./account";

afterEach(() => resetMe());

describe("the signed-in player (#150)", () => {
  it("reads /api/me's player, and nothing else", () => {
    expect(
      meFrom({
        id: "p1",
        name: "Kiryu",
        avatarUrl: "https://cdn.discordapp.com/a.png",
      }),
    ).toEqual({
      id: "p1",
      name: "Kiryu",
      avatarUrl: "https://cdn.discordapp.com/a.png",
    });
    expect(
      meFrom({ id: "p1", name: "Kiryu", avatarUrl: null })?.avatarUrl,
    ).toBeNull();
    for (const bad of [
      null,
      "x",
      {},
      { error: "no-accounts" },
      { id: 1, name: "x" },
    ])
      expect(meFrom(bad)).toBeNull();
  });

  it("asks once per page load; 404 (no accounts), 401 or offline means no player", async () => {
    const ok = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "p", name: "N", avatarUrl: null })),
    );
    expect(await fetchMe(ok as unknown as typeof fetch)).toMatchObject({
      name: "N",
    });
    expect(await fetchMe(ok as unknown as typeof fetch)).toMatchObject({
      name: "N",
    });
    expect(ok).toHaveBeenCalledTimes(1);
    for (const status of [404, 401]) {
      resetMe();
      expect(
        await fetchMe(
          (async () =>
            new Response("{}", { status })) as unknown as typeof fetch,
        ),
      ).toBeNull();
    }
    resetMe();
    expect(
      await fetchMe((async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});

describe("my games (#151)", () => {
  it("lists the player's games; no accounts (404) or offline is null", async () => {
    const game = {
      gameId: "g1",
      startedAt: 1,
      updatedAt: 2,
      endedAt: null,
      result: null,
      botLevel: "Easy",
      deckNames: "A vs B",
    };
    const ok = (async () =>
      new Response(
        JSON.stringify({ games: [game] }),
      )) as unknown as typeof fetch;
    expect(await fetchMyGames(ok)).toEqual([game]);
    expect(
      await fetchMyGames(
        (async () =>
          new Response("{}", { status: 404 })) as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(
      await fetchMyGames((async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });

  it("loads one game's record by id, encoded", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response('{"version":1}');
    }) as unknown as typeof fetch;
    expect(await fetchMyGame("a/b", fetchImpl)).toBe('{"version":1}');
    expect(urls).toEqual(["/api/games/a%2Fb"]);
    expect(
      await fetchMyGame(
        "x",
        (async () =>
          new Response("", { status: 404 })) as unknown as typeof fetch,
      ),
    ).toBeNull();
  });
});

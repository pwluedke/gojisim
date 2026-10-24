import { describe, expect, it, vi } from "vitest";
import { fetchDecklogDeck } from "./decklog";

const answer = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status }),
  );

describe("fetchDecklogDeck", () => {
  it("returns the route's deck", async () => {
    const deck = {
      code: "1STAP",
      title: "T",
      list: [],
      p_list: [],
      sub_list: [],
    };
    const fetchMock = answer(200, deck);
    expect(await fetchDecklogDeck("1STAP", fetchMock)).toEqual({ deck });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/decklog/1STAP");
  });

  it("deck not found, Decklog unreachable, and no route each get their own message", async () => {
    expect(
      await fetchDecklogDeck(
        "ZZZZZ9",
        answer(404, {
          error: "not-found",
          message: "Decklog has no deck ZZZZZ9",
        }),
      ),
    ).toEqual({ error: "Decklog has no deck ZZZZZ9." });
    expect(
      await fetchDecklogDeck("1STAP", answer(502, { error: "unreachable" })),
    ).toEqual({
      error: "Decklog can't be reached right now. Try again later.",
    });
    const noRoute = vi.fn<typeof fetch>(
      async () => new Response("<!doctype html>", { status: 200 }),
    );
    expect(await fetchDecklogDeck("1STAP", noRoute)).toEqual({
      error: expect.stringContaining("needs GojiSim's server"),
    });
  });
});

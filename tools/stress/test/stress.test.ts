import { type GameRecord, replay, stateHash } from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { PAIRINGS, playGame } from "../src/stress";

describe("stress test (spec case 52)", () => {
  it("Engine: random games finish with a result and no invariant violations", () => {
    for (let game = 0; game < 8; game++) {
      const outcome = playGame("vitest", game);
      expect(outcome.failure).toBeNull();
      expect(outcome.result).not.toBeNull();
    }
  });

  it("Engine: a game's record replays to the same final state", () => {
    const outcome = playGame("vitest", 3);
    const live = replay(outcome.record);
    expect(
      stateHash(
        replay(JSON.parse(JSON.stringify(outcome.record)) as GameRecord),
      ),
    ).toBe(stateHash(live));
    expect(live.result).toEqual(outcome.result);
  });

  it("Engine: deck pairings alternate ESD01/ESD02 game by game", () => {
    const sets = (game: number) =>
      playGame("pairs", game).record.decks.map((d) => d.monsterDeck[0]?.set);
    expect([0, 1, 2, 3].map(sets)).toEqual(PAIRINGS.map((p) => [...p]));
  });

  it("Engine: a game that reaches the turn cap is a failure", () => {
    const outcome = playGame("cap", 0, 2);
    expect(outcome.failure?.reason).toBe("turn cap 2 reached");
  });
});

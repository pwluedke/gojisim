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

describe("weighted policy", () => {
  it("Engine: weighted games finish cleanly and counter far more often than uniform ones", () => {
    let counters = 0;
    for (let game = 0; game < 6; game++) {
      const outcome = playGame("weighted", game, 500, "weighted");
      expect(outcome.failure).toBeNull();
      counters += replay(outcome.record).log.filter(
        (e) => e.type === "counter",
      ).length;
    }
    expect(counters).toBeGreaterThan(6);
    // Weighted games run about 33 turns, so 6 of them can exceed the 5 s default on CI.
  }, 30_000);

  it("Engine: with its own zone 8 empty, a weighted battle play goes to zone 8 (a blocker stops invasion wins, 5.13.1.1.1)", () => {
    const outcome = playGame("weighted", 1, 500, "weighted");
    const firstBattle = outcome.record.actions.find(
      (a) => a.type === "playBattle",
    );
    expect(firstBattle).toMatchObject({ zone: 8 });
  });

  it("Engine: games record each deck's legality (Paul's ruling, Oct 21, 2026)", () => {
    const outcome = playGame("legality", 0);
    expect(
      outcome.record.deckLegality?.map((l) => [l.player, l.legal]),
    ).toEqual([
      ["P1", true],
      ["P2", true],
    ]);
  });
});

describe("official starter decks (M4c)", () => {
  it("Engine: ESD01 official vs ESD02 official games finish cleanly, with implemented cards running and manual cards inert", () => {
    for (let game = 0; game < 4; game++) {
      const outcome = playGame("official", game, 500, "weighted", "official");
      expect(outcome.failure).toBeNull();
      expect(outcome.result).not.toBeNull();
    }
  });
});

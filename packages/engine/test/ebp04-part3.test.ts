import type { Card } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import { getCounterPower, getLegalActions, type GameState } from "../src";
import {
  destroyWith,
  green,
  inStrategy,
  pass,
  strategyIds,
  useFixtures,
} from "./fixtures/ebp04";
import {
  activate,
  choose,
  godzilla,
  invade,
  invader,
  newLogTypes,
  opponentOf,
  opponentsTurn,
  self,
  settle,
  settleUntil,
  setup,
} from "./fixtures/play";
import {
  inDiscard,
  inHand,
  monster,
  onDeck,
  place,
  real,
  zoneCardIds,
} from "./fixtures/real";
import { battleCard, monsterCard, strategyCard } from "./fixtures/state";

// M12d-1: EBP04 strategy cards (docs/abilities/m12-plan.md). One test (or more) per ability,
// named with its rules.

useFixtures();

/** The ids of the cards on top of the player's zones, in zone order. */
const tops = (state: GameState, player: { id: string }) =>
  Object.values(zoneCardIds(self(state, player as never))).flat();

describe("EBP04 red strategy cards", () => {
  it("EBP04-075 5.7.3, 4.4.5.4: on the opponent's turn, at the counter phase mills 1; a monster card destroys 1 opponent battle card in your monster's column", () => {
    const run = (top: Card) => {
      const { state, me, opp } = opponentsTurn();
      monster(state, me, godzilla(3), 3);
      inStrategy(state, me, real("EBP04-075"));
      onDeck(state, me, top);
      place(state, opp, battleCard(), 3);
      return Object.keys(
        zoneCardIds(opponentOf(settleUntil(pass(state), "7.4.2"), me)),
      );
    };
    expect(run(monsterCard(1))).toEqual([]);
    expect(run(battleCard())).toEqual(["3"]);
  });

  it("EBP04-076 K1, Q18: Base stays at the start phase and is destroyed when a monster invades into zones 6-8", () => {
    const { state, me } = setup(5);
    monster(state, me, godzilla(3), 5);
    inStrategy(state, me, real("EBP04-076"));
    const after = settle(invade(state, me, invader(state, me)));
    expect(strategyIds(self(after, me))).toEqual([]);
  });

  it("EBP04-076 M1, 1.3.3: your monster can't be moved by your opponent's effects", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, godzilla(3), 4);
    inStrategy(state, me, real("EBP04-076"));
    const after = settle(
      activate(state, opp, inHand(state, opp, real("EBP04-078"))),
    );
    expect(self(after, me).monsterPosition).toBe(4);
    expect(newLogTypes(after, state)).toContain("moveProtected");
  });

  it("EBP04-077 5.10, 5.11: reveals the top 3 and takes up to 1 [mechagodzilla] battle card; Multi-purpose Fighting System-3 may be played in zone 8 instead", () => {
    const { state, me } = setup(4);
    me.hand = [];
    // Only the added card may be played, not another card in the hand.
    inHand(state, me, strategyCard({ id: 964772 }));
    for (const card of [
      real("EBP04-043"),
      monsterCard(1),
      strategyCard(),
    ].reverse())
      onDeck(state, me, card);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP04-077"))),
    );
    const mine = self(after, me);
    expect(zoneCardIds(mine)["8"]).toEqual([real("EBP04-043").id]);
    expect(mine.hand.map((c) => c.cardId)).toEqual([964772]);
    expect(mine.discard.length).toBeGreaterThanOrEqual(2);
  });

  it("EBP04-077 5.10: another [mechagodzilla] battle card goes to your hand", () => {
    const { state, me } = setup(4);
    me.hand = [];
    onDeck(state, me, battleCard({ id: 964771, traits: ["Mechagodzilla"] }));
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP04-077"))),
    );
    expect(self(after, me).hand.map((c) => c.cardId)).toEqual([964771]);
  });

  it("EBP04-078 E14, Q21: moves the opponent's monster in zones 3-5 vertically", () => {
    const { state, me, opp } = setup(5);
    opp.monsterPosition = 4;
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP04-078"))),
    );
    expect(opponentOf(after, me).monsterPosition).toBe(7);
  });

  it("EBP04-079 5.10, 5.11: reveals the top 7 and plays every [final-wars] battle card among them; the rest go to the discard pile", () => {
    const { state, me } = setup(7);
    const wars = (id: number) => battleCard({ id, traits: ["Final Wars"] });
    for (const card of [
      wars(964791),
      monsterCard(1),
      wars(964792),
      battleCard(),
    ].reverse())
      onDeck(state, me, card);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP04-079"))),
    );
    expect(tops(after, me).sort()).toEqual([964791, 964792]);
  });

  it("EBP04-080 E18, 12.6.2: evolves each of your rank 3 or lower battle cards with Evolution in zones 1-5", () => {
    const { state, me } = setup(3);
    place(state, me, real("ESD02-007"), 1);
    place(state, me, real("ESD02-007"), 2);
    onDeck(state, me, real("ESD02-010"));
    onDeck(state, me, real("ESD02-010"));
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP04-080"))),
    );
    const mine = self(after, me);
    expect(mine.zones[1][0]).toHaveLength(2);
    expect(mine.zones[2][0]).toHaveLength(2);
  });
});

describe("EBP04 blue strategy cards", () => {
  it("EBP04-081 M1: on your turn your monster can't invade", () => {
    const { state, me } = setup(3);
    inStrategy(state, me, real("EBP04-081"));
    invader(state, me);
    expect(
      getLegalActions(state, me.id).filter((a) => a.type === "invade"),
    ).toEqual([]);
  });

  it("EBP04-082 K1, 10.8.1: on your turn your non-blue battle cards next to your monster get +3,000 counter power", () => {
    const { state, me } = setup(3);
    inStrategy(state, me, real("EBP04-082"));
    const red = place(state, me, battleCard({ colors: ["Red"] }), 2);
    const blue = place(state, me, battleCard({ colors: ["Blue"] }), 4);
    const far = place(state, me, battleCard({ colors: ["Red"] }), 6);
    expect(getCounterPower(state, red)).toBe(4000);
    expect(getCounterPower(state, blue)).toBe(1000);
    expect(getCounterPower(state, far)).toBe(1000);
  });

  it("EBP04-083 5.12: destroys the opponent's battle cards in zones 6-8", () => {
    const { state, me, opp } = setup(6);
    opp.monsterPosition = 2;
    place(state, opp, battleCard(), 6);
    place(state, opp, battleCard(), 8);
    place(state, opp, battleCard({ id: 964831 }), 5);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP04-083"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "5": [964831] });
  });
});

describe("EBP04 green strategy cards", () => {
  it("EBP04-084 5.12, 4.4.5.4: destroys the opponent's battle cards in your monster's column", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 6;
    place(state, opp, battleCard(), 3);
    place(state, opp, battleCard(), 8);
    place(state, opp, battleCard({ id: 964841 }), 1);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP04-084"))),
    );
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "1": [964841] });
  });

  it("EBP04-085 T3, 7.2.3: when it goes from the strategy zone to the discard pile with 2 green battle cards in your zones, you may return it to your hand", () => {
    const { state, me } = opponentsTurn();
    inStrategy(state, me, real("EBP04-085"));
    monster(state, me, godzilla(3), 3);
    place(state, me, green(), 1);
    place(state, me, green(), 2);
    me.hand = [];
    // My next start phase sends it to the discard pile (7.2.3).
    const after = settle(pass(state));
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(
      real("EBP04-085").id,
    );
  });

  it("EBP04-085 M1, 1.3.3: on the opponent's turn, Void Ghidorah in your zones 1-5 can't be destroyed by their effects", () => {
    const { state, me, opp } = opponentsTurn();
    inStrategy(state, me, real("EBP04-085"));
    const ghidorah = place(state, me, real("EBP04-055"), 2);
    const after = destroyWith(state, opp, ghidorah.instanceId);
    expect(zoneCardIds(self(after, me))["2"]).toEqual([real("EBP04-055").id]);
    expect(newLogTypes(after, state)).toContain("destroyPrevented");
  });

  it("EBP04-086 K1, 5.11: at your counter phase plays 1 Vulture from your discard pile for every 5 green battle cards there", () => {
    const { state, me } = setup(4);
    inStrategy(state, me, real("EBP04-086"));
    for (let i = 0; i < 7; i++) inDiscard(state, me, green());
    for (let i = 0; i < 3; i++) inDiscard(state, me, real("EBP04-060"));
    const after = settleUntil(pass(state), "7.4.2");
    // 10 green battle cards (the Vultures are green too): 2 Vultures.
    const vulture = real("EBP04-060").id;
    expect(tops(after, me).filter((id) => id === vulture)).toHaveLength(2);
  });

  it("EBP04-087 5.12: destroys up to 1 red, 1 blue, 1 green and 1 white battle card in the opponent's zones 1-5", () => {
    const { state, me, opp } = setup(5);
    for (const [zone, colors] of [
      [1, ["Red"]],
      [2, ["Red"]],
      [3, ["Blue"]],
      [4, ["White"]],
    ] as const)
      place(state, opp, battleCard({ colors: [...colors] }), zone);
    place(state, opp, battleCard({ id: 964871, colors: ["Green"] }), 7);
    const after = settle(
      activate(state, me, inHand(state, me, real("EBP04-087"))),
    );
    const left = zoneCardIds(opponentOf(after, me));
    expect(Object.keys(left)).toHaveLength(2); // one red card, and the green one in zone 7
    expect(left["7"]).toEqual([964871]);
  });

  it("EBP04-088 4.9, C4: returns up to 2 non-green battle cards from your discard pile to your hand", () => {
    const { state, me } = setup(8);
    me.hand = [];
    inDiscard(state, me, green());
    inDiscard(state, me, battleCard({ id: 964881, colors: ["Red"] }));
    inDiscard(state, me, battleCard({ id: 964882, colors: ["White"] }));
    inDiscard(state, me, battleCard({ id: 964883, colors: ["Blue"] }));
    let after = activate(state, me, inHand(state, me, real("EBP04-088")));
    after = choose(after, (_, cardId) => cardId === 964881);
    after = settle(choose(after, (_, cardId) => cardId === 964883));
    expect(
      self(after, me)
        .hand.map((c) => c.cardId)
        .sort(),
    ).toEqual([964881, 964883]);
  });
});

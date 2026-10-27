import type { Card } from "@gojisim/cards";
import { getCardAbilities } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  counterPowerOf,
  type GameState,
  getLegalActions,
  type PlayerState,
} from "../src";
import { checkInvariants } from "../src/invariants";
import { inStrategy, pass } from "./fixtures/ebp04";
import {
  godzilla,
  newLogTypes,
  opponentOf,
  opponentsTurn,
  play,
  playMonster,
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

// M12g: FC01 (docs/abilities/m12-plan.md), the last set.

const ids = (cards: { cardId: number }[]) => cards.map((c) => c.cardId);

/** Cards on top of the player's deck, first card on top. */
function stackDeck(state: GameState, player: PlayerState, cards: Card[]) {
  for (const card of [...cards].reverse()) onDeck(state, player, card);
}

const fest = (overrides: Partial<Card> = {}) =>
  battleCard({ traits: ["Fest"], ...overrides });

describe("FC01-001 Godzilla (Godzilla Fest)", () => {
  it("12.5.1: Burst rank 3", () => {
    expect(getCardAbilities("FC01-001").abilities).toContainEqual({
      kind: "keyword",
      keyword: { name: "burst", rank: 3 },
    });
  });

  it("4.4.5.2, 7.4.2: +10,000 total counter power with a [fest] battle card adjacent to it", () => {
    const { state, me } = setup(4);
    monster(state, me, real("FC01-001"), 4);
    place(state, me, fest({ counterOrThreat: 1000 }), 1);
    expect(counterPowerOf(state, me)).toBe(1000);
    place(state, me, fest({ counterOrThreat: 1000 }), 5);
    expect(counterPowerOf(state, me)).toBe(2000 + 10000);
  });
});

describe("FC01-002 Gigan (Godzilla Fest)", () => {
  const start = (top: Card) => {
    const { state, me } = setup(4);
    monster(state, me, godzilla(3), 4);
    stackDeck(state, me, [top]);
    const back = inDiscard(state, me, monsterCard(2, { id: 964201 }));
    return { state, me, back };
  };

  it("4.4.5.2, 5.7.3: adjacent to your monster, mills 1; a battle card returns a monster card from your discard pile to your hand", () => {
    const { state, me, back } = start(battleCard({ id: 964202 }));
    const after = settle(
      play(state, me, inHand(state, me, real("FC01-002")), 5),
    );
    expect(ids(self(after, me).discard)).toContain(964202);
    expect(ids(self(after, me).hand)).toContain(back.cardId);
    checkInvariants(after);
  });

  it("5.7.3: a milled strategy card, or a zone that isn't adjacent, returns nothing", () => {
    const strategy = start(strategyCard({ id: 964203 }));
    let after = settle(
      play(
        strategy.state,
        strategy.me,
        inHand(strategy.state, strategy.me, real("FC01-002")),
        5,
      ),
    );
    expect(ids(self(after, strategy.me).discard)).toContain(964203);
    expect(ids(self(after, strategy.me).hand)).not.toContain(
      strategy.back.cardId,
    );

    const far = start(battleCard({ id: 964202 }));
    after = settle(
      play(far.state, far.me, inHand(far.state, far.me, real("FC01-002")), 1),
    );
    expect(ids(self(after, far.me).discard)).not.toContain(964202);
    expect(ids(self(after, far.me).hand)).not.toContain(far.back.cardId);
  });
});

describe("FC01-003 Jet Jaguar (Godzilla Fest)", () => {
  /** A [mech] battle card with an [invade-2] icon: what the search looks for. */
  const target = () =>
    battleCard({ id: 964301, traits: ["Mech"], invadeZones: 2 });

  it("10.5.4, 5.8.1: discarding a [gigan] [fest] card searches for a [mech] battle card with [invade-2], reveals it and adds it to your hand", () => {
    const { state, me } = setup(6);
    me.hand = [];
    const pay = inHand(
      state,
      me,
      fest({ id: 964302, traits: ["Gigan", "Fest"] }),
    );
    onDeck(
      state,
      me,
      battleCard({ id: 964303, traits: ["Mech"], invadeZones: 1 }),
    );
    onDeck(state, me, target());
    const before = play(state, me, inHand(state, me, real("FC01-003")), 2);
    const after = settle(before);
    expect(ids(self(after, me).discard)).toContain(pay.cardId);
    expect(ids(self(after, me).hand)).toEqual([964301]);
    expect(newLogTypes(after, before)).toContain("shuffleDeck");
    checkInvariants(after);
  });

  it("10.5.4.1: without a card with both [gigan] and [fest], nothing happens", () => {
    const { state, me } = setup(6);
    me.hand = [];
    inHand(state, me, fest({ traits: ["Gigan"] }));
    onDeck(state, me, target());
    const after = settle(
      play(state, me, inHand(state, me, real("FC01-003")), 2),
    );
    expect(ids(self(after, me).hand)).not.toContain(964301);
  });
});

describe("FC01-004 Hedorah (2021)", () => {
  it("8.2.1: played 1 rank lower for each battle card in the opponent's zones", () => {
    const { state, me, opp } = setup(4);
    // The opponent's monster in zone 5: rank 5 or lower can be played.
    opp.monsterPosition = 5;
    const hedorah = inHand(state, me, real("FC01-004"));
    const canPlay = () =>
      getLegalActions(state, me.id).some(
        (a) =>
          a.type === "playBattle" && a.cardInstanceId === hedorah.instanceId,
      );
    place(state, opp, battleCard(), 1);
    place(state, opp, battleCard(), 2);
    expect(canPlay()).toBe(false);
    place(state, opp, battleCard(), 3);
    expect(canPlay()).toBe(true);
  });
});

describe("FC01-005 Godzilla Appears at Godzilla Fest", () => {
  it("Q29, 5.10: when you play a monster card, reveal the top 5: [fest] cards to your hand, the rest to the discard pile", () => {
    const { state, me } = setup(4);
    monster(state, me, godzilla(3), 4);
    inStrategy(state, me, real("FC01-005"));
    me.hand = [];
    stackDeck(state, me, [
      fest({ id: 964501 }),
      battleCard({ id: 964502 }),
      monsterCard(1, { id: 964503, traits: ["Fest"] }),
      battleCard({ id: 964504 }),
      battleCard({ id: 964505 }),
      battleCard({ id: 964506 }),
    ]);
    const deckBefore = me.deck.length;
    const after = settle(
      playMonster(state, me, inHand(state, me, godzilla(3))),
    );
    expect(ids(self(after, me).hand).sort()).toEqual([964501, 964503]);
    expect(ids(self(after, me).discard)).toEqual(
      expect.arrayContaining([964502, 964504, 964505]),
    );
    expect(self(after, me).deck).toHaveLength(deckBefore - 5);
    expect(self(after, me).deck[0]?.cardId).toBe(964506);
    checkInvariants(after);
  });

  it("Q29: with fewer than 5 cards it reveals what is there, with no reshuffle", () => {
    const { state, me } = setup(4);
    monster(state, me, godzilla(3), 4);
    inStrategy(state, me, real("FC01-005"));
    me.hand = [];
    me.deck = [];
    stackDeck(state, me, [fest({ id: 964501 }), battleCard({ id: 964502 })]);
    inDiscard(state, me, battleCard({ id: 964507 }));
    const before = playMonster(state, me, inHand(state, me, godzilla(3)));
    const after = settle(before);
    expect(ids(self(after, me).hand)).toEqual([964501]);
    expect(self(after, me).deck).toEqual([]);
    expect(newLogTypes(after, before)).not.toContain("reshuffle");
  });

  it("7.4.1: at the beginning of your counter phase you discard your hand", () => {
    const { state, me } = setup(4);
    inStrategy(state, me, real("FC01-005"));
    me.hand = [];
    inHand(state, me, battleCard());
    inHand(state, me, strategyCard());
    const after = settleUntil(pass(state), "7.4.2");
    expect(self(after, me).hand).toEqual([]);
    checkInvariants(after);
  });
});

describe("FC01-006 King Ghidorah's Defense", () => {
  /** The opponent's turn: they activate a strategy card that destroys every battle card. */
  const destroyAll = (theirBattleCards: number) => {
    const { state, me, opp } = opponentsTurn();
    opp.monsterPosition = 8;
    inStrategy(state, me, real("FC01-006"));
    const mine = place(state, me, battleCard({ id: 964601 }), 2);
    for (let i = 0; i < theirBattleCards; i++)
      place(state, opp, battleCard(), (i + 1) as 1 | 2 | 3);
    const showdown = inHand(state, opp, real("EBP01-033"));
    const after = settle(
      applyAction(state, {
        type: "activateStrategy",
        player: opp.id,
        cardInstanceId: showdown.instanceId,
        strategyZone: 1,
      }),
    );
    return { after, me, opp, mine };
  };

  it("M1, 1.3.3: on the opponent's turn, with 2 or fewer of their battle cards, their effects can't destroy yours", () => {
    const { after, me, mine } = destroyAll(2);
    expect(zoneCardIds(self(after, me))).toEqual({ "2": [mine.cardId] });
    expect(zoneCardIds(opponentOf(after, me))).toEqual({});
  });

  it("M1: with 3 of their battle cards, yours are destroyed with theirs (protection is read before any card leaves)", () => {
    const { after, me } = destroyAll(3);
    expect(zoneCardIds(self(after, me))).toEqual({});
  });
});

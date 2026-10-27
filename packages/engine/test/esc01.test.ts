import type { Card } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  type GameState,
  getCounterPower,
  getLegalActions,
  type PlayerState,
} from "../src";
import { checkInvariants } from "../src/invariants";
import { pass } from "./fixtures/ebp04";
import {
  choose,
  godzilla,
  invade,
  invader,
  newLogTypes,
  opponentOf,
  play,
  playMonster,
  self,
  settle,
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
import {
  addCard,
  battleCard,
  logTypes,
  monsterCard,
  strategyCard,
} from "./fixtures/state";

// M12f: ESC01 (docs/abilities/m12-plan.md), with pieces built in earlier sets.

/** Cards under the player's monster, bottom first (3.2). */
function under(state: GameState, player: PlayerState, cards: Card[]) {
  player.invadingMonsterZone.unshift(
    ...cards.map((c) => addCard(state, c, player.id)),
  );
}

const ids = (cards: { cardId: number }[]) => cards.map((c) => c.cardId);

describe("ESC01-001 Godzilla (1954)", () => {
  const start = () => {
    const { state, me, opp } = setup(4);
    // The opponent's monster in zone 4: battle cards up to rank 4 can be played (8.2.1).
    opp.monsterPosition = 4;
    me.hand = [];
    const godzilla1954 = inHand(state, me, real("ESC01-001"));
    return { state, me, opp, godzilla1954 };
  };
  const playsOf = (
    state: GameState,
    me: PlayerState,
    card: { instanceId: string },
  ) =>
    getLegalActions(state, me.id).filter(
      (a) => a.type === "playBattle" && a.cardInstanceId === card.instanceId,
    );

  it("8.2.1, 10.5.4: discarding a [godzilla] card from your hand plays it with its rank reduced by 4", () => {
    const { state, me, godzilla1954 } = start();
    // Rank 8 is too high for zone 4 with no card to pay.
    expect(playsOf(state, me, godzilla1954)).toEqual([]);
    const pay = inHand(state, me, godzilla(2));
    const plays = playsOf(state, me, godzilla1954);
    expect(plays.length).toBeGreaterThan(0);
    expect(
      plays.every(
        (a) =>
          "costCardInstanceId" in a && a.costCardInstanceId === pay.instanceId,
      ),
    ).toBe(true);
    const after = settle(applyAction(state, plays[0] as never));
    const discard = after.log.find(
      (e) => e.type === "discard" && e.payload["cost"] === true,
    );
    expect(discard?.payload["cardId"]).toBe(pay.cardId);
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      real("ESC01-001").id,
    );
    checkInvariants(after);
  });

  it("8.2.1: a card without the [godzilla] trait can't pay", () => {
    const { state, me, godzilla1954 } = start();
    inHand(state, me, battleCard({ traits: ["Mothra"] }));
    expect(playsOf(state, me, godzilla1954)).toEqual([]);
  });

  it("4.4.5.4, 10.8.1: +3000 counter power in the same column as the opponent's monster", () => {
    const { state, me, opp } = setup(4);
    opp.monsterPosition = 2;
    const printed = real("ESC01-001").counterOrThreat ?? 0;
    // My zone 4 is in the same column as the opponent's zone 2; my zone 1 is not.
    const inColumn = place(state, me, real("ESC01-001"), 4);
    const outside = place(state, me, real("ESC01-001"), 1);
    expect(getCounterPower(state, inColumn)).toBe(printed + 3000);
    expect(getCounterPower(state, outside)).toBe(printed);
  });

  it("5.15: when you counter the opponent's monster, it goes to the bottom of your deck", () => {
    const { state, me, opp } = setup(3);
    opp.monsterPosition = 2;
    place(state, me, battleCard({ counterOrThreat: 99000 }), 1);
    const card = place(state, me, real("ESC01-001"), 5);
    const after = settle(pass(state));
    expect(logTypes(after)).toContain("counter");
    expect(zoneCardIds(self(after, me))["5"]).toBeUndefined();
    expect(self(after, me).deck.at(-1)?.cardId).toBe(card.cardId);
    checkInvariants(after);
  });
});

describe("ESC01-002 Godzilla (1995)", () => {
  /** A rank 5 Mothra battle card: ESD02-007's Evolution target (12.6.1). */
  const imago = () => battleCard({ id: 963901, rank: 5, traits: ["Mothra"] });

  it("12.6.2, 5.11: on enter it plays a rank 3 or lower [evolution] battle card from your discard pile and evolves it", () => {
    const { state, me } = setup(4);
    monster(state, me, godzilla(4, ["Blue"]), 4);
    const larva = inDiscard(state, me, real("ESD02-007"));
    // Too high: rank 4 or higher, or no Evolution.
    inDiscard(state, me, real("EBP03-044"));
    inDiscard(state, me, battleCard({ id: 963902, rank: 2 }));
    onDeck(state, me, imago());
    const before = playMonster(state, me, inHand(state, me, real("ESC01-002")));
    const after = settle(before);
    const stacks = Object.values(self(after, me).zones).flat();
    const evolved = stacks.find((s) =>
      s.some((c) => c.cardId === larva.cardId),
    );
    expect(evolved?.map((c) => c.cardId)).toEqual([larva.cardId, imago().id]);
    expect(newLogTypes(after, before)).toContain("evolve");
    checkInvariants(after);
  });

  it("5.8.1.2: the played card stays when its Evolution search finds nothing; with no such card nothing is played", () => {
    const { state, me } = setup(4);
    monster(state, me, godzilla(4, ["Blue"]), 4);
    const larva = inDiscard(state, me, real("ESD02-007"));
    const after = settle(
      playMonster(state, me, inHand(state, me, real("ESC01-002"))),
    );
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toContain(
      larva.cardId,
    );

    const empty = setup(4);
    monster(empty.state, empty.me, godzilla(4, ["Blue"]), 4);
    const none = settle(
      playMonster(
        empty.state,
        empty.me,
        inHand(empty.state, empty.me, real("ESC01-002")),
      ),
    );
    expect(zoneCardIds(self(none, empty.me))).toEqual({});
    checkInvariants(none);
  });
});

describe("ESC01-003 Godzilla (2016) 4th Form", () => {
  /** My turn, my monster in zone 3, optionally after an invasion this turn. */
  const start = (invaded: boolean) => {
    const { state, me, opp } = setup(3);
    monster(state, me, godzilla(3), 3);
    opp.monsterPosition = 8;
    me.hand = [];
    let current = state;
    if (invaded) current = settle(invade(current, me, invader(current, me)));
    const mine = self(current, me);
    const card = inHand(current, mine, real("ESC01-003"));
    const plan = inHand(current, mine, strategyCard());
    return { state: current, me: mine, card, plan };
  };

  it("5.13.1: in zone 8 after your monster invaded this turn, discarding a strategy card advances your monster by 1", () => {
    const { state, me, card, plan } = start(true);
    const from = me.monsterPosition;
    const after = settle(play(state, me, card, 8));
    expect(self(after, me).monsterPosition).toBe((from ?? 0) + 1);
    expect(ids(self(after, me).discard)).toContain(plan.cardId);
    checkInvariants(after);
  });

  it("10.5.4: declining the discard, outside zone 8, or without an invasion this turn, nothing happens", () => {
    const declined = start(true);
    let after = play(declined.state, declined.me, declined.card, 8);
    after = settle(choose(settle(after, 0), (id) => id === "no"));
    expect(self(after, declined.me).monsterPosition).toBe(
      declined.me.monsterPosition,
    );

    const elsewhere = start(true);
    after = settle(play(elsewhere.state, elsewhere.me, elsewhere.card, 7));
    expect(self(after, elsewhere.me).monsterPosition).toBe(
      elsewhere.me.monsterPosition,
    );

    const noInvasion = start(false);
    after = settle(play(noInvasion.state, noInvasion.me, noInvasion.card, 8));
    expect(self(after, noInvasion.me).monsterPosition).toBe(3);
    expect(ids(self(after, noInvasion.me).hand)).toContain(
      noInvasion.plan.cardId,
    );
  });
});

describe("ESC01-004 Godzilla (2023)", () => {
  it("10.8.1: +5000 counter power while your monster has 3 or more rage", () => {
    const { state, me } = setup(4);
    const card = place(state, me, real("ESC01-004"), 2);
    const printed = real("ESC01-004").counterOrThreat ?? 0;
    me.rage = 2;
    expect(getCounterPower(state, card)).toBe(printed);
    me.rage = 3;
    expect(getCounterPower(state, card)).toBe(printed + 5000);
  });

  it("10.9, 11.3: when it would be destroyed it goes to the bottom of your deck instead", () => {
    const { state, me } = setup(2);
    const card = place(state, me, real("ESC01-004"), 3);
    // My monster advances into its zone: crush and destroy (11.3).
    const after = settle(invade(state, me, invader(state, me)));
    expect(self(after, me).monsterPosition).toBe(3);
    expect(after.log.find((e) => e.type === "replace")?.payload).toMatchObject({
      replacedRule: "11.3",
    });
    expect(self(after, me).deck.at(-1)?.cardId).toBe(card.cardId);
    expect(ids(self(after, me).discard)).not.toContain(card.cardId);
    checkInvariants(after);
  });
});

describe("ESC01-005 King Ghidorah (1991)", () => {
  const start = (underCount: number, top: Card | null) => {
    const { state, me, opp } = setup(1);
    monster(state, me, real("ESC01-005"), 1);
    under(
      state,
      me,
      Array.from({ length: underCount }, () => monsterCard(1)),
    );
    if (top) onDeck(state, me, top);
    else me.deck = [];
    place(state, opp, battleCard({ id: 963951, rank: 4 }), 3);
    place(state, opp, battleCard({ id: 963952, rank: 6 }), 4);
    return { state, me, opp };
  };

  it("5.7.3, 5.12: when invading with 3 cards under it, mills 1 and destroys 1 opponent battle card of the milled card's rank or lower", () => {
    const { state, me, opp } = start(3, battleCard({ id: 963953, rank: 5 }));
    const after = settle(invade(state, me, invader(state, me)));
    expect(ids(self(after, me).discard)).toContain(963953);
    expect(zoneCardIds(opponentOf(after, me))).toEqual({ "4": [963952] });
    expect(opp.id).toBe(opponentOf(after, me).id);
    checkInvariants(after);
  });

  it("12.3: with 2 cards under it, or nothing to mill, nothing is destroyed", () => {
    const few = start(2, battleCard({ id: 963953, rank: 9 }));
    let after = settle(invade(few.state, few.me, invader(few.state, few.me)));
    expect(Object.keys(zoneCardIds(opponentOf(after, few.me)))).toEqual([
      "3",
      "4",
    ]);

    const empty = start(3, null);
    after = settle(
      invade(empty.state, empty.me, invader(empty.state, empty.me)),
    );
    expect(Object.keys(zoneCardIds(opponentOf(after, empty.me)))).toEqual([
      "3",
      "4",
    ]);
  });
});

describe("ESC01-006 Mothra (Imago) (1992)", () => {
  it("5.7, 1.3.2: on enter you may discard your whole hand; +1 rage per strategy card discarded", () => {
    const { state, me } = setup(4);
    me.hand = [];
    me.rage = 0;
    const card = inHand(state, me, real("ESC01-006"));
    inHand(state, me, strategyCard());
    inHand(state, me, strategyCard());
    inHand(state, me, battleCard());
    const before = play(state, me, card, 2);
    const after = settle(before);
    expect(self(after, me).hand).toEqual([]);
    expect(self(after, me).rage).toBe(2);
    // One change per counted card (decision 334).
    expect(
      newLogTypes(after, before).filter((t) => t === "rageChanged"),
    ).toHaveLength(2);
    checkInvariants(after);
  });

  it("10.5.2: declining keeps the hand and the rage", () => {
    const { state, me } = setup(4);
    me.hand = [];
    me.rage = 0;
    const card = inHand(state, me, real("ESC01-006"));
    inHand(state, me, strategyCard());
    let after = settle(play(state, me, card, 2), 0);
    after = settle(choose(after, (id) => id === "no"));
    expect(self(after, me).hand).toHaveLength(1);
    expect(self(after, me).rage).toBe(0);
  });
});

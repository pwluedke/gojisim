import type { Card } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import {
  getCounterPower,
  getLegalActions,
  getRank,
  type GameState,
  type PlayerState,
} from "../src";
import {
  DECK_PLAYER,
  destroyWith,
  DISCARDER,
  green,
  handOf,
  inStrategy,
  pass,
  playFixture,
  useFixtures,
} from "./fixtures/ebp04";
import {
  choose,
  godzilla,
  invade,
  invader,
  newLogTypes,
  opponentOf,
  opponentsTurn,
  play,
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

// M12d-1: EBP04 battle cards (docs/abilities/m12-plan.md). One test (or more) per ability, named
// with its rules.

useFixtures();

/** The zone (1 to 8) whose top card has `cardId`, on the player's field. */
function zoneOf(player: PlayerState, cardId: number): number | undefined {
  for (const [zone, stacks] of Object.entries(player.zones))
    if (stacks.some((s) => s.at(-1)?.cardId === cardId)) return Number(zone);
  return undefined;
}

/** A card's counter power where it now stands. */
function powerOf(state: GameState, player: PlayerState, cardId: number) {
  const zone = zoneOf(player, cardId) as keyof PlayerState["zones"];
  const top = player.zones[zone]
    .map((s) => s.at(-1))
    .find((c) => c?.cardId === cardId);
  if (!top) throw new Error(`card ${cardId} is not in a zone`);
  return getCounterPower(state, top);
}

const rank1 = () => strategyCard({ rank: 1 });

describe("EBP04 red battle cards", () => {
  it("EBP04-037 10.8.1: +3,000 counter power with a rank 1 strategy card in play", () => {
    const { state, me } = setup(3);
    const minilla = place(state, me, real("EBP04-037"), 1);
    expect(getCounterPower(state, minilla)).toBe(2000);
    inStrategy(state, me, rank1());
    expect(getCounterPower(state, minilla)).toBe(5000);
  });

  it("EBP04-038 10.8.1: +3,000 counter power with 2 other battle cards in your zones", () => {
    const { state, me } = setup(3);
    const kamacuras = place(state, me, real("EBP04-038"), 1);
    place(state, me, battleCard(), 2);
    expect(getCounterPower(state, kamacuras)).toBe(2000);
    place(state, me, battleCard(), 4);
    expect(getCounterPower(state, kamacuras)).toBe(5000);
  });

  it("EBP04-039 5.12, 5.6: on the opponent's turn, when your non-red battle card is destroyed, it moves to a zone adjacent to your monster", () => {
    const run = (colors: Card["colors"]) => {
      const { state, me, opp } = opponentsTurn();
      monster(state, me, godzilla(3), 3);
      place(state, me, real("EBP04-039"), 6);
      const target = place(state, me, battleCard({ colors }), 1);
      const zilla = real("EBP04-039").id;
      return zoneOf(
        self(destroyWith(state, opp, target.instanceId), me),
        zilla,
      );
    };
    // My monster is in zone 3: zones 2, 4 and 8 are adjacent (4.4.5.2).
    expect([2, 4, 8]).toContain(run(["Blue"]));
    expect(run(["Red"])).toBe(6);
  });

  it("EBP04-040 12.4, 12.2: in zone 6 or beyond, on enter with a [rodan] and a [king-caesar] battle card in your zones, +3 rage", () => {
    const run = (position: 5 | 6) => {
      const { state, me } = setup(position);
      me.rage = 0;
      place(state, me, battleCard({ traits: ["Rodan"] }), 2);
      place(state, me, battleCard({ traits: ["King Caesar"] }), 4);
      const after = settle(
        play(state, me, inHand(state, me, real("EBP04-040")), 1),
      );
      return self(after, me).rage;
    };
    expect(run(6)).toBe(3);
    expect(run(5)).toBe(0);
  });

  it("EBP04-042 12.2: on enter with 3 rank 1 strategy cards in your discard pile, the opponent loses 1 rage", () => {
    const { state, me, opp } = setup(3);
    for (let i = 0; i < 3; i++) inDiscard(state, me, rank1());
    opp.rage = 2;
    const after = settle(
      play(state, me, inHand(state, me, real("EBP04-042")), 1),
    );
    expect(opponentOf(after, me).rage).toBe(1);
  });

  it("EBP04-043 E4, 7.4.1: at your counter phase you may place an [invade-2] card from your strategy zone under it; with a card under it, +10,000 counter power", () => {
    const { state, me } = setup(3);
    place(state, me, real("EBP04-043"), 1);
    inStrategy(state, me, strategyCard({ invadeZones: 2 }));
    const after = settleUntil(pass(state), "7.4.2");
    const mine = self(after, me);
    expect(mine.strategyZones.flat()).toEqual([]);
    expect(mine.zones[1][0]).toHaveLength(2);
    expect(powerOf(after, mine, real("EBP04-043").id)).toBe(17000);
  });

  it("EBP04-044 M2, 12.4, 8.2.1: in zone 4 or beyond it is played 2 ranks lower per non-red battle card in your zones; afterwards it is rank 8", () => {
    const { state, me, opp } = setup(4);
    opp.monsterPosition = 4;
    const hedorah = inHand(state, me, real("EBP04-044"));
    place(state, me, battleCard({ colors: ["Blue"] }), 1);
    const plays = () =>
      getLegalActions(state, me.id).filter(
        (a) =>
          a.type === "playBattle" && a.cardInstanceId === hedorah.instanceId,
      );
    expect(plays()).toEqual([]); // rank 6 > 4
    place(state, me, battleCard({ colors: ["White"] }), 2);
    expect(plays().length).toBeGreaterThan(0); // rank 4
    const after = settle(play(state, me, hedorah, 3));
    const card = self(after, me).zones[3][0]?.at(-1);
    expect(card && getRank(after, card)).toBe(8);
  });
});

describe("EBP04 blue battle cards", () => {
  it("EBP04-046 T3, 5.11: when your opponent's effect discards it from your hand, you may play it; +3,000 counter power in zone 6 or beyond", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, godzilla(3), 6);
    me.hand = [];
    inHand(state, me, real("EBP04-046"));
    const after = playFixture(state, opp, DISCARDER);
    const rodan = real("EBP04-046").id;
    const mine = self(after, me);
    expect(zoneOf(mine, rodan)).toBeDefined();
    expect(powerOf(after, mine, rodan)).toBe(5000);
  });

  it("EBP04-047 C4: counter power X is 3,000 per color among your other battle cards", () => {
    const { state, me } = setup(3);
    const x = place(state, me, real("EBP04-047"), 1);
    place(state, me, battleCard({ colors: ["Red", "White"] }), 2);
    expect(getCounterPower(state, x)).toBe(6000);
  });

  it("EBP04-048 M1, 1.3.3: your strategy cards can't be destroyed by your opponent's effects", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, godzilla(3), 6);
    place(state, me, real("EBP04-048"), 1);
    inStrategy(state, me, strategyCard({ id: 964481 }));
    const after = settle(
      play(state, opp, inHand(state, opp, real("EBP04-074")), 1),
    );
    expect(
      self(after, me)
        .strategyZones.flat()
        .map((p) => p.card.cardId),
    ).toEqual([964481]);
    expect(newLogTypes(after, state)).toContain("destroyPrevented");
  });

  it("EBP04-049 5.7.3: at your counter phase with a rank 8 battle card, mills 1: blue destroys 1 of your rank 8 or higher battle cards, otherwise the opponent loses 2 rage", () => {
    const run = (top: Card) => {
      const { state, me, opp } = setup(3);
      place(state, me, real("EBP04-049"), 1);
      place(state, me, battleCard({ rank: 8 }), 2);
      onDeck(state, me, top);
      opp.rage = 3;
      const after = settleUntil(pass(state), "7.4.2");
      return {
        rage: opponentOf(after, me).rage,
        zones: Object.keys(zoneCardIds(self(after, me))),
      };
    };
    expect(run(battleCard({ colors: ["Blue"] }))).toEqual({
      rage: 3,
      zones: ["1"],
    });
    expect(run(battleCard({ colors: ["Red"] }))).toEqual({
      rage: 1,
      zones: ["1", "2"],
    });
  });

  it("EBP04-050 T6, E7: when your monster invades with it in zone 8, choose: draw 1 then discard 1, or discard 1 to lower the opponent's rage by 1", () => {
    const { state, me, opp } = setup(3);
    place(state, me, real("EBP04-050"), 8);
    me.hand = [];
    const paid = invader(state, me);
    inHand(state, me, battleCard());
    opp.rage = 2;
    let after = invade(state, me, paid);
    after = choose(settleUntilChoice(after), (id) => id === "1");
    after = settle(after);
    expect(opponentOf(after, me).rage).toBe(1);
    expect(self(after, me).hand).toEqual([]);
  });

  it("EBP04-050 8.6, Q43 (provisional): an invasion that advances 2 zones triggers it once", () => {
    const { state, me } = setup(3);
    place(state, me, real("EBP04-050"), 8);
    const paid = invader(state, me, 2);
    const after = settle(invade(state, me, paid));
    expect(self(after, me).monsterPosition).toBe(5);
    expect(
      after.log.filter(
        (e) =>
          e.type === "resolveAbility" &&
          e.payload["abilityId"] === "EBP04-050#invades-choose",
      ),
    ).toHaveLength(1);
  });

  it("EBP04-051 12.2, 5.13.2: on enter in the column of the opponent's monster, retreats it by 1 if its threat is 30,000 or lower", () => {
    const { state, me, opp } = setup(3);
    monster(state, opp, monsterCard(2), 6);
    // My zone 1 is in the column of the opponent's zones 5 and 6 (4.4.5.4).
    const after = settle(
      play(state, me, inHand(state, me, real("EBP04-051")), 1),
    );
    expect(opponentOf(after, me).monsterPosition).toBe(5);
  });

  it("EBP04-052 T3: when your opponent's effect discards it, with their monster in zones 4-8, you may play it", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, godzilla(3), 6);
    me.hand = [];
    inHand(state, me, real("EBP04-052"));
    const after = playFixture(state, opp, DISCARDER);
    expect(zoneOf(self(after, me), real("EBP04-052").id)).toBeDefined();
  });

  it("EBP04-052 T3: in zone 8, +2 rage once per opponent's effect that makes you discard, however many cards", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, godzilla(3), 3);
    place(state, me, real("EBP04-052"), 8);
    handOf(state, me, 3);
    me.rage = 0;
    const after = playFixture(state, opp, DISCARDER);
    expect(self(after, me).rage).toBe(2);
  });

  it("EBP04-053 5.6: on enter you may swap 2 of your battle cards", () => {
    const { state, me } = setup(3);
    place(state, me, battleCard({ id: 964531 }), 1);
    place(state, me, battleCard({ id: 964532 }), 2);
    const after = settle(
      play(state, me, inHand(state, me, real("EBP04-053")), 4),
    );
    expect(newLogTypes(after, state)).toContain("swap");
  });

  it("EBP04-054 10.8.1: +5,000 counter power per strategy card you have in play, -5,000 per opponent strategy card", () => {
    const { state, me, opp } = setup(3);
    const destoroyah = place(state, me, real("EBP04-054"), 1);
    inStrategy(state, me, strategyCard());
    inStrategy(state, me, strategyCard(), 1);
    inStrategy(state, opp, strategyCard());
    expect(getCounterPower(state, destoroyah)).toBe(15000);
  });
});

describe("EBP04 green battle cards", () => {
  it("EBP04-055 E7, C1: on enter you may destroy 4 of your other green battle cards; if you don't, it is destroyed", () => {
    const run = (others: number) => {
      const { state, me } = setup(3);
      for (let i = 0; i < others; i++)
        place(state, me, green(), [1, 2, 4, 5, 6][i] as 1);
      const after = settle(
        play(state, me, inHand(state, me, real("EBP04-055")), 7),
      );
      return zoneCardIds(self(after, me));
    };
    expect(run(4)).toEqual({ "7": [real("EBP04-055").id] });
    expect(Object.keys(run(3))).toEqual(["1", "2", "4"]);
  });

  it("EBP04-056 M1, 8.6: in the column of the opponent's monster with them at 0 rage, they can't invade", () => {
    const { state, me, opp } = opponentsTurn();
    // The opponent's monster is in zone 5: my zone 1 is in its column (4.4.5.4).
    place(state, me, real("EBP04-056"), 1);
    const invades = () =>
      getLegalActions(state, opp.id).filter((a) => a.type === "invade");
    opp.rage = 0;
    expect(invades()).toEqual([]);
    opp.rage = 1;
    expect(invades().length).toBeGreaterThan(0);
  });

  it("EBP04-057 C4: +3,000 counter power with a non-green battle card in your zones", () => {
    const { state, me } = setup(3);
    const caesar = place(state, me, real("EBP04-057"), 1);
    place(state, me, green(), 2);
    expect(getCounterPower(state, caesar)).toBe(2000);
    place(state, me, battleCard({ colors: ["White"] }), 4);
    expect(getCounterPower(state, caesar)).toBe(5000);
  });

  it("EBP04-058 12.4, 4.4.5.2: in zone 4 or beyond, +3,000 counter power next to your monster", () => {
    const { state, me } = setup(4);
    const servum = place(state, me, real("EBP04-058"), 5);
    expect(getCounterPower(state, servum)).toBe(5000);
    me.monsterPosition = 3; // awakening closed; zone 5 isn't adjacent to 3 either
    expect(getCounterPower(state, servum)).toBe(2000);
  });

  it("EBP04-059 12.7, T2: Revenge with 5 green battle cards in your discard pile returns a [rodan] battle card (itself, too) to your hand", () => {
    const { state, me, opp } = opponentsTurn();
    const rodan = place(state, me, real("EBP04-059"), 1);
    for (let i = 0; i < 4; i++) inDiscard(state, me, green());
    me.hand = [];
    const after = destroyWith(state, opp, rodan.instanceId);
    expect(self(after, me).hand.map((c) => c.cardId)).toEqual([
      real("EBP04-059").id,
    ]);
  });

  it("EBP04-060 10.8.1: +3,000 counter power with Mechagodzilla City in play", () => {
    const { state, me } = setup(3);
    const vulture = place(state, me, real("EBP04-060"), 1);
    expect(getCounterPower(state, vulture)).toBe(3000);
    inStrategy(state, me, real("EBP04-086"));
    expect(getCounterPower(state, vulture)).toBe(6000);
  });

  it("EBP04-061 5.8: on enter with 4 other green battle cards, searches for a green card and sends it to the discard pile", () => {
    const { state, me } = setup(3);
    for (const zone of [1, 2, 4, 5] as const) place(state, me, green(), zone);
    onDeck(state, me, strategyCard({ id: 964611, colors: ["Green"] }));
    const after = settle(
      play(state, me, inHand(state, me, real("EBP04-061")), 6),
    );
    const mine = self(after, me);
    expect(mine.discard.map((c) => c.cardId)).toContain(964611);
    expect(mine.deck.map((c) => c.cardId)).not.toContain(964611);
  });

  it("EBP04-062 T2, Q38: Revenge with 10 green battle cards in your discard pile, +1 rage per opponent battle card in your monster's column", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, godzilla(3), 3);
    const anguirus = place(state, me, real("EBP04-062"), 1);
    for (let i = 0; i < 9; i++) inDiscard(state, me, green());
    place(state, opp, battleCard(), 3);
    place(state, opp, battleCard(), 8);
    me.rage = 0;
    const after = destroyWith(state, opp, anguirus.instanceId);
    expect(self(after, me).rage).toBe(2);
  });

  it("EBP04-063 T2: Revenge returns a Godzilla Earth battle card from your discard pile to your hand", () => {
    const { state, me, opp } = opponentsTurn();
    const filius = place(state, me, real("EBP04-063"), 1);
    inDiscard(state, me, real("EBP04-065"));
    me.hand = [];
    const after = destroyWith(state, opp, filius.instanceId);
    expect(self(after, me).hand.map((c) => c.cardId)).toEqual([
      real("EBP04-065").id,
    ]);
  });

  it("EBP04-064 10.5.4: at your counter phase with 10 green battle cards in your discard pile, you may destroy it to lower the opponent's rage by 3", () => {
    const { state, me, opp } = setup(3);
    place(state, me, real("EBP04-064"), 1);
    for (let i = 0; i < 10; i++) inDiscard(state, me, green());
    opp.rage = 4;
    const after = settleUntil(pass(state), "7.4.2");
    expect(opponentOf(after, me).rage).toBe(1);
    expect(zoneCardIds(self(after, me))).toEqual({});
  });

  it("EBP04-065 4.4.5.4: +3,000 counter power in the column of the opponent's monster", () => {
    const { state, me, opp } = setup(3);
    const earth = place(state, me, real("EBP04-065"), 3);
    expect(getCounterPower(state, earth)).toBe(8000); // the opponent's zone 8
    opp.monsterPosition = 6;
    expect(getCounterPower(state, earth)).toBe(5000);
  });
});

describe("EBP04 white battle cards", () => {
  it.each([
    ["EBP04-069", "Blue", 2000],
    ["EBP04-070", "Green", 3000],
    ["EBP04-071", "Red", 4000],
  ] as const)(
    "%s 12.4, 4.4.5.4: in zone 4 or beyond, +5,000 counter power in the column of the opponent's %s monster",
    (number, color, printed) => {
      const { state, me, opp } = setup(4);
      monster(state, opp, monsterCard(2, { colors: [color] }), 5);
      const card = place(state, me, real(number), 1);
      expect(getCounterPower(state, card)).toBe(printed + 5000);
      monster(state, opp, monsterCard(2, { colors: ["White"] }), 5);
      expect(getCounterPower(state, card)).toBe(printed);
    },
  );

  it("EBP04-072 T7, 5.8: on the opponent's turn, when they play a battle card from their deck, in zone 5 you may search your deck for a card", () => {
    const { state, me, opp } = opponentsTurn();
    monster(state, me, godzilla(3), 3);
    place(state, me, real("EBP04-072"), 5);
    me.hand = [];
    onDeck(state, me, strategyCard({ id: 964721 }));
    onDeck(state, opp, battleCard());
    const after = playFixture(state, opp, DECK_PLAYER);
    expect(self(after, me).hand.map((c) => c.cardId)).toHaveLength(1);
  });

  it("EBP04-074 12.2: on enter destroys 1 of the opponent's strategy cards", () => {
    const { state, me, opp } = setup(6);
    inStrategy(state, opp, strategyCard());
    const after = settle(
      play(state, me, inHand(state, me, real("EBP04-074")), 1),
    );
    expect(opponentOf(after, me).strategyZones.flat()).toEqual([]);
  });
});

/** Runs on until a choice is open (an ability's own question), answering nothing. */
function settleUntilChoice(state: GameState): GameState {
  return state.pendingChoice ? state : settle(state, 0);
}

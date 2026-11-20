import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  type GameState,
  getLegalActions,
  type PlayerSetup,
  type PlayerState,
  startGame,
  type ZoneNumber,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import {
  CRYSTALS,
  isSpaceGDeck,
  SPACEG_FOUR,
  SPACEG_ONE,
  SPACEG_THREE,
  GOD_OF_DESTRUCTION,
  type SpaceGOptions,
  spacegCostDead,
  spacegKeepGodDead,
  spacegVerdict,
} from "./spacegPlan";
import { cardRulesDead } from "./cardRules";
import type { Decklist } from "./types";

/**
 * The SpaceG plan (#408), on made-up positions: a starter game with P1's monster set to a
 * SpaceGodzilla and P1's hand and zones set by hand.
 */ function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}
const real = (number: string): Card =>
  getAllCards().find(
    (c) => c.cardNumber === number && c.parentId === null,
  ) as Card;

const KING_1991 = "EBP02-048";

/** A SpaceG list, as the plan recognizes one: its SpaceGodzilla monster deck. */
const SPACEG = {
  monsterDeck: [SPACEG_ONE, "EBP02-053", SPACEG_THREE, SPACEG_FOUR].map(real),
  mainDeck: [SPACEG_THREE, KING_1991].map(real),
} as unknown as Decklist;

let nextId = 970000;
function add(state: GameState, card: Card, owner: string): CardInstance {
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `t${nextId++}`, cardId: card.id, owner };
}

/** P1's main phase on turn 6: P1's monster (`top`) in `at`, P2's in `oppAt`, P1's hand. */
function position(
  top: string,
  hand: string[],
  at: ZoneNumber,
  oppAt: ZoneNumber,
) {
  const decks: [PlayerSetup, PlayerSetup] = [
    { id: "P1", ...official("esd02-starter.txt") },
    { id: "P2", ...official("esd01-starter.txt") },
  ];
  let state = advanceToDecision(startGame({ seed: "spaceg", decks }));
  while (state.turnPlayer !== "P1" || state.pendingChoice) {
    const decider = state.pendingChoice?.player ?? state.turnPlayer;
    const choice = state.pendingChoice;
    state = advanceToDecision(
      applyAction(
        state,
        choice
          ? {
              type: "choose",
              player: decider,
              choiceId: choice.id,
              optionId: choice.options[0]!.id,
            }
          : { type: "pass", player: decider },
      ),
    );
  }
  const [p1, p2] = state.players as [PlayerState, PlayerState];
  state.turn = 6;
  p1.invadingMonsterZone = [add(state, real(top), "P1")];
  p1.monsterPosition = at;
  p1.hand = hand.map((n) => add(state, real(n), "P1"));
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    p1.zones[z] = [];
    p2.zones[z] = [];
  }
  for (const zone of p1.strategyZones) zone.length = 0;
  p2.monsterPosition = oppAt;
  return { state, p1, p2 };
}

const verdict = (state: GameState, options?: SpaceGOptions) => {
  const legal = getLegalActions(state, "P1");
  return { legal, ...spacegVerdict(state, legal, "P1", SPACEG, options) };
};
const of = (legal: Action[], t: Action["type"]) =>
  legal.filter((a) => a.type === t);

describe("the SpaceG plan (#408)", () => {
  it("recognizes a SpaceG list, and only that", () => {
    expect(isSpaceGDeck(SPACEG)).toBe(true);
    expect(
      isSpaceGDeck({ ...SPACEG, monsterDeck: [real(SPACEG_ONE)] } as Decklist),
    ).toBe(false);
  });

  it("rule 1: at rank 1 (its [invading] makes Crystals) no passing while an invasion can be made", () => {
    const { state } = position(SPACEG_ONE, [KING_1991, KING_1991], 3, 2);
    const v = verdict(state);
    expect(of(v.legal, "invade").length).toBeGreaterThan(0);
    for (const a of of(v.legal, "invade")) expect(v.against.has(a)).toBe(false);
    for (const a of of(v.legal, "pass")) expect(v.against.has(a)).toBe(true);
    // `spacegInvade: false` (the paired check's control).
    const off = verdict(state, { invade: false });
    for (const a of of(off.legal, "pass"))
      expect(off.against.has(a)).toBe(false);
  });

  it("rule 2: at rank 3 with Crystals and a rank 5 or lower battle card of theirs, rage before passing (each rage destroys one per Crystals)", () => {
    const judge = (crystals: boolean, rage = true) => {
      const { state, p1, p2 } = position(SPACEG_THREE, [KING_1991], 3, 2);
      if (crystals) p1.zones[1] = [[add(state, real(CRYSTALS), "P1")]];
      p2.zones[2] = [[add(state, real("ESD01-008"), "P2")]];
      const v = verdict(state, { invade: false, cover: false, rage });
      expect(of(v.legal, "gainRage").length).toBeGreaterThan(0);
      return of(v.legal, "pass").map((a) => v.against.has(a));
    };
    for (const d of judge(true)) expect(d).toBe(true);
    // No Crystals: the rage destroys nothing.
    for (const d of judge(false)) expect(d).toBe(false);
    for (const d of judge(true, false)) expect(d).toBe(false);
  });

  it("rule 3: a rank 3 in hand covers the rank 3 in play before passing, but after this turn's invasion (the addendum)", () => {
    const { state, p1 } = position(
      SPACEG_THREE,
      [SPACEG_THREE, KING_1991],
      3,
      2,
    );
    const v = verdict(state, { invade: false, rage: false });
    const covers = of(v.legal, "playMonster").filter(
      (a) =>
        "cardInstanceId" in a &&
        state.cards[
          p1.hand.find((h) => h.instanceId === a.cardInstanceId)!.cardId
        ]?.deckCardNumber === SPACEG_THREE,
    );
    expect(covers.length).toBeGreaterThan(0);
    for (const a of of(v.legal, "pass")) expect(v.against.has(a)).toBe(true);
    // The invasion can still be made: the cover waits for it.
    expect(of(v.legal, "invade").length).toBeGreaterThan(0);
    for (const a of covers) expect(v.against.has(a)).toBe(true);
    for (const a of of(v.legal, "invade")) expect(v.rescued.has(a)).toBe(true);
    // `spacegCover: false` (the control).
    const off = verdict(state, { invade: false, rage: false, cover: false });
    for (const a of covers) expect(off.against.has(a)).toBe(false);
  });
  it("rule 4: the turn ends in zone 7 by default (an invasion that ends it in zone 8 waits) unless SpaceG survives their next counter there", () => {
    const judge = (theirCounter: boolean, zone = true) => {
      // A King (icon 2) pays a 2-zone invasion, a King Ghidorah (1991) monster card a 1-zone one.
      const { state, p1, p2 } = position(
        "EBP02-053",
        ["EBP01-075", KING_1991],
        5,
        5,
      );
      if (theirCounter)
        for (const z of [1, 2, 3, 4] as const)
          p2.zones[z] = [[add(state, real("EBP01-075"), "P2")]];
      const v = verdict(state, {
        invade: false,
        rage: false,
        cover: false,
        zone,
      });
      const icon = (a: Action) =>
        "cardInstanceId" in a
          ? state.cards[
              p1.hand.find((h) => h.instanceId === a.cardInstanceId)?.cardId ??
                -1
            ]?.invadeZones
          : undefined;
      const invades = of(v.legal, "invade");
      return {
        two: invades.filter((a) => icon(a) === 2).map((a) => v.against.has(a)),
        one: invades.filter((a) => icon(a) === 1).map((a) => v.against.has(a)),
      };
    };
    const strong = judge(true);
    expect(strong.two.length).toBeGreaterThan(0);
    expect(strong.one.length).toBeGreaterThan(0);
    // Their counter reaches: the 2-zone invasion (zone 8 at the end of the turn) waits.
    for (const d of strong.two) expect(d).toBe(true);
    for (const d of strong.one) expect(d).toBe(false);
    // Nothing of theirs reaches SpaceG's threat: into zone 8 on purpose.
    for (const d of judge(false).two) expect(d).toBe(false);
    // `spacegZone: false` (the control).
    for (const d of judge(true, false).two) expect(d).toBe(false);
  });
});

describe("the SpaceG plan's rule 5: God of Destruction's Counterattack stays out of costs (Nov 18 decision)", () => {
  it("with a SpaceG list it isn't paid for an invasion that doesn't win, nor discarded for rage; other cards are", () => {
    const { state, p1 } = position(
      SPACEG_ONE,
      [GOD_OF_DESTRUCTION, "EBP01-075"],
      2,
      2,
    );
    const legal = getLegalActions(state, "P1");
    const god = (a: Action) =>
      "cardInstanceId" in a &&
      state.cards[
        p1.hand.find((h) => h.instanceId === a.cardInstanceId)?.cardId ?? -1
      ]?.deckCardNumber === GOD_OF_DESTRUCTION;
    const dead = spacegKeepGodDead(state, legal, "P1", SPACEG);
    const godCosts = legal.filter(
      (a) => (a.type === "invade" || a.type === "gainRage") && god(a),
    );
    expect(godCosts.length).toBeGreaterThan(0);
    for (const a of godCosts) expect(dead).toContain(a);
    // The other card can still pay.
    expect(
      dead.some(
        (a) => (a.type === "invade" || a.type === "gainRage") && !god(a),
      ),
    ).toBe(false);
    // Not a SpaceG list: nothing.
    expect(spacegKeepGodDead(state, legal, "P1", undefined)).toEqual([]);
  });

  it("an invasion paid with it that wins the game now stays", () => {
    const { state, p1, p2 } = position(SPACEG_ONE, [GOD_OF_DESTRUCTION], 8, 2);
    p2.zones[8] = [];
    const legal = getLegalActions(state, "P1");
    const wins = legal.filter((a) => a.type === "invade");
    expect(wins.length).toBeGreaterThan(0);
    const dead = spacegKeepGodDead(state, legal, "P1", SPACEG);
    for (const a of wins) expect(dead).not.toContain(a);
    expect(p1.monsterPosition).toBe(8);
  });
});

describe("#497: SpaceG costs paid with monster cards first (Nov 19 decision)", () => {
  it("rule 6: an invasion isn't paid with GAM EBP01-073 while a monster card with the same icons can pay it", () => {
    const { state, p1 } = position(
      SPACEG_ONE,
      ["EBP01-073", "EBP02-056"],
      2,
      2,
    );
    const legal = getLegalActions(state, "P1");
    const paidWith = (n: string) =>
      legal.find(
        (a) =>
          a.type === "invade" &&
          state.cards[
            p1.hand.find((h) => h.instanceId === a.cardInstanceId)?.cardId ?? -1
          ]?.deckCardNumber === n,
      ) as Action;
    const { invasions } = spacegCostDead(state, legal, "P1", SPACEG);
    expect(invasions).toContain(paidWith("EBP01-073"));
    expect(invasions).not.toContain(paidWith("EBP02-056"));
    // With its switch off, or no monster card with the same icons, GAM may pay.
    expect(
      spacegCostDead(state, legal, "P1", SPACEG, { monsterCost: false })
        .invasions,
    ).toEqual([]);
    const alone = position(SPACEG_ONE, ["EBP01-073", "EBP02-045"], 2, 2);
    const alegal = getLegalActions(alone.state, "P1");
    expect(spacegCostDead(alone.state, alegal, "P1", SPACEG).invasions).toEqual(
      [],
    );
  });

  it("rule 7: the Flying Form's Crystal discard takes a monster card, never God of Destruction", () => {
    const { state, p1 } = position(
      SPACEG_ONE,
      ["EBP02-056", GOD_OF_DESTRUCTION, "EBP02-045", "EBP02-068"],
      2,
      2,
    );
    // Invade, paid with the rank 4 SpaceGodzilla; accept the Crystal cost when asked.
    let s = advanceToDecision(
      applyAction(
        state,
        getLegalActions(state, "P1").find(
          (a) =>
            a.type === "invade" &&
            state.cards[
              p1.hand.find((h) => h.instanceId === a.cardInstanceId)?.cardId ??
                -1
            ]?.deckCardNumber === "EBP02-056",
        ) as Action,
      ),
    );
    for (let i = 0; i < 4 && s.pendingChoice?.player === "P1"; i++) {
      const yes = getLegalActions(s, "P1").find(
        (a) => a.type === "choose" && a.optionId === "yes",
      );
      if (!yes) break;
      s = advanceToDecision(applyAction(s, yes));
    }
    expect(s.pendingChoice?.player).toBe("P1");
    const legal = getLegalActions(s, "P1");
    const me = s.players.find((p) => p.id === "P1") as PlayerState;
    const number = (a: Action) =>
      a.type === "choose"
        ? s.cards[
            me.hand.find((h) => h.instanceId === a.optionId)?.cardId ?? -1
          ]?.deckCardNumber
        : undefined;
    const { crystals } = spacegCostDead(s, legal, "P1", SPACEG);
    const picks = legal.filter((a) => number(a) !== undefined);
    expect(picks.length).toBeGreaterThan(1);
    for (const a of picks)
      expect(crystals.includes(a)).toBe(number(a) !== "EBP02-045");
  });
});

describe("#497 fix 3: card rule 14's turn 1-2 rage hold is off for a SpaceG list", () => {
  it("a SpaceG list may discard a monster card for rage on turn 1; another list waits", () => {
    const { state } = position(SPACEG_ONE, ["EBP02-045"], 2, 2);
    state.turn = 1;
    const legal = getLegalActions(state, "P1");
    const rage = legal.filter((a) => a.type === "gainRage");
    expect(rage.length).toBeGreaterThan(0);
    const dead = (own: Decklist | undefined, on = true) =>
      cardRulesDead(state, legal, "P1", own, {
        targetAll: false,
        spacegEarlyRage: on,
      });
    for (const a of rage) {
      expect(dead(SPACEG).has(a)).toBe(false);
      expect(dead(SPACEG, false).has(a)).toBe(true);
      expect(dead(undefined).has(a)).toBe(true);
    }
  });
});

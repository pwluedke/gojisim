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
import { ENTANGLING_FEAR } from "./mxPlan";
import { counters } from "./rules";
import {
  isTanglerDeck,
  type TanglerOptions,
  tanglerVerdict,
} from "./tanglerPlan";
import type { Decklist } from "./types";

/**
 * BFW182's Tangler plan (#403) and Ian's #369, on made-up positions: a starter game with P1's
 * monster set to Godzilla (2003) EPR-020 (it lowers the opponent's rage when a battle card is
 * discarded) and P1's hand and zones set by hand.
 */
function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}
const real = (number: string): Card =>
  getAllCards().find(
    (c) => c.cardNumber === number && c.parentId === null,
  ) as Card;

const EGG = "EBP01-044";
const ORGA = "EBP01-047";
const IMAGO = "ESD02-010";
const PERFECT_FORM = "EBP02-037";
const BOND = "EBP04-080";

/** A Tangler list, as the plan recognizes one: its rage-lowering monsters and Entangling Fear. */
const TANGLER = {
  monsterDeck: ["EBP03-014", "EBP03-015", "EPR-020", "EBP03-017"].map(real),
  mainDeck: [ENTANGLING_FEAR, EGG, ORGA, IMAGO, PERFECT_FORM, BOND].map(real),
} as unknown as Decklist;

let nextId = 970000;
function add(state: GameState, card: Card, owner: string): CardInstance {
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `t${nextId++}`, cardId: card.id, owner };
}

/** P1's main phase on turn 6: P1's monster (EPR-020) in `at`, P2's in `oppAt`, P1's hand. */
function position(hand: string[], at: ZoneNumber, oppAt: ZoneNumber) {
  const decks: [PlayerSetup, PlayerSetup] = [
    { id: "P1", ...official("esd02-starter.txt") },
    { id: "P2", ...official("esd01-starter.txt") },
  ];
  let state = advanceToDecision(startGame({ seed: "tangler", decks }));
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
  p1.invadingMonsterZone = ["EBP03-014", "EBP03-015", "EPR-020"].map((n) =>
    add(state, real(n), "P1"),
  );
  p1.monsterPosition = at;
  p1.hand = hand.map((n) => add(state, real(n), "P1"));
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    p1.zones[z] = [];
    p2.zones[z] = [];
  }
  for (const zone of p1.strategyZones) zone.length = 0;
  p2.monsterPosition = oppAt;
  p2.rage = 2;
  return { state, p1, p2 };
}

const ofCard = (state: GameState, p1: PlayerState, a: Action) =>
  "cardInstanceId" in a
    ? state.cards[
        p1.hand.find((c) => c.instanceId === a.cardInstanceId)?.cardId ?? -1
      ]?.deckCardNumber
    : undefined;

const verdict = (state: GameState, options?: TanglerOptions) => {
  const legal = getLegalActions(state, "P1");
  return { legal, ...tanglerVerdict(state, legal, "P1", TANGLER, options) };
};

describe("the Tangler plan (#403)", () => {
  it("recognizes a Tangler list, and only that", () => {
    expect(isTanglerDeck(TANGLER)).toBe(true);
    expect(
      isTanglerDeck({ ...TANGLER, mainDeck: [real(EGG)] } as Decklist),
    ).toBe(false);
  });

  it("rule 1, #369 (Ian's record cededac5 move 67): Entangling Fear every turn it can be played, none in force: no passing before it", () => {
    const { state, p1 } = position([ENTANGLING_FEAR, PERFECT_FORM], 3, 2);
    const v = verdict(state);
    const fear = v.legal.filter(
      (a) =>
        a.type === "activateStrategy" &&
        ofCard(state, p1, a) === ENTANGLING_FEAR,
    );
    expect(fear.length).toBeGreaterThan(0);
    for (const a of fear) expect(v.against.has(a)).toBe(false);
    for (const a of v.legal)
      if (a.type === "pass") expect(v.against.has(a)).toBe(true);
    // `tanglerFear: false` (the paired check's control): passing is fine.
    const off = verdict(state, { fear: false });
    for (const a of off.legal)
      if (a.type === "pass") expect(off.against.has(a)).toBe(false);
  });

  it("rule 1: spare Entangling Fears are kept: none pays for an invasion while fewer than 3 are in hand", () => {
    const fearPays = (fears: number) => {
      const { state, p1 } = position(
        Array<string>(fears).fill(ENTANGLING_FEAR),
        3,
        2,
      );
      const v = verdict(state);
      const pays = v.legal.filter(
        (a) => a.type === "invade" && ofCard(state, p1, a) === ENTANGLING_FEAR,
      );
      expect(pays.length).toBeGreaterThan(0);
      return pays.map((a) => v.against.has(a));
    };
    for (const d of fearPays(2)) expect(d).toBe(true);
    for (const d of fearPays(3)) expect(d).toBe(false);
  });

  it("rule 1: the low evolution cards come out early: no passing while one can be played", () => {
    const { state, p1 } = position([EGG], 2, 2);
    const v = verdict(state, { fear: false, discard: false });
    const egg = v.legal.filter(
      (a) => a.type === "playBattle" && ofCard(state, p1, a) === EGG,
    );
    expect(egg.length).toBeGreaterThan(0);
    for (const a of egg) expect(v.against.has(a)).toBe(false);
    for (const a of v.legal)
      if (a.type === "pass") expect(v.against.has(a)).toBe(true);
    const off = verdict(state, { fear: false, discard: false, build: false });
    for (const a of off.legal)
      if (a.type === "pass") expect(off.against.has(a)).toBe(false);
  });

  it('rule 3 (3.4.5) at a "you may discard a battle card" (10.5.4, Godzilla (2003) EBP03-017\'s enter): yes while a battle card worth less than 5000 on the board is in hand; at their rage 0 (3.4.4), no preference', () => {
    const prompt = (rage: number, hand: string[], discard = true) => {
      const { state, p1, p2 } = position(hand, 2, 2);
      p2.rage = rage;
      const source = add(state, real("EBP03-017"), "P1");
      p1.invadingMonsterZone.push(source);
      state.pendingChoice = {
        id: 99,
        player: "P1",
        kind: "confirm",
        rule: "10.5.4",
        options: [{ id: "yes" }, { id: "no" }],
      } as unknown as GameState["pendingChoice"];
      state.resolution = {
        standby: { sourceCardId: source.cardId },
      } as unknown as GameState["resolution"];
      const answer = (optionId: string): Action => ({
        type: "choose",
        player: "P1",
        choiceId: 99,
        optionId,
      });
      const actions = [answer("yes"), answer("no")];
      const v = tanglerVerdict(state, actions, "P1", TANGLER, { discard });
      return v.against.has(actions[1]!);
    };
    // Perfect Form (rank 8) can't be played with their monster in zone 2: worth 0 on the board.
    expect(prompt(2, [PERFECT_FORM])).toBe(true);
    expect(prompt(0, [PERFECT_FORM])).toBe(false);
    // Only a strategy in hand: nothing to discard for the rage.
    expect(prompt(2, [BOND])).toBe(false);
    expect(prompt(2, [PERFECT_FORM], false)).toBe(false);
  });

  it("rule 3 at a discard pick (Orga EBP01-047's draw, then discard: 5.7.1): a battle card worth less than 5000 on the board goes before a strategy; at their rage 0, no preference", () => {
    const pick = (rage: number) => {
      const { state, p1, p2 } = position([ORGA, PERFECT_FORM, BOND], 3, 3);
      p2.rage = rage;
      const orga = getLegalActions(state, "P1").find(
        (a) => a.type === "playBattle" && ofCard(state, p1, a) === ORGA,
      )!;
      let s = advanceToDecision(applyAction(state, orga));
      for (
        let i = 0;
        i < 5 &&
        s.pendingChoice?.player === "P1" &&
        s.pendingChoice.rule !== "5.7.1";
        i++
      ) {
        const next = getLegalActions(s, "P1").find((a) => a.type === "choose")!;
        s = advanceToDecision(applyAction(s, next));
      }
      expect(s.pendingChoice?.rule).toBe("5.7.1");
      const me = s.players.find((p) => p.id === "P1")!;
      const v = verdict(s);
      const named = (a: Action) =>
        a.type === "choose"
          ? s.cards[
              me.hand.find((h) => h.instanceId === a.optionId)?.cardId ?? -1
            ]?.deckCardNumber
          : undefined;
      const of = (n: string) =>
        v.legal.filter((a) => named(a) === n).map((a) => v.against.has(a));
      return { perfect: of(PERFECT_FORM), bond: of(BOND) };
    };
    const on = pick(2);
    expect(on.perfect.length).toBeGreaterThan(0);
    for (const d of on.perfect) expect(d).toBe(false);
    for (const d of on.bond) expect(d).toBe(true);
    const zero = pick(0);
    for (const d of [...zero.perfect, ...zero.bond]) expect(d).toBe(false);
  });

  it("rule 7a (#444, stevilkiwina): at a discard pick with the rank I Godzilla (2002) EBP03-014 on top, the highest-rank battle card goes", () => {
    const pick = (highRank: boolean) => {
      const { state, p1 } = position(
        [EGG, ORGA, PERFECT_FORM, PERFECT_FORM],
        3,
        4,
      );
      p1.invadingMonsterZone = [add(state, real("EBP03-014"), "P1")];
      state.pendingChoice = {
        id: 96,
        player: "P1",
        kind: "target",
        rule: "5.7.1",
        options: p1.hand.map((c) => ({
          id: c.instanceId,
          cardId: c.cardId,
          abilityId: null,
        })),
      } as unknown as GameState["pendingChoice"];
      const actions: Action[] = p1.hand.map((c) => ({
        type: "choose",
        player: "P1",
        choiceId: 96,
        optionId: c.instanceId,
      }));
      const v = tanglerVerdict(state, actions, "P1", TANGLER, { highRank });
      return (n: string) =>
        actions
          .filter(
            (_, i) => state.cards[p1.hand[i]!.cardId]?.deckCardNumber === n,
          )
          .map((a) => v.against.has(a));
    };
    const on = pick(true);
    for (const d of on(PERFECT_FORM)) expect(d).toBe(false);
    for (const d of [...on(EGG), ...on(ORGA)]) expect(d).toBe(true);
    // `tanglerHighRank: false` (the paired check's control): no preference.
    const off = pick(false);
    for (const d of [...off(EGG), ...off(ORGA), ...off(PERFECT_FORM)])
      expect(d).toBe(false);
  });

  it("rule 7b (#444, stevilkiwina): in zone 5 their monster's rank decides the invasion of 2: it waits when theirs is lower, or the same with no counter this turn, unless their board already counters you", () => {
    // P1's Godzilla (2003) EPR-020 is rank 3; Mothra (Imago) pays 2 zones, Orga 1.
    const judge = (
      theirs: string,
      { made = false, countered = false, zoneFive = true } = {},
    ) => {
      const { state, p1, p2 } = position([IMAGO, ORGA], 5, 4);
      p2.invadingMonsterZone = [add(state, real(theirs), "P2")];
      p2.rage = 0;
      if (made)
        for (const z of [1, 2, 3, 4, 6, 7] as const)
          p1.zones[z] = [[add(state, real("EBP01-075"), "P1")]];
      if (countered)
        for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const)
          p2.zones[z] = [[add(state, real(PERFECT_FORM), "P2")]];
      expect(counters(state, "P1")).toBe(made);
      const v = verdict(state, { zoneFive });
      const of = (n: string) =>
        v.legal
          .filter((a) => a.type === "invade" && ofCard(state, p1, a) === n)
          .map((a) => v.against.has(a));
      expect(of(IMAGO).length).toBeGreaterThan(0);
      return { two: of(IMAGO), one: of(ORGA) };
    };
    const lower = judge("EBP01-002");
    for (const d of lower.two) expect(d).toBe(true);
    for (const d of lower.one) expect(d).toBe(false);
    for (const d of judge("EBP01-003").two) expect(d).toBe(true);
    for (const d of judge("EBP01-003", { made: true }).two)
      expect(d).toBe(false);
    for (const d of judge("EBP01-004").two) expect(d).toBe(false);
    for (const d of judge("EBP01-002", { countered: true }).two)
      expect(d).toBe(false);
    // `tanglerZoneFive: false` (the paired check's control).
    for (const d of judge("EBP01-002", { zoneFive: false }).two)
      expect(d).toBe(false);
  });

  it("rule 5: with the counter made, the rest of the hand waits (battle card plays, strategies), but Entangling Fear and the low evolution cards", () => {
    const { state, p1, p2 } = position([ORGA, EGG, BOND], 3, 3);
    p2.rage = 0;
    for (const z of [1, 2, 6, 7] as const)
      p1.zones[z] = [[add(state, real(IMAGO), "P1")]];
    expect(counters(state, "P1")).toBe(true);
    const v = verdict(state, { fear: false, discard: false });
    const plays = (n: string) =>
      v.legal
        .filter(
          (a) =>
            (a.type === "playBattle" || a.type === "activateStrategy") &&
            ofCard(state, p1, a) === n,
        )
        .map((a) => v.against.has(a));
    expect(plays(ORGA).length).toBeGreaterThan(0);
    for (const d of plays(ORGA)) expect(d).toBe(true);
    for (const d of plays(EGG)) expect(d).toBe(false);
    const off = verdict(state, { fear: false, discard: false, stop: false });
    for (const a of off.legal)
      if (a.type === "playBattle" && ofCard(state, p1, a) === ORGA)
        expect(off.against.has(a)).toBe(false);
  });
});

describe("the Tangler plan's rule 6 (#403; BFW182 and Paul, Nov 16)", () => {
  const AGGREGATE = "EBP01-049";
  const VS = "EBP01-062";

  it("6a: with no Destoroyah battle card on the field, the last rank 4 or 6 copy in hand stays: not played unless it makes the counter, not the card a discard pick takes", () => {
    const plays = (
      hand: string[],
      opts: { onField?: boolean; rage?: number; save?: boolean } = {},
    ) => {
      const { state, p1, p2 } = position(hand, 3, 4);
      p2.rage = opts.rage ?? 2;
      if (opts.onField) p1.zones[1] = [[add(state, real(PERFECT_FORM), "P1")]];
      const v = verdict(state, {
        fear: false,
        build: false,
        discard: false,
        stop: false,
        save: opts.save ?? true,
      });
      return v.legal
        .filter(
          (a) => a.type === "playBattle" && ofCard(state, p1, a) === AGGREGATE,
        )
        .map((a) => v.against.has(a));
    };
    // One Aggregate Form, none on the field, their threat 16000 (it doesn't make the counter): it stays.
    expect(plays([AGGREGATE]).length).toBeGreaterThan(0);
    for (const d of plays([AGGREGATE])) expect(d).toBe(true);
    // Two copies: one may go.
    for (const d of plays([AGGREGATE, AGGREGATE])) expect(d).toBe(false);
    // A Destoroyah on the field already: it may go.
    for (const d of plays([AGGREGATE], { onField: true }))
      expect(d).toBe(false);
    // `tanglerSave: false` (the control).
    for (const d of plays([AGGREGATE], { save: false })) expect(d).toBe(false);
  });

  it("6b: Godzilla vs. Destoroyah EBP01-062 waits unless it makes the counter that's the final one or stops a losing invasion", () => {
    const judge = (oppAt: ZoneNumber, lastMonster: boolean) => {
      const { state, p1, p2 } = position([VS], 3, oppAt);
      p2.rage = 0;
      // A Destoroyah on the field turns it on; their threat 6000: it makes the counter.
      p1.zones[1] = [[add(state, real(AGGREGATE), "P1")]];
      if (lastMonster) p2.monsterDeck = [];
      const v = verdict(state, {
        fear: false,
        build: false,
        discard: false,
        stop: false,
      });
      const vs = v.legal.filter(
        (a) => a.type === "activateStrategy" && ofCard(state, p1, a) === VS,
      );
      expect(vs.length).toBeGreaterThan(0);
      return vs.map((a) => v.against.has(a));
    };
    // Their monster in zone 3, monsters left: no losing invasion, not the final counter: it waits.
    for (const d of judge(3, false)) expect(d).toBe(true);
    // Their monster in zone 6 (in reach of your zone 8): it stops a losing invasion.
    for (const d of judge(6, false)) expect(d).toBe(false);
    // Their last monster: the final counter.
    for (const d of judge(3, true)) expect(d).toBe(false);
  });
});

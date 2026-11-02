import { readFileSync } from "node:fs";
import { type Card, getTokenCard } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  counterPowerOf,
  type GameState,
  getLegalActions,
  getThreat,
  type PlayerSetup,
  type PlayerState,
  startGame,
  type ZoneNumber,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { actionKey } from "./ismcts";
import {
  applyRules,
  boostedZones,
  columnCard,
  counterOnly,
  heldCards,
  RULE_BONUS,
  stackWants,
} from "./rules";

/**
 * Paul's play rules for Hard (#175): the card-condition readers, and each rule on a built
 * position (real cards put into a starter game at P1's main phase play timing, 7.3.2).
 */

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}
const DECKS: [PlayerSetup, PlayerSetup] = [
  { id: "P1", ...official("esd01-starter.txt") },
  { id: "P2", ...official("esd02-starter.txt") },
];
const real = (number: string): Card =>
  getAllCards().find(
    (c) => c.cardNumber === number && c.parentId === null,
  ) as Card;

let nextId = 960000;
function add(state: GameState, card: Card, owner: string): CardInstance {
  state.cards = { ...state.cards, [card.id]: card };
  return { instanceId: `c${nextId++}`, cardId: card.id, owner };
}

/** P1's main phase play timing with an empty hand, its monster in zone 6. */
function base(): { state: GameState; p1: PlayerState; p2: PlayerState } {
  let state = advanceToDecision(startGame({ seed: "rules", decks: DECKS }));
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
  p1.monsterPosition = 6;
  p1.discard.push(...p1.hand);
  p1.hand = [];
  p2.rage = 0;
  return { state, p1, p2 };
}

/** Makes `number` P1's invading monster (on top of the stack). */
function monster(state: GameState, p1: PlayerState, number: string) {
  p1.invadingMonsterZone.push(add(state, real(number), "P1"));
}

const rulesFor = (state: GameState) => {
  const actions = getLegalActions(state, "P1").filter(
    (a) => a.type !== "concede",
  );
  const key = (a: Action) => actionKey(state, a);
  return { actions, key, verdict: applyRules(state, actions, "P1", key) };
};

describe("card conditions (#175), read from ability data", () => {
  it("stack sizes, counter-only strategies, same-column and zone-boosted cards", () => {
    expect(stackWants(real("EBP02-051"))).toEqual([5]);
    expect(stackWants(real("EBP02-049"))).toEqual([3]);
    expect(counterOnly(real("EBP02-072"))).toBe(true);
    expect(counterOnly(real("ESD01-016"))).toBe(false);
    expect(columnCard(real("EBP02-068"))).toBe(true);
    expect(columnCard(real("EBP02-061"))).toBe(false);
    expect(boostedZones(real("EBP02-061"))).toEqual([8]);
    expect(boostedZones(real("EBP01-075"))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("Paul's play rules for Hard (#175)", () => {
  it("rule 2 (8.5.1): one SpaceGodzilla per rank is held, never discarded for rage; a King Ghidorah card isn't", () => {
    const { state, p1 } = base();
    monster(state, p1, "EBP02-052");
    const r3a = add(state, real("EBP02-054"), "P1");
    const r3b = add(state, real("EBP02-054"), "P1");
    const kg = add(state, real("EBP02-045"), "P1");
    p1.hand.push(r3a, r3b, kg);
    const held = heldCards(state, p1);
    expect([...held]).toEqual([r3a.instanceId]);
    const { actions, key, verdict } = rulesFor(state);
    const rage = (c: CardInstance) =>
      actions.find(
        (a) => a.type === "gainRage" && a.cardInstanceId === c.instanceId,
      );
    // Copies of a card share an action key: the held copy's rage key is pruned, the King
    // Ghidorah card's isn't.
    expect(verdict.dead.has(key(rage(r3a) as Action))).toBe(true);
    expect(verdict.dead.has(key(rage(kg) as Action))).toBe(false);
  });

  it("rule 3 (8.4.1): no pass while a monster card that isn't held can go to rage; pass stays once it's gone", () => {
    const { state, p1 } = base();
    monster(state, p1, "EBP02-052");
    p1.hand.push(add(state, real("EBP02-045"), "P1"));
    const { actions, key, verdict } = rulesFor(state);
    const pass = actions.find((a) => a.type === "pass") as Action;
    expect(verdict.dead.has(key(pass))).toBe(true);
    p1.hand = [];
    const after = rulesFor(state);
    expect(after.verdict.dead.has(after.key(pass))).toBe(false);
  });

  it("rule 4 (7.4.3): God of Destruction's Counterattack is held unless the counter is made, two copies counted together", () => {
    const { state, p1, p2 } = base();
    // 3 Crystals in zones 1 to 3 turn God of Destruction's Counterattack on (+20000 total each).
    const crystals = getTokenCard("Crystals");
    for (const zone of [1, 2, 3] as ZoneNumber[])
      p1.zones[zone].push([add(state, crystals, "P1")]);
    const god1 = add(state, real("EBP02-072"), "P1");
    p1.hand.push(god1);
    const power = counterPowerOf(state, p1);
    const threat0 = getThreat(state, "P2");
    // One copy short, two copies enough: the threat between power + 20000 and power + 40000.
    p2.rage = Math.ceil((power + 20001 - threat0) / 5000);
    const threat = getThreat(state, "P2");
    expect(threat).toBeGreaterThan(power + 20000);
    expect(threat).toBeLessThanOrEqual(power + 40000);
    const god = (s: GameState) =>
      rulesFor(s).actions.filter((a) => a.type === "activateStrategy");
    const one = rulesFor(state);
    expect(god(state).every((a) => one.verdict.dead.has(one.key(a)))).toBe(
      true,
    );
    // A second copy in hand with a free strategy zone: the first is now played.
    p1.hand.push(add(state, real("EBP02-072"), "P1"));
    const two = rulesFor(state);
    expect(god(state).some((a) => !two.verdict.dead.has(two.key(a)))).toBe(
      true,
    );
    // Paul: when the counter is made, playing it is preferred, but only as a prior.
    expect(
      god(state).every((a) => two.verdict.bonus.get(two.key(a)) === RULE_BONUS),
    ).toBe(true);
  });

  it("rule 5: Mecha-King Ghidorah (23) goes in the opponent's monster column", () => {
    const { state, p1, p2 } = base();
    monster(state, p1, "EBP02-052");
    // King Ghidorah cards in the discard pile bring its rank down to 5 (2 lower each, M2).
    for (let i = 0; i < 9; i++)
      p1.discard.push(add(state, real("EBP02-046"), "P1"));
    p1.hand.push(add(state, real("EBP02-068"), "P1"));
    // 8.2.1: a battle card's rank at most the opponent's monster zone.
    p2.monsterPosition = 5;
    const { actions, key, verdict } = rulesFor(state);
    const plays = actions.filter((a) => a.type === "playBattle") as Extract<
      Action,
      { type: "playBattle" }
    >[];
    expect(plays.length).toBeGreaterThan(1);
    const alive = plays.filter((a) => !verdict.dead.has(key(a)));
    expect(alive.length).toBeGreaterThan(0);
    expect(alive.length).toBeLessThan(plays.length);
  });

  it("rule 6: Godzilla (1972) gets the prior in zone 8; a zone-1-5 card gets none while zone 8 is open to an invasion", () => {
    const { state, p1, p2 } = base();
    monster(state, p1, "EBP02-052");
    p1.hand.push(add(state, real("EBP02-061"), "P1"));
    // 8.2.1: a battle card's rank at most the opponent's monster zone.
    p2.monsterPosition = 5;
    const r = rulesFor(state);
    const plays = r.actions.filter((a) => a.type === "playBattle") as Extract<
      Action,
      { type: "playBattle" }
    >[];
    expect(plays.some((a) => a.zone === 8)).toBe(true);
    for (const a of plays)
      expect(r.verdict.bonus.get(r.key(a))).toBe(
        a.zone === 8 ? RULE_BONUS : undefined,
      );
    // Nothing is pruned for zones: it's a prior only (Monarch).
    expect(plays.every((a) => !r.verdict.dead.has(r.key(a)))).toBe(true);
  });

  it("rules act only at your own play timing", () => {
    const { state, p1 } = base();
    monster(state, p1, "EBP02-052");
    p1.hand.push(add(state, real("EBP02-045"), "P1"));
    state.turnPlayer = "P2";
    const { verdict } = rulesFor(state);
    expect(verdict.dead.size + verdict.bonus.size).toBe(0);
  });
});

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
  type GameRecord,
  type GameState,
  getLegalActions,
  getThreat,
  type PlayerSetup,
  type PlayerState,
  replayAll,
  startGame,
  type ZoneNumber,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { actionKey, decide } from "./ismcts";
import { botInput, decklistsOf, seededRng } from "./input";
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
    // #189 (Paul: extra copies go to rage): copies share an action key, so the key stays for
    // the spare; only the held copy's action is ruled out. The King Ghidorah card's stays too.
    expect(verdict.dead.has(key(rage(r3a) as Action))).toBe(false);
    expect(verdict.killed.has(rage(r3a) as Action)).toBe(true);
    expect(verdict.killed.has(rage(r3b) as Action)).toBe(false);
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
    // A second copy in hand with a free strategy zone, after the turn's invasion (8.6.2): the
    // first is now played.
    p1.hand.push(add(state, real("EBP02-072"), "P1"));
    state.turnFlags.invasionUsed = true;
    const two = rulesFor(state);
    expect(god(state).some((a) => !two.verdict.dead.has(two.key(a)))).toBe(
      true,
    );
    // Paul: when the counter is made, playing it is preferred, but only as a prior.
    expect(
      god(state).every((a) => two.verdict.bonus.get(two.key(a)) === RULE_BONUS),
    ).toBe(true);

    // #189: before the invasion (8.6.1 still legal) it waits, and the invasion gets the prior.
    state.turnFlags.invasionUsed = false;
    const before = rulesFor(state);
    const invasions = before.actions.filter((a) => a.type === "invade");
    expect(invasions.length).toBeGreaterThan(0);
    expect(
      god(state).every((a) => before.verdict.dead.has(before.key(a))),
    ).toBe(true);
    expect(
      invasions.every(
        (a) => before.verdict.bonus.get(before.key(a)) === RULE_BONUS,
      ),
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

  it("rule 6: Godzilla (1972) goes in zone 8: a prune while zone 8 isn't exposed, a prior while it is (#189)", () => {
    const { state, p1, p2 } = base();
    monster(state, p1, "EBP02-052");
    p1.hand.push(add(state, real("EBP02-061"), "P1"));
    const playsOf = (r: ReturnType<typeof rulesFor>) =>
      r.actions.filter((a) => a.type === "playBattle") as Extract<
        Action,
        { type: "playBattle" }
      >[];
    // 8.2.1: a battle card's rank at most the opponent's monster zone. At 5 the opponent can't
    // reach your zone 8 next turn: the plays outside zone 8 are pruned (Paul, #189).
    p2.monsterPosition = 5;
    const safe = rulesFor(state);
    const plays = playsOf(safe);
    expect(plays.some((a) => a.zone === 8)).toBe(true);
    expect(plays.some((a) => a.zone !== 8)).toBe(true);
    for (const a of plays)
      expect(safe.verdict.dead.has(safe.key(a))).toBe(a.zone !== 8);
    // At 6 with your zone 8 empty, it's exposed: zone 8 gets the prior and nothing is pruned.
    p2.monsterPosition = 6;
    const exposed = rulesFor(state);
    for (const a of playsOf(exposed)) {
      expect(exposed.verdict.dead.has(exposed.key(a))).toBe(false);
      expect(exposed.verdict.bonus.get(exposed.key(a))).toBe(
        a.zone === 8 ? RULE_BONUS : undefined,
      );
    }
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

describe("#189 gaps in Paul's rules", () => {
  it("rule 2 in a cost choice (5.7.1): a held card is left out while another option stays", () => {
    const { state, p1 } = base();
    monster(state, p1, "EBP02-052");
    const held = add(state, real("EBP02-054"), "P1");
    const other = add(state, real("EBP02-045"), "P1");
    p1.hand.push(held, other);
    state.pendingChoice = {
      id: 99,
      player: "P1",
      kind: "target",
      rule: "5.7.1",
      options: [
        { id: held.instanceId, cardId: held.cardId },
        { id: other.instanceId, cardId: other.cardId },
      ],
    } as unknown as GameState["pendingChoice"];
    const choose = (id: string): Action => ({
      type: "choose",
      player: "P1",
      choiceId: 99,
      optionId: id,
    });
    const actions = [choose(held.instanceId), choose(other.instanceId)];
    const key = (a: Action) => (a as { optionId: string }).optionId;
    const { dead } = applyRules(state, actions, "P1", key);
    expect([...dead]).toEqual([held.instanceId]);
    // The held card alone stays: something must be picked.
    expect(applyRules(state, [actions[0] as Action], "P1", key).dead.size).toBe(
      0,
    );
  });

  it("a blunder picks only among the moves the rules allow (rule 3: no pass while a monster card can go to rage)", () => {
    const position = JSON.parse(
      readFileSync(
        new URL(
          "../../../tools/bots/positions/rule3-monster-cards-to-rage.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { record: GameRecord };
    const state = replayAll(position.record).at(-1) as GameState;
    const player = state.turnPlayer;
    const picks = (rules: number) =>
      Array.from({ length: 100 }, (_, i) => {
        const input = botInput(
          state,
          player,
          decklistsOf(position.record.decks),
          seededRng(`blunder-${i}`),
          { blunder: 1, uniformBlunder: 1, rules, iterations: 1 },
        );
        return decide(input).action.type;
      });
    expect(picks(1)).not.toContain("pass");
    expect(picks(0)).toContain("pass");
  });
});

describe("#189 copies and the concede guard", () => {
  const twoCopies = () => {
    const { state, p1 } = base();
    monster(state, p1, "EBP02-052");
    // Two SpaceGodzilla EBP02-056: one is held (rule 2, one per rank), the other is a spare.
    const a = add(state, real("EBP02-056"), "P1");
    const b = add(state, real("EBP02-056"), "P1");
    p1.hand.push(a, b);
    const held = heldCards(state, p1);
    expect(held.size).toBe(1);
    const [heldCard, spare] = held.has(a.instanceId) ? [a, b] : [b, a];
    return { state, heldCard, spare };
  };

  it("rule 2 (8.4.1): the copies share a key, so it stays; only the held copy's action is ruled out", () => {
    const { state, heldCard, spare } = twoCopies();
    const actions = getLegalActions(state, "P1");
    const key = (x: Action) => actionKey(state, x);
    const { dead, killed } = applyRules(state, actions, "P1", key);
    const rage = (id: string) =>
      actions.find(
        (x) => x.type === "gainRage" && x.cardInstanceId === id,
      ) as Action;
    expect(dead.has(key(rage(spare.instanceId)))).toBe(false);
    expect(killed.has(rage(heldCard.instanceId))).toBe(true);
    expect(killed.has(rage(spare.instanceId))).toBe(false);
    // Rule 3: a spare monster card can go to rage, so no pass.
    expect(
      actions.filter((x) => x.type === "pass").every((x) => dead.has(key(x))),
    ).toBe(true);
  });

  it("the search and a blunder spend the spare copy, never the held one", () => {
    // A real game with the made-up SpaceGodzilla deck (tools/bots/positions/decks), so the
    // determinization knows every card: two EBP02-056 move from the deck to the hand.
    const madeUp = parseDeckList(
      readFileSync(
        new URL(
          "../../../tools/bots/positions/decks/made-up-spaceg.txt",
          import.meta.url,
        ),
        "utf8",
      ),
    ).decks[0];
    if (!madeUp) throw new Error("made-up-spaceg.txt");
    const decks: [PlayerSetup, PlayerSetup] = [
      { id: "P1", monsterDeck: madeUp.monsterDeck, mainDeck: madeUp.mainDeck },
      DECKS[1],
    ];
    let state = advanceToDecision(startGame({ seed: "copies", decks }));
    while (
      state.turnPlayer !== "P1" ||
      state.pendingChoice ||
      state.step !== "7.3.2"
    ) {
      const who = state.pendingChoice?.player ?? state.turnPlayer;
      const legal = getLegalActions(state, who).filter(
        (x) => x.type !== "concede",
      );
      const pass = legal.find((x) => x.type === "pass");
      state = advanceToDecision(
        applyAction(state, pass ?? (legal[0] as Action)),
      );
    }
    const p1 = state.players.find((x) => x.id === "P1") as PlayerState;
    p1.deck.push(...p1.hand);
    p1.hand = [];
    for (let n = 0; n < 2; n++) {
      const i = p1.deck.findIndex(
        (c) => state.cards[c.cardId]?.deckCardNumber === "EBP02-056",
      );
      p1.hand.push(...p1.deck.splice(i, 1));
    }
    const held = heldCards(state, p1);
    expect(held.size).toBe(1);
    for (const settings of [
      { iterations: 40 },
      { blunder: 1, uniformBlunder: 1 },
    ])
      for (let i = 0; i < 12; i++) {
        const input = botInput(
          state,
          "P1",
          decklistsOf(decks),
          seededRng(`copies-${i}`),
          { ...settings, rules: 1, temperature: 0.1 },
        );
        const action = decide(input).action;
        expect(
          action.type === "gainRage" && held.has(action.cardInstanceId),
        ).toBe(false);
      }
  });

  it("conceding doesn't count as the action a prune must leave", () => {
    const { state, p1 } = base();
    monster(state, p1, "EBP02-052");
    // A held card and God of Destruction's Counterattack without the counter (7.4.3): both ruled out.
    p1.hand.push(add(state, real("EBP02-054"), "P1"));
    p1.hand.push(add(state, real("EBP02-072"), "P1"));
    const legal = getLegalActions(state, "P1");
    const actions = legal.filter(
      (x) =>
        x.type === "concede" ||
        x.type === "gainRage" ||
        x.type === "activateStrategy",
    );
    expect(actions.some((x) => x.type === "concede")).toBe(true);
    const verdict = applyRules(state, actions, "P1", (x) =>
      actionKey(state, x),
    );
    expect(verdict.dead.size).toBe(0);
    expect(verdict.killed.size).toBe(0);
  });
});

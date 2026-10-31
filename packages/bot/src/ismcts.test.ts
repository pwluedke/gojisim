import { readFileSync } from "node:fs";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import {
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { pickWith, tacticalPick } from "./baseline";
import { determinize } from "./determinize";
import {
  difficultySettings,
  HARD_PRIOR_VISITS,
  M12_SETTINGS,
  PRESETS,
} from "./difficulty";
import { botInput, decklistsOf, seededRng } from "./input";
import { actionKey, ismctsBot, ismctsSettings, search } from "./ismcts";

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
const LISTS = decklistsOf(DECKS);
/** A deterministic budget: iterations only (no clock). */
const BUDGET = { iterations: 300, maxMs: 1e9 };

/** P1's first play timing, from a fixed seed. */
function start(): GameState {
  const state = advanceToDecision(startGame({ seed: "ismcts", decks: DECKS }));
  if (state.turnPlayer !== "P1" || state.pendingChoice) {
    // The seed puts P2 first: swap roles by passing to P1's turn.
    let s = state;
    while (s.turnPlayer !== "P1" || s.pendingChoice || s.step !== "7.3.2")
      s = advanceToDecision(
        // Pass or take the first option until P1's play timing.
        (() => {
          const d = s.pendingChoice?.player ?? s.turnPlayer;
          const a = getLegalActions(s, d).find((x) => x.type !== "concede");
          if (!a) throw new Error("no action");
          return applyIt(s, a);
        })(),
      );
    return s;
  }
  return state;
}

const applyIt = applyAction;

const choose = (state: GameState, seed: string, settings = BUDGET) =>
  ismctsBot.chooseAction(
    botInput(state, "P1", LISTS, seededRng(seed), settings),
  );

// Searches run a fixed number of iterations (no clock), which takes seconds on a slow CI runner.
describe("ismcts (M6c)", { timeout: 60_000 }, () => {
  it("a seeded search returns the same action twice", () => {
    const state = start();
    expect(choose(state, "same")).toEqual(choose(state, "same"));
  });

  it("no peeking: identical BotInputs give identical choices, whatever the hidden cards", () => {
    const state = start();
    const variant = JSON.parse(JSON.stringify(state)) as GameState;
    const opp = variant.players.find((p) => p.id === "P2");
    if (!opp) throw new Error("P2");
    // Swap the opponent's hand with cards from their deck, and reverse both decks.
    for (let i = 0; i < Math.min(opp.hand.length, opp.deck.length); i++) {
      const h = opp.hand[i];
      const d = opp.deck[i];
      if (h && d) [opp.hand[i], opp.deck[i]] = [d, h];
    }
    opp.deck.reverse();
    variant.players.find((p) => p.id === "P1")?.deck.reverse();
    const a = botInput(state, "P1", LISTS, seededRng("x"), BUDGET);
    const b = botInput(variant, "P1", LISTS, seededRng("x"), BUDGET);
    expect({ ...b, rng: null }).toEqual({ ...a, rng: null });
    expect(ismctsBot.chooseAction(b)).toEqual(ismctsBot.chooseAction(a));
  });

  it("action keys don't depend on hidden instance ids: root keys and opponent keys match across determinizations", () => {
    const state = start();
    const input = botInput(state, "P1", LISTS, seededRng("k"));
    const one = determinize(input.view, input.knowledge, seededRng(1));
    const two = determinize(input.view, input.knowledge, seededRng(2));
    const rootKeys = (s: GameState) =>
      input.legalActions.map((a) => actionKey(s, a));
    expect(rootKeys(two)).toEqual(rootKeys(one));
    // The opponent's actions, keyed in a state where only their hidden instance ids differ.
    const renumbered = JSON.parse(
      JSON.stringify(one).replace(/"c(\d+)"/g, (m, n: string) => {
        const card = one.players[1].hand
          .concat(one.players[1].deck)
          .find((c) => c.instanceId === `c${n}`);
        return card ? `"c${Number(n) + 100000}"` : m;
      }),
    ) as GameState;
    for (const s of [one, renumbered]) s.turnPlayer = "P2";
    const oppKeys = (s: GameState) =>
      getLegalActions(s, "P2")
        .filter((a) => a.type !== "concede")
        .map((a) => actionKey(s, a))
        .sort();
    expect(oppKeys(renumbered)).toEqual(oppKeys(one));
  });

  it("M2: a play on top of a card and a plain play into the same zone have different keys (EBP03-051)", () => {
    const state = start();
    const card = state.players[0].hand[0]!;
    const plain = {
      type: "playBattle" as const,
      player: "P1",
      cardInstanceId: card.instanceId,
      zone: 2 as const,
    };
    expect(actionKey(state, { ...plain, onTop: true })).not.toBe(
      actionKey(state, plain),
    );
  });

  it("M2: plays paid with different cards, or with a different card under the monster, have different keys (EBP04-045, EBP04-012)", () => {
    const state = start();
    const [a, b, c] = state.players[0].hand;
    if (!a || !b || !c) throw new Error("no hand");
    const battle = {
      type: "playBattle" as const,
      player: "P1",
      cardInstanceId: a.instanceId,
      zone: 2 as const,
    };
    expect(
      actionKey(state, { ...battle, costCardInstanceId: b.instanceId }),
    ).not.toBe(actionKey(state, battle));
    const monster = {
      type: "playMonster" as const,
      player: "P1",
      cardInstanceId: a.instanceId,
    };
    expect(
      actionKey(state, { ...monster, underInstanceId: c.instanceId }),
    ).not.toBe(actionKey(state, monster));
  });

  it("win now: in zone 8 with the opponent's zone 8 open and an invasion available, it invades", () => {
    const state = start();
    const [p1, p2] = state.players;
    p1.monsterPosition = 8;
    p2.zones[8] = [];
    state.turnFlags.invasionUsed = false;
    const action = choose(state, "win");
    expect(action.type).toBe("invade");
  });

  it("must block: the opponent is in zone 8 and its own zone 8 is open, so by the end of its turn it has a battle card there", () => {
    let state = start();
    const [p1, p2] = state.players;
    p1.monsterPosition = 5;
    p1.zones[8] = [];
    p2.monsterPosition = 8;
    expect(
      getLegalActions(state, "P1").some(
        (a) => a.type === "playBattle" && a.zone === 8,
      ),
    ).toBe(true);
    // Play P1's turn with the bot (it may invade first: that doesn't end the turn); answer any
    // P2 choice with its first option.
    for (
      let n = 0;
      state.turnPlayer === "P1" && state.result === null && n < 30;
      n++
    ) {
      const who = state.pendingChoice?.player ?? state.turnPlayer;
      const action =
        who === "P1"
          ? choose(state, `block-${n}`, { iterations: 600, maxMs: 1e9 })
          : getLegalActions(state, who).find((a) => a.type !== "concede");
      if (!action) throw new Error("no action");
      state = advanceToDecision(applyIt(state, action));
    }
    const zone8 = state.players[0].zones[8];
    expect(
      zone8.some(
        (stack) =>
          state.cards[stack[stack.length - 1]?.cardId ?? 0]?.type === "Battle",
      ),
    ).toBe(true);
    expect(state.result).toBeNull();
  });

  it("M13c tactical play-outs: a winning invasion is taken, and an open zone 8 is blocked", () => {
    const state = start();
    const [p1, p2] = state.players;
    const pick = pickWith(seededRng("tactical"));
    // In zone 8 with the opponent's zone 8 open: any card's icon wins, so it invades every time.
    p1.monsterPosition = 8;
    p2.zones[8] = [];
    state.turnFlags.invasionUsed = false;
    const options = getLegalActions(state, "P1").filter(
      (a) => a.type !== "concede",
    );
    for (let i = 0; i < 20; i++)
      expect(tacticalPick(state, options, pick).type).toBe("invade");
    // Blocked: a battle card tops the opponent's zone 8, so no invasion wins; the weighted pick
    // takes other actions too.
    const blocked = JSON.parse(JSON.stringify(state)) as GameState;
    const battle = blocked.players[0].hand.find(
      (c) => blocked.cards[c.cardId]?.type === "Battle",
    );
    if (!battle) throw new Error("no battle card in hand");
    blocked.players[1].zones[8] = [[{ ...battle, instanceId: "x1" }]];
    const types = new Set(
      Array.from(
        { length: 40 },
        () => tacticalPick(blocked, options, pick).type,
      ),
    );
    expect(types.size).toBeGreaterThan(1);
    // The opponent in its zone 8 and P1's zone 8 open: a battle card goes there every time.
    p1.monsterPosition = 5;
    p1.zones[8] = [];
    p2.monsterPosition = 8;
    const defend = getLegalActions(state, "P1").filter(
      (a) => a.type !== "concede",
    );
    for (let i = 0; i < 20; i++)
      expect(tacticalPick(state, defend, pick)).toMatchObject({
        type: "playBattle",
        zone: 8,
      });
  });

  it("M13c priorVisits (#75): off by default; on, a new node starts with that many visits at its static value from the chooser's side", () => {
    expect(ismctsSettings({}).priorVisits).toBe(0);
    const state = start();
    // One iteration expands one root child; with no play-out its real visit is the same static
    // value, from the same seeded determinization.
    const once = (priorVisits: number) => {
      const settings = { iterations: 1, maxMs: 1e9, rollout: "none" as const };
      const result = search(
        botInput(state, "P1", LISTS, seededRng("prior"), settings),
        ismctsSettings({ ...settings, priorVisits }),
      );
      const [key, child] = [...result.root.children.entries()][0] ?? [];
      return { key, visits: child?.visits, value: child?.value ?? NaN };
    };
    const off = once(0);
    const on = once(20);
    expect(on.key).toBe(off.key);
    expect(off.visits).toBe(1);
    expect(on.visits).toBe(21);
    expect(on.value).toBeCloseTo(21 * off.value, 9);
  });

  it("difficulty: 0 is close to random, 100 is the full search; presets 20, 55, 90", () => {
    expect(PRESETS).toEqual({ easy: 20, medium: 55, hard: 90 });
    expect(difficultySettings(0)).toMatchObject({
      iterations: 4,
      temperature: 1,
      blunder: 0.6,
    });
    expect(difficultySettings(100)).toMatchObject({
      iterations: 1000,
      temperature: 0,
      blunder: 0,
    });
    const levels = [0, 20, 55, 90, 100].map(difficultySettings);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]?.iterations).toBeGreaterThan(
        levels[i - 1]?.iterations ?? 0,
      );
      expect(levels[i]?.blunder).toBeLessThan(levels[i - 1]?.blunder ?? 1);
    }
  });

  it("M13a: Easy searches exactly as before M13a; Medium and Hard differ from the old bot only by pruning", () => {
    const now = (level: number) => ismctsSettings(difficultySettings(level));
    const before = (level: number) =>
      ismctsSettings({ ...difficultySettings(level), ...M12_SETTINGS });
    expect(now(PRESETS.easy)).toEqual(before(PRESETS.easy));
    expect(now(PRESETS.medium)).toEqual({
      ...before(PRESETS.medium),
      prune: 1,
    });
    // M13c (#75): from Hard up, also the progressive bias.
    for (const level of [PRESETS.hard, 100])
      expect(now(level)).toEqual({
        ...before(level),
        prune: 1,
        priorVisits: HARD_PRIOR_VISITS,
      });
  });

  it("M13c (#75): priorVisits is 20 from Hard (90) up and 0 below, as Monarch decided; the m12 bots keep none", () => {
    expect(HARD_PRIOR_VISITS).toBe(20);
    for (const level of [0, PRESETS.easy, PRESETS.medium, 89])
      expect(difficultySettings(level).priorVisits).toBe(0);
    for (const level of [PRESETS.hard, 95, 100])
      expect(difficultySettings(level).priorVisits).toBe(20);
    expect(
      ismctsSettings({ ...difficultySettings(PRESETS.hard), ...M12_SETTINGS })
        .priorVisits,
    ).toBe(0);
  });
});

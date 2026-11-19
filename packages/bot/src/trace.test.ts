import { readFileSync } from "node:fs";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type GameState,
  type PlayerId,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { difficultySettings } from "./difficulty";
import { botInput, decklistsOf, seededRng } from "./input";
import { decide } from "./ismcts";
import { type DecisionTrace, ruleInfo, traceSink } from "./trace";

/*
 * #478 (R-48, phase 1): a decision's trace explains it and never changes it. Level 100's settings
 * with a fixed number of iterations and no time limit, so only the trace differs between runs.
 */

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}

const SETUPS: [PlayerSetup, PlayerSetup] = [
  { id: "P1", ...official("esd01-starter.txt") },
  { id: "P2", ...official("esd02-starter.txt") },
];
const SETTINGS = {
  ...difficultySettings(100),
  iterations: 40,
  maxMs: 1e9,
};

/** One seeded game, both seats Level 100; every bot move, and the traces when asked. */
function play(seed: string, traced: boolean, maxMoves = 120) {
  const lists = decklistsOf(SETUPS);
  let state: GameState = advanceToDecision(startGame({ seed, decks: SETUPS }));
  const moves: string[] = [];
  const traces: DecisionTrace[] = [];
  for (let n = 0; n < maxMoves && state.result === null; n++) {
    const who = (state.pendingChoice?.player ?? state.turnPlayer) as PlayerId;
    const input = botInput(
      state,
      who,
      lists,
      seededRng(`${seed}-${n}`),
      SETTINGS,
    );
    const decision = decide(traced ? { ...input, trace: traceSink() } : input);
    if (decision.trace) traces.push(decision.trace);
    moves.push(JSON.stringify(decision.action));
    state = advanceToDecision(applyAction(state, decision.action as Action));
  }
  return { moves, traces };
}

describe("the decision trace (#478)", () => {
  // Two whole games each way: slow, so it says how long it may take.
  it(
    "the same seeds give the same moves with tracing on",
    { timeout: 600_000 },
    () => {
      for (const seed of ["trace-a", "trace-b"]) {
        const plain = play(seed, false);
        const traced = play(seed, true);
        expect(traced.moves).toEqual(plain.moves);
        expect(traced.traces).toHaveLength(plain.moves.length);
      }
    },
  );

  it(
    "a trace names the pick, its alternatives with visits and win estimates, and the rules with their sentences",
    { timeout: 300_000 },
    () => {
      const { traces } = play("trace-a", true, 60);
      const searched = traces.filter(
        (t) => !t.blundered && t.alternatives.length > 1,
      );
      expect(searched.length).toBeGreaterThan(0);
      for (const t of searched) {
        expect(t.alternatives.length).toBeLessThanOrEqual(3);
        expect(t.alternatives[0]?.visits).toBeGreaterThanOrEqual(
          t.alternatives.at(-1)?.visits ?? 0,
        );
        for (const a of t.alternatives)
          if (a.winRate !== null) {
            expect(a.winRate).toBeGreaterThanOrEqual(0);
            expect(a.winRate).toBeLessThanOrEqual(1);
          }
      }
      const rules = traces.flatMap((t) => t.rules);
      expect(rules.length).toBeGreaterThan(0);
      for (const r of rules) {
        expect(r.id).toMatch(
          /^(card rule \S+|play rule \S+|No-plan play \d|Final Wars ruling|[A-Za-z ]+ plan\b)/,
        );
        expect(r.text).not.toBe(r.id);
        expect(r.actions.length).toBeGreaterThan(0);
      }
    },
  );

  it("each card rule has a sentence; a rule with a switch names it and uses its line", () => {
    expect(ruleInfo("card rule 23b").switch).toBe("coverToken");
    expect(ruleInfo("card rule 23b").text).toMatch(/^Card rule 23b:/);
    expect(ruleInfo("card rule 7").switch).toBeUndefined();
    expect(ruleInfo("card rule 7").text).toMatch(/zone 8/);
  });
});

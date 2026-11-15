import { describe, expect, it } from "vitest";
import {
  type Action,
  advanceToDecision,
  applyAction,
  classroomPosition,
  type GameState,
  getLegalActions,
  isMainPhaseStart,
  mainPhaseEnd,
  positionDifferences,
  samePosition,
  startGame,
} from "../src";
import { testDeck } from "./fixtures/cards";

/** A new game at the first player's first main phase play timing (7.3.2). */
function start(seed = 365): GameState {
  return startGame({
    seed,
    decks: [testDeck("alice", 0), testDeck("bob", 1)],
  });
}

/** Two battle-card plays into different zones, from the turn player's legal actions. */
function twoPlays(state: GameState): [Action, Action] {
  const plays = getLegalActions(state, state.turnPlayer).filter(
    (a): a is Extract<Action, { type: "playBattle" }> =>
      a.type === "playBattle" && !a.onTop,
  );
  const first = plays[0];
  const second = plays.find(
    (a) => a.cardInstanceId !== first?.cardInstanceId && a.zone !== first?.zone,
  );
  if (!first || !second) throw new Error("no two plays");
  return [first, second];
}

/** Applies actions as a session does (each followed by `advanceToDecision`). */
function play(state: GameState, actions: readonly Action[]): GameState[] {
  const states = [state];
  for (const action of actions)
    states.push(
      advanceToDecision(
        applyAction(states[states.length - 1] as GameState, action),
      ),
    );
  return states;
}

/** A pass for the turn player, after `actions`. */
function turn(state: GameState, actions: readonly Action[]) {
  const all = [...actions, { type: "pass", player: state.turnPlayer } as Action];
  return { states: play(state, all), actions: all };
}

describe("Kaiju Classroom: the same end position (#365)", () => {
  it("10.4.4.3 the main phase ends with the pass, before the counter phase (7.4) runs", () => {
    const s0 = start();
    const { states, actions } = turn(s0, []);
    expect(isMainPhaseStart(states, 0)).toBe(true);
    const end = mainPhaseEnd(states, actions, 0);
    expect(end?.index).toBe(0);
    // Right after the pass: the counter phase is next, none of its steps has run.
    expect(end?.state).toMatchObject({ phase: "counter", step: "7.4.1" });
    // While the main phase goes on there is no end yet.
    expect(mainPhaseEnd(states, [], 0)).toBeNull();
  });

  it("8.2 two battle cards played in a different order, same result: same", () => {
    const s0 = start();
    const [x, y] = twoPlays(s0);
    const a = turn(s0, [x, y]);
    const b = turn(s0, [y, x]);
    const endA = mainPhaseEnd(a.states, a.actions, 0)?.state as GameState;
    const endB = mainPhaseEnd(b.states, b.actions, 0)?.state as GameState;
    expect(samePosition(endA, endB, s0.turnPlayer)).toBe(true);
  });

  it("8.2 the same card into a different zone: not same", () => {
    const s0 = start();
    const [x] = twoPlays(s0);
    const other = getLegalActions(s0, s0.turnPlayer).find(
      (a) =>
        a.type === "playBattle" &&
        a.cardInstanceId === x.cardInstanceId &&
        a.zone !== (x as { zone: number }).zone,
    ) as Action;
    const a = turn(s0, [x]);
    const b = turn(s0, [other]);
    const endA = mainPhaseEnd(a.states, a.actions, 0)?.state as GameState;
    const endB = mainPhaseEnd(b.states, b.actions, 0)?.state as GameState;
    expect(samePosition(endA, endB, s0.turnPlayer)).toBe(false);
    expect(
      positionDifferences(
        classroomPosition(endA, s0.turnPlayer),
        classroomPosition(endB, s0.turnPlayer),
      ).filter((d) => d.startsWith("own.zones.")),
    ).toHaveLength(2);
  });

  it("4.9 a different card kept in hand: not same (the hand is a multiset, not a count)", () => {
    const s0 = start();
    const [x, y] = twoPlays(s0);
    // Same zone, another card: the hands keep different cards.
    const ySameZone = getLegalActions(s0, s0.turnPlayer).find(
      (a) =>
        a.type === "playBattle" &&
        a.cardInstanceId === y.cardInstanceId &&
        a.zone === (x as { zone: number }).zone &&
        !a.onTop,
    ) as Action;
    const endA = turn(s0, [x]).states.at(-1) as GameState;
    const endB = turn(s0, [ySameZone]).states.at(-1) as GameState;
    const seat = s0.turnPlayer;
    const diffs = positionDifferences(
      classroomPosition(endA, seat),
      classroomPosition(endB, seat),
    );
    expect(diffs).toContain("own.hand");
    expect(samePosition(endA, endB, seat)).toBe(false);
    // The hand alone: swap one hand card for a deck card, everything else the same.
    const swapped = structuredClone(s0);
    const me = swapped.players.find((p) => p.id === seat);
    const [kept] = me?.hand.splice(0, 1) ?? [];
    const [drawn] = me?.deck.splice(0, 1) ?? [];
    if (!me || !kept || !drawn) throw new Error("no cards");
    me.hand.push(drawn);
    me.deck.push(kept);
    expect(
      positionDifferences(
        classroomPosition(s0, seat),
        classroomPosition(swapped, seat),
      ),
    ).toEqual(["own.hand"]);
  });

  it("4.1.4 instance ids that differ only: same", () => {
    const s0 = start();
    const renamed = structuredClone(s0);
    for (const player of renamed.players)
      for (const card of [
        ...player.hand,
        ...player.deck,
        ...player.monsterDeck,
        ...player.invadingMonsterZone,
      ])
        card.instanceId = `other-${card.instanceId}`;
    expect(samePosition(s0, renamed, s0.turnPlayer)).toBe(true);
  });

  it("4.8 the main deck counts by number only; the opponent's hand by count (4.9)", () => {
    const s0 = start();
    const seat = s0.turnPlayer;
    const shuffled = structuredClone(s0);
    const me = shuffled.players.find((p) => p.id === seat);
    const opp = shuffled.players.find((p) => p.id !== seat);
    if (!me || !opp) throw new Error("no players");
    me.deck.reverse();
    // The opponent's hand holds other cards, as many: their hand is hidden from the bot.
    const [card] = opp.hand.splice(0, 1);
    const [top] = opp.deck.splice(0, 1);
    if (!card || !top) throw new Error("no cards");
    opp.hand.push(top);
    opp.deck.push(card);
    expect(samePosition(s0, shuffled, seat)).toBe(true);
    me.deck.pop();
    expect(
      positionDifferences(
        classroomPosition(s0, seat),
        classroomPosition(shuffled, seat),
      ),
    ).toEqual(["own.deckCount"]);
  });

  it("3.4 rage and 4.10 the opponent's discard pile count", () => {
    const s0 = start();
    const seat = s0.turnPlayer;
    const other = structuredClone(s0);
    const opp = other.players.find((p) => p.id !== seat);
    const me = other.players.find((p) => p.id === seat);
    if (!opp || !me) throw new Error("no players");
    me.rage += 1;
    const [card] = opp.deck.splice(0, 1);
    if (card) opp.discard.push(card);
    expect(
      positionDifferences(
        classroomPosition(s0, seat),
        classroomPosition(other, seat),
      ),
    ).toEqual(["own.rage", "opponent.discard"]);
  });
});

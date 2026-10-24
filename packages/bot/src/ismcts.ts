import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  type GameState,
  getLegalActions,
  type PlayerId,
} from "@gojisim/engine";
import { pickWith, stateBoard, weightedPick } from "./baseline";
import { determinize } from "./determinize";
import { evaluate } from "./evaluate";
import type { Bot, BotInput, BotSettings } from "./types";

/**
 * Single-observer information-set MCTS (M6c). Each iteration samples a determinization (M6a) and
 * walks one shared tree from the root, using only the actions legal in that determinization.
 * Selection is UCB1 with availability counts: a child's "parent visits" are the times it was
 * available. Opponent decisions are tree nodes too, valued from the opponent's side. Leaves get a
 * short rollout, then `evaluate` from the bot's side.
 */

export interface IsmctsSettings {
  /** Iteration budget. */
  iterations: number;
  /** Time budget in milliseconds; whichever budget runs out first ends the search. */
  maxMs: number;
  /** UCB1 exploration constant (values are in [-1, 1]). */
  exploration: number;
  rollout: "none" | "weighted" | "greedy";
  /** Opponent turns a rollout plays to the end of (1: until the end of the opponent's next turn). */
  rolloutTurns: number;
  /** Decisions a rollout may take before it stops. */
  rolloutDecisions: number;
  /** 0: play the most visited action; above 0, sample from visits ^ (1 / temperature). */
  temperature: number;
  /** Chance to play a uniformly random legal action instead of searching. */
  blunder: number;
}

export const ISMCTS_DEFAULTS: IsmctsSettings = {
  iterations: 1000,
  maxMs: 1000,
  exploration: 0.7,
  rollout: "weighted",
  rolloutTurns: 1,
  rolloutDecisions: 60,
  temperature: 0,
  blunder: 0,
};

/** Reads ISMCTS settings from a bot's settings, with defaults. */
export function ismctsSettings(settings: BotSettings): IsmctsSettings {
  const out = { ...ISMCTS_DEFAULTS } as Record<string, number | string>;
  for (const key of Object.keys(ISMCTS_DEFAULTS)) {
    const value = settings[key];
    if (value === undefined) continue;
    out[key] = key === "rollout" ? String(value) : Number(value);
  }
  return out as unknown as IsmctsSettings;
}

/** The card behind an instance id, wherever it is in the state. */
function cardIdOf(state: GameState, instanceId: string): number | null {
  for (const p of state.players)
    for (const list of [
      p.hand,
      p.deck,
      p.discard,
      p.monsterDeck,
      p.invadingMonsterZone,
    ]) {
      const found = list.find((c: CardInstance) => c.instanceId === instanceId);
      if (found) return found.cardId;
    }
  return null;
}

/**
 * A key for an action that does not depend on hidden instance ids: type + card id + zone or
 * strategy zone, and for choices the kind and the option's card id (or its id when it names no
 * card: a zone, yes/no, done). Determinizations then share tree nodes.
 */
export function actionKey(state: GameState, action: Action): string {
  switch (action.type) {
    case "playBattle":
      // A play on top of the card there (M2, EBP03-051) is a different move.
      return `playBattle:${cardIdOf(state, action.cardInstanceId)}:${action.zone}${action.onTop ? ":onTop" : ""}`;
    case "activateStrategy":
      return `activateStrategy:${cardIdOf(state, action.cardInstanceId)}:${action.strategyZone}`;
    case "gainRage":
    case "playMonster":
    case "invade":
      return `${action.type}:${cardIdOf(state, action.cardInstanceId)}`;
    case "choose": {
      const choice = state.pendingChoice;
      const option = choice?.options.find((o) => o.id === action.optionId);
      const named =
        option?.cardId !== null && option?.cardId !== undefined
          ? `card${option.cardId}`
          : action.optionId;
      return `choose:${choice?.kind}:${option?.abilityId ?? ""}:${named}`;
    }
    default:
      return action.type;
  }
}

interface Node {
  /** The player who chose the action leading here (values are from their side). */
  player: PlayerId | null;
  visits: number;
  /** Times this node was available to be chosen, for UCB1 (ISMCTS). */
  available: number;
  value: number;
  children: Map<string, Node>;
}

const newNode = (player: PlayerId | null): Node => ({
  player,
  visits: 0,
  available: 0,
  value: 0,
  children: new Map(),
});

const decider = (state: GameState): PlayerId =>
  state.pendingChoice?.player ?? state.turnPlayer;

const playable = (state: GameState): Action[] =>
  getLegalActions(state, decider(state)).filter((a) => a.type !== "concede");

/** Plays a rollout from `start` and returns its value for `me`. */
function rollout(
  start: GameState,
  me: PlayerId,
  settings: IsmctsSettings,
  input: BotInput,
): number {
  if (settings.rollout === "none" || start.result !== null)
    return evaluate(start, me);
  const pick = pickWith(input.rng);
  let state = start;
  let opponentTurnsEnded = 0;
  for (let n = 0; n < settings.rolloutDecisions && state.result === null; n++) {
    const options = playable(state);
    if (options.length === 0) break;
    let action: Action;
    if (settings.rollout === "greedy") {
      // Greedy reads the full simulated state directly (it is already a determinization).
      const scores = options.map((a) =>
        evaluate(advanceToDecision(applyAction(state, a)), decider(state)),
      );
      const best = Math.max(...scores);
      action = options[scores.indexOf(best)] as Action;
    } else action = weightedPick(stateBoard(state), options, pick);
    const turnBefore = state.turn;
    const turnPlayerBefore = state.turnPlayer;
    state = advanceToDecision(applyAction(state, action));
    if (state.turn !== turnBefore && turnPlayerBefore !== me) {
      opponentTurnsEnded++;
      if (opponentTurnsEnded >= settings.rolloutTurns) break;
    }
  }
  return evaluate(state, me);
}

/** UCB1 with availability counts, from the deciding player's side. */
function ucb(child: Node, exploration: number): number {
  if (child.visits === 0) return Infinity;
  return (
    child.value / child.visits +
    exploration *
      Math.sqrt(Math.log(Math.max(1, child.available)) / child.visits)
  );
}

/** Runs the search; returns root children by key, and the root keys of the real legal actions. */
export function search(input: BotInput, settings: IsmctsSettings) {
  const { view, knowledge, rng } = input;
  const me = view.viewer as PlayerId;
  const root = newNode(null);
  const started = Date.now();
  let rootKeys: string[] = [];
  let iterations = 0;
  while (
    iterations < settings.iterations &&
    Date.now() - started < settings.maxMs
  ) {
    iterations++;
    let state = determinize(view, knowledge, rng);
    if (iterations === 1)
      rootKeys = input.legalActions.map((a) => actionKey(state, a));
    let node = root;
    const path: Node[] = [];
    // Selection and expansion.
    while (state.result === null) {
      const options = playable(state);
      if (options.length === 0) break;
      const who = decider(state);
      const keyed = options.map((a) => ({
        action: a,
        key: actionKey(state, a),
      }));
      for (const { key } of keyed) {
        const child = node.children.get(key);
        if (child) child.available++;
      }
      const untried = keyed.filter(({ key }) => !node.children.has(key));
      let next: { action: Action; key: string };
      if (untried.length > 0) {
        next = untried[Math.floor(rng() * untried.length)] as {
          action: Action;
          key: string;
        };
        const child = newNode(who);
        child.available = 1;
        node.children.set(next.key, child);
        state = advanceToDecision(applyAction(state, next.action));
        node = child;
        path.push(child);
        break;
      }
      let best = -Infinity;
      next = keyed[0] as { action: Action; key: string };
      for (const k of keyed) {
        const score = ucb(
          node.children.get(k.key) as Node,
          settings.exploration,
        );
        if (score > best) {
          best = score;
          next = k;
        }
      }
      state = advanceToDecision(applyAction(state, next.action));
      node = node.children.get(next.key) as Node;
      path.push(node);
    }
    // Simulation and backpropagation.
    const value = rollout(state, me, settings, input);
    for (const n of path) {
      n.visits++;
      n.value += n.player === me ? value : -value;
    }
  }
  return { root, rootKeys, iterations, ms: Date.now() - started };
}

export const ismctsBot: Bot = {
  name: "ismcts",
  chooseAction: (input) => {
    const { legalActions, rng } = input;
    if (legalActions.length === 1) return legalActions[0] as Action;
    const settings = ismctsSettings(input.settings);
    if (settings.blunder > 0 && rng() < settings.blunder)
      return legalActions[Math.floor(rng() * legalActions.length)] as Action;
    const { root, rootKeys } = search(input, settings);
    const visits = rootKeys.map((key) => root.children.get(key)?.visits ?? 0);
    if (settings.temperature > 0) {
      const weights = visits.map((v) => Math.pow(v, 1 / settings.temperature));
      const total = weights.reduce((a, b) => a + b, 0);
      if (total > 0) {
        let roll = rng() * total;
        for (const [i, w] of weights.entries())
          if ((roll -= w) < 0) return legalActions[i] as Action;
      }
    }
    const most = Math.max(...visits);
    const ties = legalActions.filter((_, i) => visits[i] === most);
    return ties[Math.floor(rng() * ties.length)] as Action;
  },
};

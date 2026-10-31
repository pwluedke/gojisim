import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  type GameState,
  getLegalActions,
  type PlayerId,
} from "@gojisim/engine";
import {
  pickWith,
  plausiblePick,
  stateBoard,
  tacticalPick,
  weightedPick,
} from "./baseline";
import { determinize } from "./determinize";
import { DEFAULT_WEIGHTS, evaluate, type Weights } from "./evaluate";
import { deadKeys } from "./prune";
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
  rollout: "none" | "weighted" | "greedy" | "tactical";
  /** Opponent turns a rollout plays to the end of (1: until the end of the opponent's next turn). */
  rolloutTurns: number;
  /** Decisions a rollout may take before it stops. */
  rolloutDecisions: number;
  /** 0: play the most visited action; above 0, sample from visits ^ (1 / temperature). */
  temperature: number;
  /** Chance to blunder instead of searching: a plausible pick (`plausiblePick`, #132). */
  blunder: number;
  /** 1: a blunder is a uniformly random legal action, as before #132 (for comparisons). */
  uniformBlunder: number;
  /** M13a: 1 leaves dead strategy activations (`prune.ts`) out of the root's actions. */
  prune: number;
  /**
   * M13c (#75): virtual visits a new node starts with at its static evaluation (progressive
   * bias), so a clear static preference isn't erased by play-out noise. 0 is off.
   */
  priorVisits: number;
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
  uniformBlunder: 0,
  prune: 0,
  priorVisits: 0,
};

/** Reads ISMCTS settings from a bot's settings, with defaults. */
export function ismctsSettings(settings: BotSettings): IsmctsSettings {
  const out = { ...ISMCTS_DEFAULTS } as Record<string, number | string>;
  for (const key of Object.keys(ISMCTS_DEFAULTS)) {
    const value = settings[key];
    if (value === undefined) continue;
    out[key] = key === "rollout" ? String(value) : Number(value);
  }
  const overrides = Object.fromEntries(
    Object.entries(settings)
      .filter(([key]) => key.startsWith("w."))
      .map(([key, value]) => [key.slice(2), Number(value)]),
  );
  return {
    ...(out as unknown as IsmctsSettings),
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
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
      // A play on top of the card there (M2, EBP03-051) is a different move, and so is each
      // card that pays a play cost (M2, EBP04-045).
      return `playBattle:${cardIdOf(state, action.cardInstanceId)}:${action.zone}${action.onTop ? ":onTop" : ""}${action.costCardInstanceId ? `:cost${cardIdOf(state, action.costCardInstanceId)}` : ""}`;
    case "activateStrategy":
      return `activateStrategy:${cardIdOf(state, action.cardInstanceId)}:${action.strategyZone}`;
    case "playMonster":
      // M2 (Q22): each monster deck card that may go under the monster is its own move.
      return `playMonster:${cardIdOf(state, action.cardInstanceId)}${action.underInstanceId ? `:under${cardIdOf(state, action.underInstanceId)}` : ""}`;
    case "gainRage":
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

/**
 * The evaluation weights, with any single weights overridden by `w.<feature>` settings (M13a
 * tuning, e.g. `w.position=0.8`).
 */
function weightsOf(settings: IsmctsSettings): Weights {
  const weights = DEFAULT_WEIGHTS;
  const overrides = (settings as unknown as { overrides?: Partial<Weights> })
    .overrides;
  return overrides ? { ...weights, ...overrides } : weights;
}

/** Plays a rollout from `start` and returns its value for `me`. */
function rollout(
  start: GameState,
  me: PlayerId,
  settings: IsmctsSettings,
  input: BotInput,
): number {
  const weights = weightsOf(settings);
  if (settings.rollout === "none" || start.result !== null)
    return evaluate(start, me, weights);
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
        evaluate(
          advanceToDecision(applyAction(state, a)),
          decider(state),
          weights,
        ),
      );
      const best = Math.max(...scores);
      action = options[scores.indexOf(best)] as Action;
    } else if (settings.rollout === "tactical")
      action = tacticalPick(state, options, pick);
    else action = weightedPick(stateBoard(state), options, pick);
    const turnBefore = state.turn;
    const turnPlayerBefore = state.turnPlayer;
    state = advanceToDecision(applyAction(state, action));
    if (state.turn !== turnBefore && turnPlayerBefore !== me) {
      opponentTurnsEnded++;
      if (opponentTurnsEnded >= settings.rolloutTurns) break;
    }
  }
  return evaluate(state, me, weights);
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
  // M13a: root actions whose only effect is moving a card out of the hand (`prune.ts`), judged
  // once on the first determinization from public information (the bot's own hand, both boards).
  let dead = new Set<string>();
  let iterations = 0;
  while (
    iterations < settings.iterations &&
    Date.now() - started < settings.maxMs
  ) {
    iterations++;
    let state = determinize(view, knowledge, rng);
    if (iterations === 1) {
      rootKeys = input.legalActions.map((a) => actionKey(state, a));
      const first = state;
      if (settings.prune > 0)
        dead = deadKeys(first, input.legalActions, me, (a) =>
          actionKey(first, a),
        );
    }
    let node = root;
    const path: Node[] = [];
    // Selection and expansion.
    while (state.result === null) {
      const all = playable(state);
      const options =
        node === root && dead.size > 0
          ? all.filter((a) => !dead.has(actionKey(state, a)))
          : all;
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
        if (settings.priorVisits > 0) {
          // Its static value from the side of the player who chose it, as visits store it.
          const v = evaluate(state, me, weightsOf(settings));
          child.visits = settings.priorVisits;
          child.value = settings.priorVisits * (who === me ? v : -v);
        }
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
  return { root, rootKeys, dead, iterations, ms: Date.now() - started };
}

/** One decision with its search, for the explain tool (M13a): what was picked and why. */
export interface Decision {
  action: Action;
  /** The pick was a blunder roll (a plausible pick with no search, #132). */
  blundered: boolean;
  /** The root's children by action key, and the legal actions' keys in `legalActions` order. */
  search: ReturnType<typeof search> | null;
}

/** Searches and picks, exactly as `ismctsBot.chooseAction` does. */
export function decide(input: BotInput): Decision {
  const { legalActions, rng } = input;
  if (legalActions.length === 1)
    return {
      action: legalActions[0] as Action,
      blundered: false,
      search: null,
    };
  const settings = ismctsSettings(input.settings);
  if (settings.blunder > 0 && rng() < settings.blunder)
    return {
      action:
        settings.uniformBlunder > 0
          ? (legalActions[Math.floor(rng() * legalActions.length)] as Action)
          : plausiblePick(input.view, [...legalActions], pickWith(rng)),
      blundered: true,
      search: null,
    };
  const result = search(input, settings);
  const { root, rootKeys } = result;
  const visits = rootKeys.map((key) => root.children.get(key)?.visits ?? 0);
  if (settings.temperature > 0) {
    const weights = visits.map((v) => Math.pow(v, 1 / settings.temperature));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total > 0) {
      let roll = rng() * total;
      for (const [i, w] of weights.entries())
        if ((roll -= w) < 0)
          return {
            action: legalActions[i] as Action,
            blundered: false,
            search: result,
          };
    }
  }
  const most = Math.max(...visits);
  const ties = legalActions.filter((_, i) => visits[i] === most);
  return {
    action: ties[Math.floor(rng() * ties.length)] as Action,
    blundered: false,
    search: result,
  };
}

export const ismctsBot: Bot = {
  name: "ismcts",
  chooseAction: (input) => decide(input).action,
};

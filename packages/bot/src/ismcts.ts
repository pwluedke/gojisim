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
import { constructedFutureDead } from "./cfPlay";
import { cfPlanDead } from "./cfPlan";
import { type CfTarget, cfTargetDead } from "./cfTarget";
import { determinize } from "./determinize";
import { finalWarsDead, mxPlanVerdict } from "./mxPlan";
import { mxPlanV2Verdict } from "./mxPlanV2";
import { DEFAULT_WEIGHTS, evaluate, type Weights } from "./evaluate";
import { deadKeys } from "./prune";
import { cardRulesDead, rescuedPlays } from "./cardRules";
import { wranglerVerdict } from "./wranglerPlan";
import { applyRules } from "./rules";
import type { Bot, BotInput, BotSettings, Decklist } from "./types";

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
  /** #175: 1 applies Paul's play rules at the root (`rules.ts`): prunes and prior bonuses. */
  rules: number;
  /** #191: 1 draws the opponent's hidden cards toward a recognized archetype (`recognizer.ts`). */
  recognizer: number;
  /** Paul, Nov 12: 1 applies the card-play rules (`cardRules.ts`), also on with `rules`. */
  cardRules: number;
  /** #305: 1 (the default) has card rule 7 take the counter before the zone 8 block; 0 is the old rule 7. */
  counterFirst: number;
  /** #276: 1 (the default) applies the Wrangler plan (`wranglerPlan.ts`), with `rules` on. */
  wranglerPlan: number;
  /** Paul's Constructed Future plan (`cfPlan.ts`), with `rules` on: 1 (the default) on, 0 off. */
  cfPlan: number;
  /**
   * Paul's Monster X plan, with `rules` on: 2 (the default) v2 (`mxPlanV2.ts`, Nov 9), 1 v1
   * (`mxPlan.ts`, Nov 7), 0 off.
   */
  mxPlan: number;
  /** Paul's Constructed Future test, with `rules` on: which card cost discards aim at (`cfTarget.ts`). */
  cfTarget: CfTarget;
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
  rules: 0,
  recognizer: 0,
  cardRules: 0,
  counterFirst: 1,
  wranglerPlan: 1,
  cfTarget: "auto",
  cfPlan: 1,
  mxPlan: 2,
};

/** Reads ISMCTS settings from a bot's settings, with defaults. */
export function ismctsSettings(settings: BotSettings): IsmctsSettings {
  const out = { ...ISMCTS_DEFAULTS } as Record<string, number | string>;
  for (const key of Object.keys(ISMCTS_DEFAULTS)) {
    const value = settings[key];
    if (value === undefined) continue;
    out[key] =
      key === "rollout" || key === "cfTarget" ? String(value) : Number(value);
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

/**
 * The plans' kills at the root (Constructed Future, the Final Wars ruling), kept apart from the
 * general rules' so they can win a conflict (`combineDead`).
 */
function planDead(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  settings: IsmctsSettings,
): Set<Action> {
  return new Set<Action>([
    // Paul's Constructed Future rules (all cfTarget modes): play it only for a target; with
    // cfPlan on (the default), his plan (cfPlan.ts).
    ...constructedFutureDead(state, actions, me),
    ...(settings.cfPlan > 0 ? cfPlanDead(state, actions, me) : []),
    // Paul's Final Wars ruling (Nov 7): its picks for the highest total counter power.
    ...finalWarsDead(state, actions, me),
    ...cfTargetDead(state, actions, me, settings.cfTarget),
  ]);
}

/**
 * The lasting bias on a root action the Monster X plan favors (#223), in value units ([-1, 1], a
 * win is 1). The plan's move keeps it in the root's UCB scores and its prior, so the search picks
 * another move only when that move's value is higher by more: 0.2 is 10 points of win chance,
 * about 2 standard errors of a move's mean after 100 play-outs.
 */
export const MX_PLAN_BIAS = 0.2;

/**
 * The root actions the Monster X plan favors, by key: the moves it doesn't argue against, while it
 * argues against some and leaves a move that isn't conceding. `version` 2 is v2, 1 is v1.
 */
export function mxPlanFavored(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
  keyOf: (a: Action) => string,
  version = 2,
): Map<string, number> {
  const against =
    version >= 2
      ? mxPlanV2Verdict(state, actions, player)
      : mxPlanVerdict(state, actions, player);
  const keep = actions.filter((a) => a.type !== "concede" && !against.has(a));
  if (against.size === 0 || keep.length === 0) return new Map();
  return new Map(keep.map((a) => [keyOf(a), MX_PLAN_BIAS]));
}

/**
 * The root's dead actions from the prune (`prune.ts`), Paul's general rules (`rules.ts`) and his
 * plans (Constructed Future, the Final Wars ruling): all of them while they leave an action that
 * isn't conceding (#189, the search never concedes). When the general rules and a plan together
 * leave none, the plan wins: its kills stay and the general rules' go. `null` keeps only the prune.
 */
export function combineDead(
  actions: readonly Action[],
  keyOf: (a: Action) => string,
  prune: ReadonlySet<string>,
  general: { dead: ReadonlySet<string>; killed: ReadonlySet<Action> },
  plans: ReadonlySet<Action>,
): { dead: Set<string>; killed: Set<Action> } | null {
  const leaves = (keys: Set<string>) =>
    actions.some((a) => a.type !== "concede" && !keys.has(keyOf(a)));
  const planKeys = [...plans].map(keyOf);
  const all = new Set([...prune, ...general.dead, ...planKeys]);
  if (leaves(all))
    return { dead: all, killed: new Set([...general.killed, ...plans]) };
  const planOnly = new Set([...prune, ...planKeys]);
  if (leaves(planOnly)) return { dead: planOnly, killed: new Set(plans) };
  return null;
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
  // #189: legal actions the rules rule out whose key survives (a held copy): never the pick.
  let avoid = new Set<number>();
  // M13a: root actions whose only effect is moving a card out of the hand (`prune.ts`), judged
  // once on the first determinization from public information (the bot's own hand, both boards).
  let dead = new Set<string>();
  // #175: Paul's rules' prior bonuses for root actions, by key.
  let bonus = new Map<string, number>();
  // Paul's Monster X plan (mxPlan.ts, #223): the root actions it favors, by key, with a lasting
  // bias on their value (`MX_PLAN_BIAS`).
  let favored = new Map<string, number>();
  let iterations = 0;
  while (
    iterations < settings.iterations &&
    Date.now() - started < settings.maxMs
  ) {
    iterations++;
    let state = determinize(view, knowledge, rng, {
      recognizer: settings.recognizer > 0,
    });
    if (iterations === 1) {
      rootKeys = input.legalActions.map((a) => actionKey(state, a));
      const first = state;
      if (settings.prune > 0)
        dead = deadKeys(first, input.legalActions, me, (a) =>
          actionKey(first, a),
        );
      if (settings.rules > 0) {
        const verdict = applyRules(first, input.legalActions, me, (a) =>
          actionKey(first, a),
        );
        const plans = planDead(first, input.legalActions, me, settings);
        bonus = verdict.bonus;
        const keep = combineDead(
          input.legalActions,
          (a) => actionKey(first, a),
          dead,
          verdict,
          plans,
        );
        if (keep) {
          dead = keep.dead;
          avoid = new Set(
            input.legalActions.flatMap((a, i) =>
              keep.killed.has(a) ? [i] : [],
            ),
          );
        }
      }
    }
    // Paul, Nov 12: the card-play rules (Medium and Hard), while they leave a move that isn't
    // conceding.
    // `cardRules` (on from Medium up) alone switches them, so a check can turn them off at Hard.
    if (iterations === 1 && settings.cardRules > 0) {
      const first = state;
      const options = { counterFirst: settings.counterFirst > 0 };
      const unsafe = cardRulesDead(
        first,
        input.legalActions,
        me,
        input.knowledge.decks[me],
        options,
      );
      const keys = new Set([
        ...dead,
        ...[...unsafe].map((a) => actionKey(first, a)),
      ]);
      // Rules 7 and 9 (#265, #274): a way to block zone 8, else to make the counter, outranks
      // Paul's rules' holds too.
      const blocks = rescuedPlays(
        first,
        input.legalActions,
        me,
        input.knowledge.decks[me],
        options,
      );
      for (const a of blocks) keys.delete(actionKey(first, a));
      if (blocks.size > 0)
        avoid = new Set(
          [...avoid].filter(
            (i) => !blocks.has(input.legalActions[i] as Action),
          ),
        );
      if (
        (unsafe.size > 0 || blocks.size > 0) &&
        input.legalActions.some(
          (a) => a.type !== "concede" && !keys.has(actionKey(first, a)),
        )
      ) {
        dead = keys;
        avoid = new Set([
          ...avoid,
          ...input.legalActions.flatMap((a, i) => (unsafe.has(a) ? [i] : [])),
        ]);
      }
    }
    if (iterations === 1 && settings.rules > 0 && settings.mxPlan > 0)
      favored = mxPlanFavored(
        state,
        input.legalActions,
        me,
        (a) => actionKey(state, a),
        settings.mxPlan,
      );
    // #276: the Wrangler plan, a preference like the Monster X plan, that frees what its line
    // needs from Paul's rules' holds.
    if (iterations === 1 && settings.rules > 0 && settings.wranglerPlan > 0) {
      const first = state;
      const { against, rescued } = wranglerVerdict(
        first,
        input.legalActions,
        me,
        input.knowledge.decks[me],
        input.knowledge.decks[first.players.find((p) => p.id !== me)?.id ?? ""],
      );
      for (const a of rescued) dead.delete(actionKey(first, a));
      avoid = new Set(
        [...avoid].filter((i) => !rescued.has(input.legalActions[i] as Action)),
      );
      if (against.size > 0)
        for (const a of input.legalActions)
          if (a.type !== "concede" && !against.has(a))
            favored.set(
              actionKey(first, a),
              Math.max(favored.get(actionKey(first, a)) ?? 0, MX_PLAN_BIAS),
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
      const fresh = keyed.filter(({ key }) => !node.children.has(key));
      // The plan's moves are tried first at the root.
      const first =
        node === root ? fresh.filter(({ key }) => favored.has(key)) : [];
      const untried = first.length > 0 ? first : fresh;
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
          // #175: a root action a rule prefers starts a little ahead (`rules.ts`).
          const lift =
            node === root
              ? (bonus.get(next.key) ?? 0) + (favored.get(next.key) ?? 0)
              : 0;
          child.visits = settings.priorVisits;
          child.value = settings.priorVisits * ((who === me ? v : -v) + lift);
        }
        node = child;
        path.push(child);
        break;
      }
      let best = -Infinity;
      next = keyed[0] as { action: Action; key: string };
      for (const k of keyed) {
        const score =
          ucb(node.children.get(k.key) as Node, settings.exploration) +
          (node === root ? (favored.get(k.key) ?? 0) : 0);
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
  return { root, rootKeys, dead, avoid, iterations, ms: Date.now() - started };
}

/** One decision with its search, for the explain tool (M13a): what was picked and why. */
export interface Decision {
  action: Action;
  /** The pick was a blunder roll (a plausible pick with no search, #132). */
  blundered: boolean;
  /** The root's children by action key, and the legal actions' keys in `legalActions` order. */
  search: ReturnType<typeof search> | null;
}

/** The moves the card-play rules allow (`cardRules.ts`), or all of them when they'd leave none. */
function cardRulesSafe(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own?: Decklist,
  counterFirst = 1,
): Action[] {
  const unsafe = cardRulesDead(state, actions, me, own, {
    counterFirst: counterFirst > 0,
  });
  const safe = actions.filter((a) => !unsafe.has(a) && a.type !== "concede");
  return safe.length > 0 ? actions.filter((a) => !unsafe.has(a)) : [...actions];
}

/**
 * The moves a blunder pick (#132, no search) chooses among with Paul's rules on (#189): what the
 * general rules and the plans leave, as at the search root (#223), and of those the Monster X
 * plan's moves when it has any.
 */
export function blunderAllowed(
  state: GameState,
  legalActions: readonly Action[],
  me: PlayerId,
  settings: IsmctsSettings,
  /** The bot's own decklist, for the card-play rules (rule 6). */
  own?: Decklist,
): Action[] {
  const keyOf = (a: Action) => actionKey(state, a);
  const keep = combineDead(
    legalActions,
    keyOf,
    new Set(),
    applyRules(state, legalActions, me, keyOf),
    planDead(state, legalActions, me, settings),
  );
  const kept = keep
    ? legalActions.filter(
        (a) => !keep.killed.has(a) && !keep.dead.has(keyOf(a)),
      )
    : [...legalActions];
  const safe = cardRulesSafe(state, kept, me, own, settings.counterFirst);
  const allowed =
    safe.length > 0 ? safe : kept.length > 0 ? kept : [...legalActions];
  if (settings.mxPlan === 0) return allowed;
  const favored = mxPlanFavored(state, allowed, me, keyOf, settings.mxPlan);
  const planned = allowed.filter((a) => favored.has(keyOf(a)));
  return planned.length > 0 ? planned : allowed;
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
  if (settings.blunder > 0 && rng() < settings.blunder) {
    // #189: with Paul's rules on, a blunder picks only among the moves the rules allow; with
    // the card-play rules (Medium), never a move they leave out.
    const allowed =
      settings.rules > 0
        ? blunderAllowed(
            determinize(input.view, input.knowledge, rng),
            legalActions,
            input.view.viewer as PlayerId,
            settings,
            input.knowledge.decks[input.view.viewer as PlayerId],
          )
        : settings.cardRules > 0
          ? cardRulesSafe(
              determinize(input.view, input.knowledge, rng),
              legalActions,
              input.view.viewer as PlayerId,
              input.knowledge.decks[input.view.viewer as PlayerId],
              settings.counterFirst,
            )
          : [...legalActions];
    return {
      action:
        settings.uniformBlunder > 0
          ? (allowed[Math.floor(rng() * allowed.length)] as Action)
          : plausiblePick(input.view, allowed, pickWith(rng)),
      blundered: true,
      search: null,
    };
  }
  const result = search(input, settings);
  const { root, rootKeys, avoid } = result;
  // An avoided action has no visits of its own; its key's visits go to a copy that isn't.
  const visits = rootKeys.map((key, i) =>
    avoid.has(i) ? 0 : (root.children.get(key)?.visits ?? 0),
  );
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
  const tied = legalActions.flatMap((a, i) => (visits[i] === most ? [i] : []));
  const preferred = tied.filter((i) => !avoid.has(i));
  const ties = (preferred.length > 0 ? preferred : tied).map(
    (i) => legalActions[i] as Action,
  );
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

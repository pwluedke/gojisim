import {
  type BotSettings,
  type Decision,
  actionKey,
  botInput,
  decide,
  decklistsOf,
  difficultySettings,
  evaluate,
  features,
  seededRng,
} from "@gojisim/bot";
import {
  type Action,
  type GameRecord,
  type GameState,
  type PlayerId,
  replay,
} from "@gojisim/engine";

/**
 * One bot decision from a game record (M13a), for `pnpm bot-explain` and `pnpm bot-positions`:
 * the state after `at` actions, and the bot's decision there from its own view (`botInput`, so
 * no peeking). Settings are the difficulty's (decision 184) with no time limit by default, so a
 * run is reproducible on any machine.
 */
export interface DecisionRun {
  state: GameState;
  player: PlayerId;
  decision: Decision;
  /** Every legal action with its key, label and search stats, in `getLegalActions` order. */
  rows: {
    action: Action;
    key: string;
    label: string;
    visits: number;
    /** Mean value from the bot's side, or null when never visited. */
    mean: number | null;
    chosen: boolean;
  }[];
}

export interface DecisionOptions {
  seed: string;
  difficulty: number;
  /** Extra ISMCTS settings, e.g. `{ maxMs: 1000 }` to use the browser's time budget. */
  settings?: BotSettings;
}

/** The decider's view of a card instance id, as "Name [number]". */
function cardLabel(state: GameState, instanceId: string | undefined): string {
  if (!instanceId) return "";
  for (const p of state.players)
    for (const list of [
      p.hand,
      p.deck,
      p.discard,
      p.monsterDeck,
      p.invadingMonsterZone,
      ...Object.values(p.zones).flat(),
      ...p.strategyZones.map((z) => z.map((x) => x.card)),
    ]) {
      const found = list.find((c) => c.instanceId === instanceId);
      if (found) {
        const card = state.cards[found.cardId];
        return card ? `${card.name} [${card.cardNumber}]` : `#${found.cardId}`;
      }
    }
  return instanceId;
}

/** A short label for an action, for the tools' tables. */
export function actionText(state: GameState, action: Action): string {
  switch (action.type) {
    case "playBattle":
      return `play ${cardLabel(state, action.cardInstanceId)} → zone ${action.zone}${action.onTop ? " (on top)" : ""}${action.costCardInstanceId ? ` paying ${cardLabel(state, action.costCardInstanceId)}` : ""}`;
    case "activateStrategy":
      return `activate ${cardLabel(state, action.cardInstanceId)} → strategy ${action.strategyZone}`;
    case "playMonster":
      return `play monster ${cardLabel(state, action.cardInstanceId)}`;
    case "gainRage":
      return `rage: discard ${cardLabel(state, action.cardInstanceId)}`;
    case "invade":
      return `invade: discard ${cardLabel(state, action.cardInstanceId)}`;
    case "choose": {
      const choice = state.pendingChoice;
      const option = choice?.options.find((o) => o.id === action.optionId);
      const card =
        option?.cardId !== null && option?.cardId !== undefined
          ? state.cards[option.cardId]
          : undefined;
      return `choose (${choice?.kind} ${choice?.rule}) ${card ? `${card.name} [${card.cardNumber}]` : action.optionId}`;
    }
    default:
      return action.type;
  }
}

export function runDecision(
  record: GameRecord,
  at: number,
  options: DecisionOptions,
): DecisionRun {
  const state = replay(record, at);
  if (state.result) throw new Error(`The game is over after ${at} actions`);
  const player = (state.pendingChoice?.player ?? state.turnPlayer) as PlayerId;
  const settings: BotSettings = {
    ...difficultySettings(options.difficulty),
    maxMs: Number.POSITIVE_INFINITY,
    ...options.settings,
  };
  // Q42: the opponent's decklist only with `--set knowsDecklists=true`; the game's date for the
  // restriction list a guessed deck follows.
  const input = botInput(
    state,
    player,
    decklistsOf(record.decks),
    seededRng(options.seed),
    settings,
    record.deckLegality?.[0]?.asOf,
  );
  const decision = decide(input);
  const chosenKey = actionKey(state, decision.action);
  const rows = input.legalActions.map((action) => {
    const key = actionKey(state, action);
    const node = decision.search?.root.children.get(key);
    return {
      action,
      key,
      label: actionText(state, action),
      visits: node?.visits ?? 0,
      // Root children are valued from the bot's side (the bot chose them).
      mean: node && node.visits > 0 ? node.value / node.visits : null,
      chosen: key === chosenKey,
    };
  });
  return { state, player, decision, rows };
}

/** The bot's static evaluation of `state` and its features, for the explain output. */
export function evaluation(state: GameState, player: PlayerId) {
  return { value: evaluate(state, player), features: features(state, player) };
}

/** Bot settings from `key=value` pairs separated by commas; numbers stay numbers. */
export function parseSettings(text: string): BotSettings {
  return Object.fromEntries(
    text
      .split(",")
      .filter((pair) => pair.includes("="))
      .map((pair) => {
        const [key = "", value = ""] = pair.split("=");
        const n = Number(value);
        return [key.trim(), Number.isNaN(n) ? value.trim() : n];
      }),
  );
}

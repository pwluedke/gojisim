import { type BotInput, PRESETS } from "@gojisim/bot";
import {
  type Action,
  type CardInstance,
  type GameState,
  getPlayerView,
  type PlayerId,
  type SeatRecord,
  type Viewer,
} from "@gojisim/engine";
import { actionLabel } from "./labels";

/** A seat in the new game form (M6d). */
export type SeatConfig =
  | { kind: "human" }
  | { kind: "bot"; difficulty: number }
  /** M9b: the other player in a head to head game, who plays from their own browser. */
  | { kind: "online" };

/**
 * Beta (Paul, Nov 13, 2026): every bot seat in a new /play game plays at this difficulty, and the
 * difficulty controls are locked; `null` unlocks them after the beta. Loaded records keep their
 * recorded level; /debug and tools/bots aren't locked.
 */
export const BETA_BOT_DIFFICULTY: number | null = 100;

/** The note beside the locked controls, and their tooltip. */
export const BETA_LOCK_NOTE =
  "Bot difficulty is locked to Hard during the beta.";

/**
 * Beta (Ian and Tuscancow, Nov 14, 2026): a new /play game against a bot starts with Show
 * opponent's hand on, so testers can see why the bot plays what it plays; players can still turn
 * it off. `false` after the beta.
 */
export const BETA_SHOW_BOT_HAND = true;

/**
 * The e2e specs pick bot levels for what they test (an Easy bot's moves, a quick bot game) and
 * test the hidden bot hand, so their dev server reads this key and leaves the beta's defaults off
 * (the level unlocked, the hand hidden); production builds never do.
 */
export const E2E_UNLOCK_KEY = "gojisim.e2e.unlockBotLevel";

/** Whether the e2e dev server turned the beta's defaults off (`E2E_UNLOCK_KEY`). */
function e2eUnlocked(): boolean {
  // Vite's dev flag; tools/bots imports this file outside Vite, where it's absent (locked).
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  if (!env?.DEV) return false;
  try {
    return localStorage.getItem(E2E_UNLOCK_KEY) === "1";
  } catch {
    // No storage (a worker, a locked-down browser): the beta's defaults hold.
    return false;
  }
}

/** The locked bot level, or `null` when unlocked (after the beta, or in the e2e dev server). */
export function lockedBotLevel(): number | null {
  return e2eUnlocked() ? null : BETA_BOT_DIFFICULTY;
}

/** Whether a new game against a bot starts with Show opponent's hand on (the beta's default). */
export function betaShowsBotHand(): boolean {
  return BETA_SHOW_BOT_HAND && !e2eUnlocked();
}

/** A new bot seat's level: the locked one, else Medium. */
export function defaultBotDifficulty(): number {
  return lockedBotLevel() ?? PRESETS.medium;
}

/** A seat as it plays: during the beta, a bot seat at the locked level whatever it says. */
export function lockSeat(seat: SeatConfig): SeatConfig {
  const level = lockedBotLevel();
  return level !== null && seat.kind === "bot"
    ? { kind: "bot", difficulty: level }
    : seat;
}

/** The bot every bot seat runs: ISMCTS with the difficulty slider (M6c). */
export const SEAT_BOT = "ismcts";

export function seatRecord(seat: SeatConfig): SeatRecord {
  // An online seat is a human in their own browser (the server writes head to head records).
  return seat.kind !== "bot"
    ? { kind: "human" }
    : { kind: "bot", bot: SEAT_BOT, settings: { difficulty: seat.difficulty } };
}

export function seatFromRecord(record: SeatRecord | undefined): SeatConfig {
  if (record?.kind !== "bot") return { kind: "human" };
  return {
    kind: "bot",
    difficulty: Number(record.settings["difficulty"] ?? PRESETS.medium),
  };
}

/** "Easy", "Medium", "Hard" for the presets, else "Level 70". */
export function difficultyName(difficulty: number): string {
  const preset = Object.entries(PRESETS).find(([, d]) => d === difficulty)?.[0];
  return preset
    ? `${preset[0]?.toUpperCase()}${preset.slice(1)}`
    : `Level ${difficulty}`;
}

/** What the worker gets for one decision: the bot's input (no real state) and a seed. */
export interface BotRequest {
  id: number;
  input: Omit<BotInput, "rng">;
  seed: string;
  difficulty: number;
}

export type BotResponse =
  { id: number; action: Action; ms: number } | { id: number; error: string };

/**
 * A short log label for a bot action, e.g. "Bot (Hard): Play Super-X [ESD02-009] → zone 8". With
 * hidden cards hidden, a private choice (a searched deck, its own hand) says only that it chose.
 */
export function botLabel(
  state: GameState,
  action: Action,
  difficulty: number,
  hideHidden: boolean,
): string {
  const who = `Bot (${difficultyName(difficulty)})`;
  if (hideHidden && action.type === "choose" && state.pendingChoice?.private)
    return `${who}: makes a private choice`;
  return `${who}: ${actionLabel(state, action)}`;
}

/**
 * The state as `viewer` may see it, for display: hidden hands and monster decks become card backs
 * (`cardId: -1`), except cards revealed to everyone (5.10). Deck order is never shown anyway.
 */
export function displayState(state: GameState, viewer: Viewer): GameState {
  const view = getPlayerView(state, viewer);
  const back = (owner: PlayerId, where: string, i: number): CardInstance => ({
    instanceId: `back-${owner}-${where}-${i}`,
    cardId: -1,
    owner,
  });
  const players = state.players.map((player, i) => {
    const pv = view.players[i];
    if (!pv) return player;
    const revealed = view.revealed.filter((r) => r.player === player.id);
    const mask = (
      cards: CardInstance[],
      area: "hand" | "monsterDeck",
      shown: unknown[] | null,
    ) =>
      shown !== null
        ? cards
        : cards.map((c, n) =>
            revealed.some(
              (r) => r.area === area && r.card.instanceId === c.instanceId,
            )
              ? c
              : back(player.id, area, n),
          );
    return {
      ...player,
      hand: mask(player.hand, "hand", pv.hand.cards),
      monsterDeck: mask(
        player.monsterDeck,
        "monsterDeck",
        pv.monsterDeck.cards,
      ),
    };
  }) as GameState["players"];
  return { ...state, players };
}

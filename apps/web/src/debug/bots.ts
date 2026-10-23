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
  { kind: "human" } | { kind: "bot"; difficulty: number };

/** The bot every bot seat runs: ISMCTS with the difficulty slider (M6c). */
export const SEAT_BOT = "ismcts";

export function seatRecord(seat: SeatConfig): SeatRecord {
  return seat.kind === "human"
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

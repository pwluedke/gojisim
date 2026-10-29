import type { Card } from "@gojisim/cards";
import type { Action, LogEntry, PlayerId, PlayerView } from "@gojisim/engine";

/** A player's monster deck and main deck. */
export interface Decklist {
  monsterDeck: Card[];
  mainDeck: Card[];
}

/**
 * What a bot knows besides its view: its own decklist and the public log so far. Never the real
 * state. At setup the opponent presents a deck and 4 monsters, never their contents (6.3.1.1,
 * Q42), so the opponent's decklist is here only for the tools' `knowsDecklists` comparison.
 */
export interface Knowledge {
  decks: Partial<Record<PlayerId, Decklist>>;
  log: LogEntry[];
  /** The game's date (ISO), for the restriction list a guessed deck follows; today if absent. */
  asOf?: string;
}

/** Bot tuning (difficulty, time budget, ...). Each bot reads its own keys. */
export type BotSettings = Record<string, number | string | boolean>;

export interface BotInput {
  /** `getPlayerView(state, botId)`: everything the bot may see. */
  view: PlayerView;
  /** The bot's legal actions (concede left out). */
  legalActions: Action[];
  knowledge: Knowledge;
  /** Uniform in [0, 1), seeded by the caller, so a game is reproducible. */
  rng: () => number;
  settings: BotSettings;
}

export interface Bot {
  name: string;
  chooseAction(input: BotInput): Action;
  /**
   * Tools only: the harness gives this bot both decklists (`knowsDecklists`), as every bot had
   * before Q42 (`hard-m12`, `hard-open`). The web app never seats such a bot.
   */
  knowsDecklists?: boolean;
}

import type { Card } from "@gojisim/cards";
import type { Action, LogEntry, PlayerId, PlayerView } from "@gojisim/engine";

/** A deck as presented at setup (6.3.1.1): public to both players. */
export interface Decklist {
  monsterDeck: Card[];
  mainDeck: Card[];
}

/**
 * What a bot knows besides its view: both decklists (players present their decks at setup,
 * 6.3.1.1) and the public log so far. Never the real state.
 */
export interface Knowledge {
  decks: Record<PlayerId, Decklist>;
  log: LogEntry[];
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
}

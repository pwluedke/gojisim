import type { Card } from "@gojisim/cards";

export type PlayerId = string;

/** A zone number, 1 to 8 (4.4.3). */
export type ZoneNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const ZONE_NUMBERS: readonly ZoneNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** A physical card in the game. */
export interface CardInstance {
  /**
   * Object identity. A card gets a fresh id each time it moves to another area, except for a
   * move from zone to zone (4.1.4).
   */
  instanceId: string;
  /** `Card.id` in `cards.json` (or a test fixture), looked up in `GameState.cards`. */
  cardId: number;
  owner: PlayerId;
}

/**
 * Cards stacked on each other, bottom first. A stack counts as one card and only the top card's
 * information is read unless an effect says otherwise (3.2).
 */
export type CardStack = CardInstance[];

/** A strategy card in a strategy zone, with the turn it was placed (7.2.3). */
export interface StrategyPlacement {
  card: CardInstance;
  placedOnTurn: number;
}

export interface PlayerState {
  id: PlayerId;
  /** Zones 1 to 8 (4.4). Each normally holds at most one battle card stack (11.5). */
  zones: Record<ZoneNumber, CardStack[]>;
  /** The 2 strategy zones (4.5). Each normally holds at most one strategy card (11.5). */
  strategyZones: [StrategyPlacement[], StrategyPlacement[]];
  /** Monster cards not yet played (4.6). Hidden from the opponent. */
  monsterDeck: CardInstance[];
  /** The invading monster stack (4.7); the top card is the active monster (3.2.3.1). */
  invadingMonsterZone: CardStack;
  /** Zone the invading monster occupies (3.3.3); `null` before setup places it. */
  monsterPosition: ZoneNumber | null;
  /** Main deck, top card first (4.8). Hidden from both players. */
  deck: CardInstance[];
  /** Hidden from the opponent (4.9). */
  hand: CardInstance[];
  discard: CardInstance[];
  /** Integer, never below 0 (3.4). */
  rage: number;
}

export type Phase = "start" | "main" | "counter" | "end";

/**
 * Engine steps, named by rule number, in the order a turn runs them (spec "Turn structure").
 * `7.3.2` is the turn player's play timing, where the engine waits for an action.
 */
export const STEPS = [
  "7.2.1",
  "7.2.2",
  "7.2.3",
  "7.2.4",
  "7.2.5",
  "7.3.1",
  "7.3.2",
  "7.4.1",
  "7.4.2",
  "7.4.3",
  "7.4.4",
  "7.5.1",
  "7.5.2",
  "7.5.3",
  "7.5.4",
  "7.5.5",
  "7.5.6",
  "7.5.7",
] as const;

export type Step = (typeof STEPS)[number];

/** An automatic ability waiting for a check timing (10.6.2). Filled in from M3d. */
export interface StandbyAbility {
  abilityId: string;
  controller: PlayerId;
  sourceInstanceId: string;
}

/** A continuous effect in force, ordered by timestamp (10.8.1.7). Filled in from M3d. */
export interface ContinuousEffect {
  effectId: string;
  timestamp: number;
  duration: "untilEndOfTurn" | "whileSourceActive" | "permanent";
}

export type ResultReason =
  | "invasion"
  | "counter"
  | "concession"
  | "effect"
  | "bothLost"
  | "infiniteLoop";

export interface GameResult {
  /** `null` for a draw. */
  winner: PlayerId | null;
  reason: ResultReason;
  rule: string;
}

export interface LogEntry {
  seq: number;
  type: string;
  /** The player the entry is about; `null` for game-level entries. */
  player: PlayerId | null;
  /** Public information only, so the log can go to every viewer unfiltered. */
  payload: Record<string, unknown>;
}

/** The whole game as plain, serializable JSON (no classes, no Maps). */
export interface GameState {
  version: 1;
  /** Normalized 32-bit seed. Never sent to clients. */
  seed: number;
  /** Current mulberry32 state. Never sent to clients. */
  rngState: number;
  nextInstanceId: number;
  nextTimestamp: number;
  players: [PlayerState, PlayerState];
  /** Shared by both players (4.11). */
  resolutionArea: CardInstance[];
  firstPlayer: PlayerId;
  turn: number;
  turnPlayer: PlayerId;
  phase: Phase;
  /** The next engine step to run. */
  step: Step;
  turnFlags: {
    /** Invasion is once per turn (8.6.2). */
    invasionUsed: boolean;
    /** Playing a monster card is once per turn (Paul's ruling). */
    monsterPlayed: boolean;
  };
  standby: StandbyAbility[];
  continuousEffects: ContinuousEffect[];
  /** Counter power totalled at 7.4.2, compared at 7.4.3; `null` outside the counter phase. */
  counterTotal: number | null;
  result: GameResult | null;
  /** Every card that takes part in this game, keyed by `Card.id`. */
  cards: Record<string, Card>;
  log: LogEntry[];
}

/** One of a player's two strategy zones (4.5.2). */
export type StrategyZoneNumber = 1 | 2;

/** A turn player's choice at the main phase play timing (spec "Actions", 8). */
export type Action =
  /** Play a battle card from hand to one of the player's zones (8.2, 10.5.2.1.2). */
  | {
      type: "playBattle";
      player: PlayerId;
      cardInstanceId: string;
      zone: ZoneNumber;
    }
  /** Activate a strategy card from hand into an empty strategy zone (8.3). */
  | {
      type: "activateStrategy";
      player: PlayerId;
      cardInstanceId: string;
      strategyZone: StrategyZoneNumber;
    }
  /** Discard a monster card from hand for +1 rage (8.4). */
  | { type: "gainRage"; player: PlayerId; cardInstanceId: string }
  /** Stack a monster card from hand on the invading monster (8.5). */
  | { type: "playMonster"; player: PlayerId; cardInstanceId: string }
  /** Discard a card from hand and advance once per invasion icon point (8.6). */
  | { type: "invade"; player: PlayerId; cardInstanceId: string }
  /** End the play timing and the main phase (10.4.4.3). */
  | { type: "pass"; player: PlayerId };

export type ActionType = Action["type"];

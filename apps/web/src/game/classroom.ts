import { BOT_VERSION } from "@gojisim/bot";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type ClassroomAdvice,
  type ClassroomRating,
  classroomPosition,
  type ClassroomTurn,
  type GameState,
  isMainPhaseStart,
  mainPhaseEnd,
  positionDifferences,
} from "@gojisim/engine";
import type { SeatConfig } from "./bots";
import { actionLabel } from "./labels";
import { PLAYER_IDS, type PlayerId, type Session } from "./session";

/**
 * Kaiju Classroom (#365): at the start of each bot main phase the real game waits while the player
 * plays the bot's turn in a sandbox (a copy of the session, never the real one); once submitted the
 * bot plays its own turn in the real game, and when it ends its main phase the two end positions
 * are compared (`samePosition` in the engine). Everything here is pure: the real session only ever
 * gains information fields (`classroomTurns`), never actions.
 */

/** What the real game waits for in a Classroom game, or `null` (it plays on). */
export type ClassroomStage =
  | { kind: "play"; turn: number; player: PlayerId; actionIndex: number }
  | {
      kind: "compare";
      /** The turn's index in `classroomTurns`. */
      index: number;
      entry: ClassroomTurn;
      botEnd: { index: number; state: GameState };
      playerEnd: GameState;
      same: boolean;
      differences: string[];
    };

/** The bot's seat in a Classroom game (one human, one bot), or `null`. */
export function classroomBotSeat(session: Session): PlayerId | null {
  if (!session.record.classroom) return null;
  const bots = PLAYER_IDS.filter((id) => session.seats[id].kind === "bot");
  const humans = PLAYER_IDS.filter((id) => session.seats[id].kind === "human");
  return bots.length === 1 && humans.length === 1
    ? (bots[0] as PlayerId)
    : null;
}

/** The end of the player's sandbox turn, replayed from the record's position. */
export function playerTurnEnd(
  session: Session,
  entry: ClassroomTurn,
): GameState | null {
  const start = session.states[entry.actionIndex];
  if (!start) return null;
  const states = [start];
  try {
    for (const action of entry.playerActions)
      states.push(
        advanceToDecision(
          applyAction(states[states.length - 1] as GameState, action),
        ),
      );
  } catch {
    return null;
  }
  return mainPhaseEnd(states, entry.playerActions, 0)?.state ?? null;
}

/**
 * Where a live Classroom game stands: `play` at the first state of a bot main phase with no
 * Classroom turn yet (a game loaded in the middle of one plays on), `compare` once the bot's own
 * main phase has ended and its turn has no rating. `null` otherwise, and for every other game.
 */
export function classroomStage(session: Session): ClassroomStage | null {
  const seat = classroomBotSeat(session);
  if (!seat || session.position !== session.record.actions.length) return null;
  const turns = session.record.classroomTurns ?? [];
  const index = turns.findIndex((t) => t.rating === undefined);
  const entry = turns[index];
  if (entry) {
    const botEnd = mainPhaseEnd(
      session.states,
      session.record.actions,
      entry.actionIndex,
    );
    if (!botEnd) return null;
    const playerEnd = playerTurnEnd(session, entry);
    if (!playerEnd) return null;
    const differences = positionDifferences(
      classroomPosition(playerEnd, seat),
      classroomPosition(botEnd.state, seat),
    );
    return {
      kind: "compare",
      index,
      entry,
      botEnd,
      playerEnd,
      same: differences.length === 0,
      differences,
    };
  }
  const at = session.position;
  const state = session.states[at];
  if (!state || state.result || state.turnPlayer !== seat) return null;
  if (!isMainPhaseStart(session.states, at)) return null;
  if (turns.some((t) => t.turn === state.turn && t.player === seat))
    return null;
  return { kind: "play", turn: state.turn, player: seat, actionIndex: at };
}

/**
 * The sandbox for the bot's turn: a copy of the session at the position, with the seats swapped
 * (the player sits in the bot's seat; the bot answers any choice of the player's own seat, from
 * that seat's view), its own bot seed, and nothing after the position. The real session's states
 * are shared, not changed: the engine never mutates a state.
 */
export function classroomSandbox(session: Session, seat: PlayerId): Session {
  const bot = session.seats[seat] as Extract<SeatConfig, { kind: "bot" }>;
  const other = PLAYER_IDS.find((id) => id !== seat) as PlayerId;
  const at = session.position;
  return {
    record: {
      ...session.record,
      actions: session.record.actions.slice(0, at),
      // Reports never come from the sandbox; it holds no information fields.
      botFeedback: [],
      bugReports: [],
      ideas: [],
    },
    states: session.states.slice(0, at + 1),
    position: at,
    seats: {
      [seat]: { kind: "human" },
      [other]: { kind: "bot", difficulty: bot.difficulty },
    } as Record<PlayerId, SeatConfig>,
    botSeed: `${session.botSeed}-classroom-${at}`,
    labels: [...session.labels],
    batches: [],
  };
}

/** The sandbox turn's end, once the player has ended the bot's main phase. */
export function sandboxEnd(
  sandbox: Session,
  from: number,
): { index: number; state: GameState } | null {
  return mainPhaseEnd(sandbox.states, sandbox.record.actions, from);
}

/** The real session with the player's sandbox turn saved as a new Classroom turn. */
export function withClassroomSubmit(
  session: Session,
  sandbox: Session,
  from: number,
  seat: PlayerId,
): Session {
  const end = sandboxEnd(sandbox, from);
  if (!end) return session;
  const playerActions = sandbox.record.actions.slice(from, end.index + 1);
  const entry: ClassroomTurn = {
    turn: (session.states[from] as GameState).turn,
    player: seat,
    actionIndex: from,
    playerActions,
    playerLabels: playerActions.map((action, i) =>
      actionLabel(sandbox.states[from + i] as GameState, action),
    ),
    botVersion: BOT_VERSION,
    at: new Date().toISOString(),
  };
  return {
    ...session,
    record: {
      ...session.record,
      classroomTurns: [...(session.record.classroomTurns ?? []), entry],
    },
  };
}

/** The real session with turn `index`'s result and rating (`same` for an automatic match). */
export function withClassroomRating(
  session: Session,
  stage: Extract<ClassroomStage, { kind: "compare" }>,
  rating: ClassroomRating,
  reason?: string,
): Session {
  const turns = [...(session.record.classroomTurns ?? [])];
  const entry = turns[stage.index];
  if (!entry || entry.rating !== undefined) return session;
  turns[stage.index] = {
    ...entry,
    botEndIndex: stage.botEnd.index,
    same: stage.same,
    ...(stage.same ? {} : { differences: stage.differences }),
    rating,
    ...(reason ? { reason } : {}),
  };
  return {
    ...session,
    record: { ...session.record, classroomTurns: turns },
  };
}

/** The bot's own turn: its actions from the position to the end of its main phase, worded. */
export function botTurnLabels(
  session: Session,
  stage: Extract<ClassroomStage, { kind: "compare" }>,
): string[] {
  const out: string[] = [];
  for (let i = stage.entry.actionIndex; i <= stage.botEnd.index; i++) {
    const action = session.record.actions[i] as Action;
    // The player's own picks in the bot's turn (an opponent's choice) are theirs, not the bot's.
    if (action.player !== stage.entry.player) continue;
    out.push(actionLabel(session.states[i] as GameState, action));
  }
  return out;
}

/** Plain words for a difference path ("own.zones.3" → "Bot's zone 3"). */
export function differenceName(path: string): string {
  const [side, field, zone] = path.split(".");
  const whose = side === "own" ? "Bot's" : "Your";
  const names: Record<string, string> = {
    monsterZone: "monster's zone",
    monsterStack: "monster stack",
    strategies: "strategy zones",
    rage: "rage",
    hand: "hand",
    handCount: "hand size",
    discard: "discard pile",
    monsterDeck: "monster deck",
    deckCount: "deck size",
  };
  return field === "zones"
    ? `${whose} zone ${zone}`
    : `${whose} ${names[field ?? ""] ?? field}`;
}

/**
 * #478: the player's answer to the bot's advice at one of their decisions, kept in the record
 * (information only). A second answer at the same decision replaces the first.
 */
export function withClassroomAdvice(
  session: Session,
  entry: ClassroomAdvice,
): Session {
  const advice = (session.record.classroomAdvice ?? []).filter(
    (a) => a.actionIndex !== entry.actionIndex,
  );
  return {
    ...session,
    record: { ...session.record, classroomAdvice: [...advice, entry] },
  };
}

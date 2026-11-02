import {
  type BugReport,
  type CrashEntry,
  type FeedbackEntry,
  type GameState,
  type IdeaEntry,
  stepPhase,
} from "@gojisim/engine";
import { announce } from "./announce";
import { type CapturedError, isAppError, type LastAnswer } from "./errors";
import { botLabel, difficultyName } from "./bots";
import type { ExportedRecord, PlayerId, Session } from "./session";

/**
 * Game collection (M13b): the Test Site switch from the server, the record upload, and the record
 * fields Bad Bot!, Report bug and the opponent's-hand toggle add. The server half is
 * `apps/server/src/games.ts`.
 */

/** What `GET /api/config` answers (`SiteConfig` on the server). */
export interface SiteConfig {
  testSite: boolean;
}

/**
 * Whether the Test Site features are on: the panel, uploads and Show opponent's hand. The one
 * place the web app decides it, so M9 can replace it with the signed-in user's permission.
 */
export function testSiteEnabled(config: SiteConfig | null): boolean {
  return config?.testSite === true;
}

/** The server's config; `null` when it can't be read (the Test Site then stays off). */
export async function fetchConfig(
  fetchImpl: typeof fetch = fetch,
): Promise<SiteConfig | null> {
  try {
    const res = await fetchImpl("/api/config");
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<SiteConfig>;
    return { testSite: body.testSite === true };
  } catch {
    return null;
  }
}

/** #92: the browser key the post-deploy smoke check sets, so its uploads say `smokeCheck`. */
export const SMOKE_CHECK_KEY = "gojisim.smokeCheck";

/** Whether this browser is the smoke check's (`gojisim.smokeCheck` is "1"); blocked storage isn't. */
export function isSmokeCheck(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): boolean {
  try {
    return storage?.getItem(SMOKE_CHECK_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Uploads a session's record with its position; `true` when the server stored it. The smoke
 * check's uploads carry `smokeCheck: true` (#92).
 */
export async function uploadRecord(
  session: Session,
  fetchImpl: typeof fetch = fetch,
  smoke: boolean = isSmokeCheck(),
): Promise<boolean> {
  // #151: a finished game's result, so the server can index each player's games without
  // running the engine. The player isn't sent: the server records it from the session.
  const result = session.states.at(-1)?.result;
  const record: ExportedRecord = {
    ...session.record,
    position: session.position,
    ...(smoke ? { smokeCheck: true } : {}),
    ...(result
      ? { outcome: { winner: result.winner, reason: result.reason } }
      : {}),
  };
  try {
    const res = await fetchImpl("/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The phase names the feedback line uses, as the prompt panel words them (`STEP_NAMES`). */
const PHASES: Record<ReturnType<typeof stepPhase>, string> = {
  start: "Start phase",
  main: "Main phase",
  counter: "Counter phase",
  end: "End phase",
};

/** The newest bot action Bad Bot! would mark: its index and its battle-log line. */
export interface BotMoveRef {
  actionIndex: number;
  /** "Bot (Hard): Play Scale Attack [EBP01-061] → strategy 1" (stored in the record) */
  label: string;
  /** The move in announcement wording, for the popups: "Bot (Hard): activates Scale Attack" */
  plain: string;
  /** "Turn 7, Main phase" */
  when: string;
}

/** The bot action at `i` as Bad Bot! names it, or `null` when a human took it. */
function botMoveAt(session: Session, i: number): BotMoveRef | null {
  const action = session.record.actions[i];
  const seat = action && session.seats[action.player as PlayerId];
  if (!action || seat?.kind !== "bot") return null;
  const before = session.states[i] as GameState;
  const after = session.states[i + 1] ?? before;
  const words = announce(before, after, action, {
    subject: () => "Bot",
    whose: (owner, actor) =>
      owner === actor
        ? "its"
        : session.seats[owner as PlayerId]?.kind === "human"
          ? "your"
          : `Bot ${owner}'s`,
  }).text;
  return {
    actionIndex: i,
    // Private choices stay private, as in the battle log.
    label: botLabel(before, action, seat.difficulty, true),
    plain: words.replace(/^Bot /, `Bot (${difficultyName(seat.difficulty)}): `),
    when: whenAt(before),
  };
}

/** Where a state is, as reports read it: "Turn 6, Main phase". */
export function whenAt(state: GameState): string {
  return `Turn ${state.turn}, ${PHASES[stepPhase(state.currentStep)]}`;
}

/**
 * The bot moves Bad Bot! and Good Bot! offer (#106), newest first: every bot action after the
 * human's last action, plus the bot's latest turn (a bad play is often followed by a Pass, the
 * latest move); between two bots, the latest turn. Empty before the bot has acted.
 */
export function recentBotMoves(session: Session): BotMoveRef[] {
  const { actions } = session.record;
  const isBot = (i: number) =>
    session.seats[actions[i]?.player as PlayerId]?.kind === "bot";
  let lastHuman = -1;
  let lastBot = -1;
  for (
    let i = actions.length - 1;
    i >= 0 && (lastHuman < 0 || lastBot < 0);
    i--
  ) {
    if (isBot(i)) lastBot = lastBot < 0 ? i : lastBot;
    else lastHuman = lastHuman < 0 ? i : lastHuman;
  }
  if (lastBot < 0) return [];
  // The latest turn a bot seat took, read from the states before each action.
  let botTurn: number | null = null;
  for (let i = actions.length - 1; i >= 0; i--) {
    const state = session.states[i] as GameState;
    if (session.seats[state.turnPlayer as PlayerId]?.kind === "bot") {
      botTurn = state.turn;
      break;
    }
  }
  const moves: BotMoveRef[] = [];
  for (let i = actions.length - 1; i >= 0; i--) {
    const inBotTurn = (session.states[i] as GameState).turn === botTurn;
    // Between two bots there is no human action: the latest turn only.
    if ((i <= lastHuman || lastHuman < 0) && !inBotTurn) {
      if ((session.states[i] as GameState).turn < (botTurn ?? 0)) break;
      continue;
    }
    const move = botMoveAt(session, i);
    if (move) moves.push(move);
  }
  return moves;
}

/** The bot's latest action in the session, or `null` before the bot has acted. */
export function latestBotMove(session: Session): BotMoveRef | null {
  return recentBotMoves(session)[0] ?? null;
}

/** The session with a Bad Bot! report added to the record. */
export function withFeedback(session: Session, entry: FeedbackEntry): Session {
  return {
    ...session,
    record: {
      ...session.record,
      botFeedback: [...(session.record.botFeedback ?? []), entry],
    },
  };
}

/** The session with a Report bug note added to the record. */
export function withBugReport(session: Session, entry: BugReport): Session {
  return {
    ...session,
    record: {
      ...session.record,
      bugReports: [...(session.record.bugReports ?? []), entry],
    },
  };
}

/** What the crash upload needs to know about the page (#95). */
export interface CrashContext {
  testSite: boolean;
  shareGames: boolean;
  /** `location.origin`: only errors whose stack names a script there are the app's. */
  origin: string;
  lastAnswer: LastAnswer | null;
}

/**
 * The crash entry to upload for `error` (#95), or `null`: only with the Test Site and sharing on,
 * only for an error from the app's own code, and only once per game (a record that already has a
 * crash never sends another, a reloaded one included).
 */
export function crashToReport(
  session: Session,
  error: CapturedError,
  page: CrashContext,
): CrashEntry | null {
  if (!page.testSite || !page.shareGames) return null;
  if (session.record.crash) return null;
  if (!isAppError(error, page.origin)) return null;
  return {
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
    source: error.source,
    at: error.at,
    actionIndex: session.position,
    ...(session.states[session.position]
      ? { when: whenAt(session.states[session.position] as GameState) }
      : {}),
    ...(page.lastAnswer ? { lastAnswer: page.lastAnswer } : {}),
  };
}

/** The session with its crash added to the record. */
export function withCrash(session: Session, crash: CrashEntry): Session {
  return { ...session, record: { ...session.record, crash } };
}

/** The toast after a crash upload (Monarch's wording). */
export const CRASH_TOAST =
  "Something went wrong and was sent to us. Report bug lets you add what you were doing.";

/** The session with a Monster Island Mailbox suggestion added to the record. */
export function withIdea(session: Session, entry: IdeaEntry): Session {
  return {
    ...session,
    record: {
      ...session.record,
      ideas: [...(session.record.ideas ?? []), entry],
    },
  };
}

/**
 * The general feedback button's name (#107, Paul's pick): the button, its popup title and its
 * "Which button?" entry all read it, so a new name is this one line.
 */
export const MAILBOX_NAME = "Monster Island Mailbox";

/**
 * The session with Show opponent's hand turned on: flagged for the whole game, with the action
 * index where it was first turned on, and left out of achievements. Turning it off later never
 * clears the flags.
 */
export function withOpponentHandShown(session: Session): Session {
  if (session.record.showOpponentHand) return session;
  return {
    ...session,
    record: {
      ...session.record,
      showOpponentHand: true,
      showOpponentHandAt: session.record.actions.length,
      excludedFromAchievements: true,
    },
  };
}

/** The longest Bad Bot!, Report bug or Monster Island Mailbox text. */
export const MAX_REPORT_LENGTH = 1000;

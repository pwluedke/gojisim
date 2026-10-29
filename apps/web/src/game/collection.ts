import {
  type BugReport,
  type FeedbackEntry,
  type GameState,
  stepPhase,
} from "@gojisim/engine";
import { announce } from "./announce";
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

/** Uploads a session's record with its position; `true` when the server stored it. */
export async function uploadRecord(
  session: Session,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const record: ExportedRecord = {
    ...session.record,
    position: session.position,
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

/** The bot's latest action in the session, or `null` before the bot has acted. */
export function latestBotMove(session: Session): BotMoveRef | null {
  const { actions } = session.record;
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    const seat = action && session.seats[action.player as PlayerId];
    if (!action || seat?.kind !== "bot") continue;
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
      plain: words.replace(
        /^Bot /,
        `Bot (${difficultyName(seat.difficulty)}): `,
      ),
      when: `Turn ${before.turn}, ${PHASES[stepPhase(before.currentStep)]}`,
    };
  }
  return null;
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

/** The longest Bad Bot! or Report bug text. */
export const MAX_REPORT_LENGTH = 1000;

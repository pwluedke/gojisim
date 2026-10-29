import type { GameRecord, GameState } from "@gojisim/engine";
import { replayAll } from "@gojisim/engine";
import { announce } from "../../../apps/web/src/game/announce";
import {
  difficultyName,
  seatFromRecord,
} from "../../../apps/web/src/game/bots";
import { gameKey, plainMove } from "./feedbackList";

/**
 * `pnpm feedback`'s report (Paul, Oct 28, 2026): the uploaded records deduped to the latest file
 * per game, the reports not yet reviewed, and the human's win rate by bot level, as one Markdown
 * file to paste or attach. Pure: the command (`feedbackCmd.ts`) downloads, reads and writes.
 */

/** One uploaded file. */
export interface RecordFile {
  /** Path under the records folder, e.g. `2026-10-28/<gameId>.json`. */
  file: string;
  record: GameRecord;
}

export type ReportKind = "bad" | "good" | "bug";

/** A report in a game, from its latest file. */
export interface Report {
  /** `<game>|<kind>|<at>`: stable across uploads, kept in `records/reviewed.json`. */
  key: string;
  kind: ReportKind;
  file: string;
  record: GameRecord;
  actionIndex: number;
  reporter: string;
  at: string;
  text: string;
  /** Bad Bot! / Good Bot!: the stored battle-log label. */
  label?: string;
}

const HEADING: Record<ReportKind, string> = {
  bad: "Bad Bot!",
  good: "Good Bot!",
  bug: "Report bug",
};

/** The latest file of each game (the one with the most actions), in file order. */
export function latestPerGame(files: readonly RecordFile[]): RecordFile[] {
  const best = new Map<string, RecordFile>();
  for (const f of files) {
    const key = gameKey(f.record);
    const held = best.get(key);
    if (!held || f.record.actions.length > held.record.actions.length)
      best.set(key, f);
  }
  return [...best.values()].sort((a, b) => (a.file < b.file ? -1 : 1));
}

/** Every report in a game's latest file, in action order. */
export function reportsOf({ file, record }: RecordFile): Report[] {
  const game = gameKey(record);
  const bot: Report[] = (record.botFeedback ?? []).map((e) => {
    const kind = e.kind ?? "bad";
    return {
      key: `${game}|${kind}|${e.at}`,
      kind,
      file,
      record,
      actionIndex: e.actionIndex,
      reporter: e.reporter,
      at: e.at,
      text: e.text,
      label: e.label,
    };
  });
  const bugs: Report[] = (record.bugReports ?? []).map((e) => ({
    key: `${game}|bug|${e.at}`,
    kind: "bug" as const,
    file,
    record,
    actionIndex: e.actionIndex,
    reporter: e.reporter,
    at: e.at,
    text: e.text,
  }));
  return [...bot, ...bugs].sort(
    (a, b) => a.actionIndex - b.actionIndex || (a.at < b.at ? -1 : 1),
  );
}

/** The human's games, wins and losses against one bot level. */
export interface LevelRecord {
  level: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

/**
 * The human's results by bot level, over finished human-vs-bot games, leaving out games with
 * Show opponent's hand or a peeked First / Second pick (decisions 396, 483).
 */
export function winRates(
  games: readonly RecordFile[],
  finalState: (record: GameRecord) => GameState | null,
): LevelRecord[] {
  const levels = new Map<string, LevelRecord>();
  for (const { record } of games) {
    if (record.showOpponentHand || record.firstPickPeeked) continue;
    const seats = (["P1", "P2"] as const).map((id) => ({
      id,
      seat: seatFromRecord(record.seats?.[id]),
    }));
    const human = seats.find((s) => s.seat.kind === "human");
    const bot = seats.find((s) => s.seat.kind === "bot");
    if (!human || !bot || bot.seat.kind !== "bot") continue;
    const result = finalState(record)?.result;
    if (!result) continue;
    const level = difficultyName(bot.seat.difficulty);
    const row = levels.get(level) ?? {
      level,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    row.games++;
    if (result.winner === human.id) row.wins++;
    else if (result.winner === null) row.draws++;
    else row.losses++;
    levels.set(level, row);
  }
  return [...levels.values()].sort((a, b) => a.level.localeCompare(b.level));
}

/**
 * The last `n` moves up to `position`, one line each in the announcement wording ("Player plays
 * Heat Ray to zone 3", "Bot (Hard) passes"), with turn markers: the battle log's action lines.
 */
export function logTail(
  record: GameRecord,
  states: readonly GameState[],
  position: number,
  n = 10,
): string[] {
  const seat = (id: string) => seatFromRecord(record.seats?.[id]);
  const who = (id: string) => {
    const s = seat(id);
    return s.kind === "bot"
      ? `Bot (${difficultyName(s.difficulty)})`
      : "Player";
  };
  const lines: string[] = [];
  const upTo = Math.min(position, record.actions.length);
  for (let i = 0; i < upTo; i++) {
    const action = record.actions[i];
    const before = states[i];
    const after = states[i + 1];
    if (!action || !before || !after) break;
    if (i === 0 || states[i - 1]?.turn !== before.turn)
      lines.push(`Turn ${before.turn}: ${who(before.turnPlayer)}`);
    lines.push(
      announce(before, after, action, {
        subject: who,
        whose: (owner, actor) => (owner === actor ? "its" : `${who(owner)}'s`),
      }).text,
    );
  }
  return lines.slice(-n);
}

export interface SummaryOptions {
  /** Report keys already reviewed (`records/reviewed.json`). */
  reviewed: ReadonlySet<string>;
  /** List every report, reviewed or not (`--all`). */
  all: boolean;
  /** The bot's view at a Bad Bot! / Good Bot! action (`bot-explain`'s top moves), or null. */
  explain: (record: GameRecord, actionIndex: number) => string[] | null;
  /** The records folder's size and cap, in bytes, to warn when it is close. */
  bytes?: { used: number; cap: number };
  /** The summary's date, `YYYY-MM-DD`. */
  date: string;
}

export interface Summary {
  markdown: string;
  /** The keys of the reports listed (for `--mark-reviewed`). */
  listed: string[];
}

/** The feedback summary as Markdown, and the reports it lists. */
export function buildSummary(
  files: readonly RecordFile[],
  options: SummaryOptions,
): Summary {
  const games = latestPerGame(files);
  const finals = new Map<GameRecord, GameState[] | null>();
  const statesOf = (record: GameRecord) => {
    if (!finals.has(record))
      try {
        finals.set(record, replayAll(record));
      } catch {
        finals.set(record, null);
      }
    return finals.get(record) ?? null;
  };
  const finalState = (record: GameRecord) => statesOf(record)?.at(-1) ?? null;
  const finished = games.filter((g) => finalState(g.record)?.result).length;
  const all = games.flatMap(reportsOf);
  const listed = options.all
    ? all
    : all.filter((r) => !options.reviewed.has(r.key));
  const count = (kind: ReportKind) =>
    listed.filter((r) => r.kind === kind).length;
  const rates = winRates(games, finalState);

  const out: string[] = [
    `# GojiSim feedback, ${options.date}`,
    "",
    "## Totals",
    "",
  ];
  out.push(`- Games: ${games.length} (${finished} finished)`);
  out.push(
    `- ${options.all ? "Reports" : "New reports"}: ${count("bad")} Bad Bot!, ${count("good")} Good Bot!, ${count("bug")} Report bug` +
      (options.all ? "" : ` (${all.length - listed.length} already reviewed)`),
  );
  if (options.bytes) {
    const { used, cap } = options.bytes;
    const mb = (b: number) => `${Math.round(b / 1024 / 1024)} MB`;
    out.push(`- Records folder: ${mb(used)} of ${mb(cap)}`);
    if (used >= cap * 0.8)
      out.push(
        `- **Warning:** the records folder is ${Math.round((used / cap) * 100)}% full; at the cap, uploads stop (507).`,
      );
  }
  out.push("", "## Human win rate by bot level", "");
  out.push(
    "Finished human-vs-bot games, without Show opponent's hand or a peeked First / Second pick.",
    "",
  );
  if (rates.length === 0) out.push("No finished games.");
  else {
    out.push("| Bot | Games | Human wins | Losses | Draws | Win rate |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    for (const r of rates)
      out.push(
        `| ${r.level} | ${r.games} | ${r.wins} | ${r.losses} | ${r.draws} | ${Math.round((r.wins / r.games) * 100)}% |`,
      );
  }
  out.push("", "## Reports", "");
  if (listed.length === 0) out.push("No new reports.");
  for (const r of listed) {
    const states = statesOf(r.record);
    const before = states?.[r.actionIndex];
    const where = before ? `Turn ${before.turn}` : `action ${r.actionIndex}`;
    out.push(`### [${HEADING[r.kind]}] ${r.reporter}, ${where}`, "");
    out.push(`- File: \`${r.file}\`, \`--at ${r.actionIndex}\``);
    out.push(`- Reported: ${r.at}`);
    if (r.kind === "bug") {
      out.push(`- Note: ${r.text}`, "", "Last battle log lines:", "", "```");
      out.push(
        ...(states
          ? logTail(r.record, states, r.actionIndex)
          : ["(no replay)"]),
      );
      out.push("```", "");
      continue;
    }
    const action = r.record.actions[r.actionIndex];
    const seat = action
      ? seatFromRecord(r.record.seats?.[action.player])
      : null;
    const level = seat?.kind === "bot" ? difficultyName(seat.difficulty) : "?";
    const when = /\((Turn \d+, [^)]*)\)$/.exec(r.label ?? "")?.[1];
    const move = plainMove(states, r.record, r.actionIndex, level);
    out.push(`- Bot: ${level}${when ? `, ${when}` : ""}`);
    out.push(`- Move: ${move ?? r.label ?? "?"}`);
    out.push(`- Stored label: ${r.label ?? "?"}`);
    out.push(`- Note: ${r.text}`);
    const explained = options.explain(r.record, r.actionIndex);
    if (explained) {
      out.push("", "The bot's search there (top 5):", "", "```");
      out.push(...explained, "```");
    }
    out.push("");
  }
  return { markdown: `${out.join("\n")}\n`, listed: listed.map((r) => r.key) };
}

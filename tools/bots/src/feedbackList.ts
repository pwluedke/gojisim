import type { GameRecord } from "@gojisim/engine";
import { PRESETS } from "@gojisim/bot";

/** Which entries `pnpm bot-feedback` lists: Bad Bot! reports, Report bug notes, or both. */
export type FeedbackKind = "bot" | "bug";

/** "Hard" for a preset, "Level 70" otherwise (as the web app names bots). */
function levelName(difficulty: number): string {
  const preset = Object.entries(PRESETS).find(([, d]) => d === difficulty)?.[0];
  return preset
    ? `${preset[0]?.toUpperCase()}${preset.slice(1)}`
    : `Level ${difficulty}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The `pnpm bot-feedback` listing for records by file name: each Bad Bot! report and Report bug
 * note headed with its kind, its file and `--at` index, the reporter and date, the bot level and
 * move (Bad Bot!) or the game position (Report bug), and the text; then the totals.
 */
export function feedbackLines(
  records: readonly { file: string; record: GameRecord }[],
  kind?: FeedbackKind,
): string[] {
  const lines: string[] = [];
  let bots = 0;
  let bugs = 0;
  for (const { file, record } of records) {
    if (kind !== "bug")
      for (const entry of record.botFeedback ?? []) {
        const action = record.actions[entry.actionIndex];
        const seat = action ? record.seats?.[action.player] : undefined;
        const level =
          seat?.kind === "bot" &&
          typeof seat.settings?.["difficulty"] === "number"
            ? levelName(seat.settings["difficulty"])
            : "?";
        bots++;
        lines.push(
          `[Bad Bot!] ${file} --at ${entry.actionIndex}`,
          `  ${entry.reporter} (${entry.at.slice(0, 10)}), bot ${level}: ${entry.label}`,
          `  "${entry.text}"`,
        );
      }
    if (kind !== "bot")
      for (const entry of record.bugReports ?? []) {
        bugs++;
        lines.push(
          `[Report bug] ${file} --at ${entry.actionIndex}`,
          `  ${entry.reporter} (${entry.at.slice(0, 10)}), after ${entry.actionIndex} of ${record.actions.length} actions`,
          `  "${entry.text}"`,
        );
      }
  }
  lines.push(
    [
      kind !== "bug" ? plural(bots, "Bad Bot! report") : null,
      kind !== "bot" ? plural(bugs, "Report bug note") : null,
    ]
      .filter(Boolean)
      .join(", ") + ".",
  );
  return lines;
}

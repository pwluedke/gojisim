import { type GameRecord, type GameState, replayAll } from "@gojisim/engine";
import { PRESETS } from "@gojisim/bot";
import { announce } from "../../../apps/web/src/game/announce";

/**
 * Which entries `pnpm bot-feedback` lists: Bad Bot! (`bad`), Good Bot! (`good`), both bot kinds
 * (`bot`), or Report bug notes (`bug`); all without one.
 */
export type FeedbackKind = "bad" | "good" | "bot" | "bug";

/** Whether a Bad Bot! / Good Bot! entry (no `kind` reads as bad) is listed for `kind`. */
const listsBot = (kind: FeedbackKind | undefined, entry: "bad" | "good") =>
  kind === undefined || kind === "bot" || kind === entry;

/** "Hard" for a preset, "Level 70" otherwise (as the web app names bots). */
export function levelName(difficulty: number): string {
  const preset = Object.entries(PRESETS).find(([, d]) => d === difficulty)?.[0];
  return preset
    ? `${preset[0]?.toUpperCase()}${preset.slice(1)}`
    : `Level ${difficulty}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A game across its uploads: its `gameId`, or seed and bot seed for records from before ids. */
export const gameKey = (record: GameRecord) =>
  record.gameId ?? `${String(record.seed)}|${record.botSeed ?? ""}`;

/**
 * The bot's move at `index` in the announcement wording ("Bot (Hard): uses Mothra (Larva)'s
 * ability"), or `null` when the record doesn't replay that far.
 */
export function plainMove(
  states: readonly GameState[] | null,
  record: GameRecord,
  index: number,
  level: string,
): string | null {
  const action = record.actions[index];
  const before = states?.[index];
  const after = states?.[index + 1];
  if (!action || !before || !after) return null;
  const line = announce(before, after, action, {
    subject: () => "Bot",
    whose: (owner, actor) => (owner === actor ? "its" : "your"),
  });
  return line.text.replace(/^Bot /, `Bot (${level}): `);
}

/**
 * The `pnpm bot-feedback` listing for records by file name (Bad Bot!, Good Bot! and Report bug). Every upload of a game carries its
 * whole record, so a report is listed once: by game (`gameId`, or seed and bot seed), kind and
 * time, from the game's latest file (the one with the most actions). Each entry is headed with
 * its kind, file and `--at` index, then the reporter and date with the bot's move in plain words
 * (the stored label on the next line) or the game position, then the text; then the totals.
 */
export function feedbackLines(
  records: readonly { file: string; record: GameRecord }[],
  kind?: FeedbackKind,
): string[] {
  // #92: the post-deploy smoke check's games are left out.
  const latest = [...records.filter((r) => !r.record.smokeCheck)].sort(
    (a, b) => b.record.actions.length - a.record.actions.length,
  );
  const seen = new Set<string>();
  const games = new Set<string>();
  const entries: { game: string; index: number; lines: string[] }[] = [];
  let bad = 0;
  let good = 0;
  let bugs = 0;
  for (const { file, record } of latest) {
    const game = gameKey(record);
    let states: GameState[] | null | undefined;
    const replayed = () => {
      if (states === undefined)
        try {
          states = replayAll(record);
        } catch {
          states = null;
        }
      return states;
    };
    if (kind !== "bug")
      for (const entry of record.botFeedback ?? []) {
        const entryKind = entry.kind ?? "bad";
        if (!listsBot(kind, entryKind)) continue;
        const key = `${game}|${entryKind}|${entry.at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        games.add(game);
        const action = record.actions[entry.actionIndex];
        const seat = action ? record.seats?.[action.player] : undefined;
        const level =
          seat?.kind === "bot" &&
          typeof seat.settings?.["difficulty"] === "number"
            ? levelName(seat.settings["difficulty"])
            : "?";
        const when = /\((Turn \d+, [^)]*)\)$/.exec(entry.label)?.[1];
        const move = plainMove(replayed(), record, entry.actionIndex, level);
        if (entryKind === "good") good++;
        else bad++;
        entries.push({
          game,
          index: entry.actionIndex,
          lines: [
            `[${entryKind === "good" ? "Good Bot!" : "Bad Bot!"}] ${file} --at ${entry.actionIndex}`,
            `  ${entry.reporter} (${entry.at.slice(0, 10)}): ${move ?? entry.label}${move && when ? ` (${when})` : ""}`,
            `    label: ${entry.label}`,
            `  "${entry.text}"`,
          ],
        });
      }
    if (kind === undefined || kind === "bug")
      for (const entry of record.bugReports ?? []) {
        const key = `${game}|bug|${entry.at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        games.add(game);
        bugs++;
        entries.push({
          game,
          index: entry.actionIndex,
          lines: [
            `[Report bug] ${file} --at ${entry.actionIndex}`,
            `  ${entry.reporter} (${entry.at.slice(0, 10)}), after ${entry.actionIndex} of ${record.actions.length} actions`,
            `  "${entry.text}"`,
          ],
        });
      }
  }
  // Each game's entries together, in game order.
  const order = [...games];
  entries.sort(
    (a, b) =>
      order.indexOf(a.game) - order.indexOf(b.game) || a.index - b.index,
  );
  // Each kind listed that has entries; "No reports" when none does.
  const counts =
    [
      listsBot(kind, "bad") && bad > 0 ? plural(bad, "Bad Bot! report") : null,
      listsBot(kind, "good") && good > 0
        ? plural(good, "Good Bot! report")
        : null,
      (kind === undefined || kind === "bug") && bugs > 0
        ? plural(bugs, "Report bug note")
        : null,
    ]
      .filter(Boolean)
      .join(", ") || "No reports";
  return [
    ...entries.flatMap((e) => e.lines),
    `${counts} in ${plural(games.size, "game")}.`,
  ];
}

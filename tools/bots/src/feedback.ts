import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { GameRecord } from "@gojisim/engine";
import { PRESETS } from "@gojisim/bot";

/**
 * `pnpm bot-feedback <records folder>` (M13b): every Bad Bot! report in the uploaded records under
 * the folder (the volume's `/data/records`, downloaded with docs/deploy.md's command): file,
 * reporter, bot level, the move with its turn and phase, and the text. Run `pnpm bot-explain
 * <file> --at <index>` on a file to see the bot's search there.
 */
const folder = process.argv[2];
if (!folder) throw new Error("Usage: pnpm bot-feedback <records folder>");
const root = resolve(process.env["INIT_CWD"] ?? ".", folder);

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return jsonFiles(path);
      return name.endsWith(".json") ? [path] : [];
    });
}

/** "Hard" for a preset, "Level 70" otherwise (as the web app names bots). */
function levelName(difficulty: number): string {
  const preset = Object.entries(PRESETS).find(([, d]) => d === difficulty)?.[0];
  return preset
    ? `${preset[0]?.toUpperCase()}${preset.slice(1)}`
    : `Level ${difficulty}`;
}

let count = 0;
for (const file of jsonFiles(root)) {
  let record: GameRecord;
  try {
    record = JSON.parse(readFileSync(file, "utf8")) as GameRecord;
  } catch {
    continue;
  }
  for (const entry of record.botFeedback ?? []) {
    const action = record.actions[entry.actionIndex];
    const seat = action ? record.seats?.[action.player] : undefined;
    const level =
      seat?.kind === "bot" && typeof seat.settings?.["difficulty"] === "number"
        ? levelName(seat.settings["difficulty"])
        : "?";
    count++;
    console.log(
      [
        `${relative(root, file)} --at ${entry.actionIndex}`,
        `  ${entry.reporter} (${entry.at.slice(0, 10)}), bot ${level}: ${entry.label}`,
        `  "${entry.text}"`,
      ].join("\n"),
    );
  }
}
console.log(`${count} Bad Bot! ${count === 1 ? "report" : "reports"}.`);

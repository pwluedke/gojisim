import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { GameRecord } from "@gojisim/engine";
import { type FeedbackKind, feedbackLines } from "./feedbackList";

/**
 * `pnpm bot-feedback <records folder> [--kind bad|good|bot|bug]` (M13b): every Bad Bot!, Good Bot!
 * and Report bug entry in the uploaded records under the folder (`pnpm feedback` downloads them),
 * each headed with its kind: file, reporter, the bot level and move (Bad Bot!, Good Bot!) or the
 * game position (Report bug), and the text. `--kind` lists one kind (`bot`: both bot kinds). Run
 * `pnpm bot-explain <file> --at <index>` on a file to see the bot's search there.
 */
const args = process.argv.slice(2);
const kindAt = args.indexOf("--kind");
const kind = kindAt >= 0 ? args[kindAt + 1] : undefined;
const folder = args.find(
  (a, i) => !a.startsWith("--") && (kindAt < 0 || i !== kindAt + 1),
);
const KINDS = ["bad", "good", "bot", "bug"];
if (!folder || (kindAt >= 0 && !KINDS.includes(kind ?? "")))
  throw new Error(
    "Usage: pnpm bot-feedback <records folder> [--kind bad|good|bot|bug]",
  );
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

const records = jsonFiles(root).flatMap((file) => {
  try {
    const record = JSON.parse(readFileSync(file, "utf8")) as GameRecord;
    return [{ file: relative(root, file), record }];
  } catch {
    return [];
  }
});
for (const line of feedbackLines(records, kind as FeedbackKind | undefined))
  console.log(line);

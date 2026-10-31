import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildNotes,
  load,
  type PageFile,
  pagesOf,
  readSeen,
  summary,
  writeSeen,
} from "./notes";
import { readZip } from "./zip";

/**
 * `pnpm discord-notes [--dir discord-exports] [--dry-run]` (#84), run from the repo root: reads
 * every Discrub zip (and unzipped export folder) in the gitignored `discord-exports/`, writes the
 * messages not in `seen.json` with their context to `new-<date>/`, one file per channel, plus
 * `summary.md`, then adds them to `seen.json`. `--dry-run` prints the summary and writes nothing.
 */
const { values } = parseArgs({
  options: {
    dir: { type: "string", default: "discord-exports" },
    "dry-run": { type: "boolean", default: false },
  },
});
// pnpm runs this inside tools/discord-notes; INIT_CWD is where `pnpm discord-notes` was typed.
const dir = resolve(process.env["INIT_CWD"] ?? ".", values.dir);
if (!existsSync(dir)) {
  console.error(
    `No ${dir}: put Discrub exports there (README: Discord notes).`,
  );
  process.exit(1);
}

/** Page files in an unzipped export folder, with paths like a zip's. */
function folderPages(root: string, source: string): PageFile[] {
  const walk = (path: string): string[] =>
    readdirSync(path).flatMap((name) => {
      const full = join(path, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  return pagesOf(
    source,
    walk(root).map((full) => ({
      name: relative(root, full).split("\\").join("/"),
      data: readFileSync(full),
    })),
  );
}

const pages: PageFile[] = [];
for (const name of readdirSync(dir).sort()) {
  const path = join(dir, name);
  if (name.endsWith(".zip"))
    pages.push(...pagesOf(name, readZip(readFileSync(path))));
  // Output folders are the tool's own.
  else if (statSync(path).isDirectory() && !name.startsWith("new-"))
    pages.push(...folderPages(path, `${name}/`));
}

const seenFile = join(dir, "seen.json");
const seen = readSeen(
  existsSync(seenFile) ? readFileSync(seenFile, "utf8") : null,
);
const loaded = load(pages);
const notes = buildNotes(loaded, seen);
const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const text = summary(loaded, notes, date, seen.size);

if (values["dry-run"] || notes.newKeys.length === 0) {
  console.log(text);
  if (notes.newKeys.length === 0)
    console.log("Nothing written: no new messages.");
  process.exit(0);
}

// A second run on the same day gets its own folder.
let out = join(dir, `new-${date}`);
for (let n = 2; existsSync(out); n++) out = join(dir, `new-${date}-${n}`);
mkdirSync(out);
for (const c of notes.channels)
  writeFileSync(join(out, c.file), `${c.lines.join("\n")}\n`);
writeFileSync(join(out, "summary.md"), text);
for (const key of notes.newKeys) seen.add(key);
writeFileSync(seenFile, writeSeen(seen));
console.log(text);
console.log(`Wrote ${relative(process.cwd(), out)}/ and updated seen.json.`);

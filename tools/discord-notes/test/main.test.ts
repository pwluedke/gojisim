import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TSX = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;
const MAIN = new URL("../src/main.ts", import.meta.url).pathname;

/** Runs `pnpm discord-notes` on a folder, as from the repo root. */
const run = (dir: string, ...args: string[]) =>
  execFileSync(TSX, [MAIN, "--dir", dir, ...args], { encoding: "utf8" });

describe("pnpm discord-notes (#84)", () => {
  it("writes new-<date>/ with a file per channel and summary.md, updates seen.json, and finds nothing new the second time", () => {
    const dir = mkdtempSync(join(tmpdir(), "discord-notes-"));
    // An unzipped export folder, made up.
    const channel = join(dir, "export", "made_up_chat");
    execFileSync("mkdir", ["-p", channel]);
    writeFileSync(
      join(channel, "made_up_chat-page-1.txt"),
      "@Bo Sample (10/02/2026 12:05 PM)\nIt is not.\n\n@Ann Example (10/02/2026 11:59 AM)\nIs it?\n",
    );
    // A dry run writes nothing.
    expect(run(dir, "--dry-run")).toContain("New messages: 2 in 1 channel(s)");
    expect(existsSync(join(dir, "seen.json"))).toBe(false);
    run(dir);
    const out = readdirSync(dir).find((n) => n.startsWith("new-"));
    expect(out).toBeDefined();
    expect(readdirSync(join(dir, out as string)).sort()).toEqual([
      "made_up_chat.txt",
      "summary.md",
    ]);
    expect(
      readFileSync(join(dir, out as string, "made_up_chat.txt"), "utf8"),
    ).toBe(
      "Ann Example (2026-10-02 11:59): Is it?\nBo Sample (2026-10-02 12:05): It is not.\n",
    );
    expect(
      JSON.parse(readFileSync(join(dir, "seen.json"), "utf8")).keys,
    ).toHaveLength(2);
    // Its own output folder isn't read back as an export.
    expect(run(dir)).toContain("Nothing written: no new messages.");
    expect(readdirSync(dir).filter((n) => n.startsWith("new-"))).toHaveLength(
      1,
    );
  });
});

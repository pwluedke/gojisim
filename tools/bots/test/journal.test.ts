import { randomBot } from "@gojisim/bot";
import { appendFile, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendJournal,
  clearJournal,
  journalDir,
  readJournal,
  runKey,
} from "../src/journal";
import { playMatchGame } from "../src/match";

const run = {
  a: "hard",
  b: "hard-m12",
  aSettings: { "w.position": 0.8 },
  bSettings: {},
  seed: "m13c-position",
  decks: "mixed",
  games: 800,
  turnCap: "500",
};

describe("tournament journal (M13c)", () => {
  it("the same run gets the same folder; a different setting or game count gets another", () => {
    expect(journalDir("/out", run.seed, run)).toBe(
      journalDir("/out", run.seed, { ...run }),
    );
    expect(runKey({ ...run, aSettings: { "w.position": 0.9 } })).not.toBe(
      runKey(run),
    );
    expect(runKey({ ...run, games: 400 })).not.toBe(runKey(run));
    expect(journalDir("/out", "a/b c", run)).toMatch(
      /^\/out\/bot-reports\/runs\/a_b_c-[0-9a-f]{12}$/,
    );
  });

  it("reads back every journaled game from every process's file, skipping a cut-off line, and clears", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "gojisim-journal-")), "run");
    expect((await readJournal(dir)).size).toBe(0);
    const games = [0, 1, 2].map((game) =>
      playMatchGame(
        { bot: randomBot },
        { bot: randomBot },
        "journal",
        game,
        "official",
      ),
    );
    await appendJournal(dir, "shard-0.jsonl", games[0]!);
    await appendJournal(dir, "shard-0.jsonl", games[2]!);
    await appendJournal(dir, "shard-1.jsonl", games[1]!);
    // A process killed mid-write.
    await appendFile(join(dir, "shard-1.jsonl"), '{"game":3,"seed":"jour');

    const done = await readJournal(dir);
    expect([...done.keys()].sort()).toEqual([0, 1, 2]);
    expect(done.get(1)).toEqual(games[1]);

    await clearJournal(dir);
    await expect(readdir(dir)).rejects.toThrow();
  });
});

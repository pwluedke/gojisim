import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOTS } from "@gojisim/bot";
import { replayAll } from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { loadDeck } from "../src/decks";
import { playMatchGame } from "../src/match";
import {
  matchupArgs,
  type Plan,
  planStatus,
  readCurrentRun,
  writeCurrentRun,
} from "../src/plan";

/** The official starters as one deck list file (made-up names; no player's decks). */
function deckFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "bots-plan-"));
  const starter = (set: string) =>
    readFileSync(
      new URL(
        `../../../packages/cards/data/decks/${set.toLowerCase()}-starter.txt`,
        import.meta.url,
      ),
      "utf8",
    ).replace(/^\[deck\].*$/m, `[deck] Test/${set}`);
  const file = join(dir, "decks.txt");
  writeFileSync(
    file,
    `${starter("ESD01")}\n\n${starter("ESD02")}\n\n[deck] Test/Short\n[monster deck]\n1 ESD01-001\n[main deck]\n4 ESD01-005\n`,
  );
  return file;
}

describe("#170 deck-vs-deck", () => {
  it("reads a deck by its full name and refuses one that fails validateDeck", () => {
    const file = deckFile();
    expect(loadDeck(`${file}#Test/ESD01`, ".", "s").mainDeck).toHaveLength(50);
    expect(() => loadDeck(`${file}#Test/Short`, ".", "s")).toThrow(
      /isn't legal: 6\.1\.1\.1/,
    );
    expect(() => loadDeck(`${file}#Nope`, ".", "s")).toThrow(/No deck named/);
    // A random test deck is fixed by the run's seed.
    expect(loadDeck("random:EBP02", ".", "s")).toEqual(
      loadDeck("random:EBP02", ".", "s"),
    );
  });

  it("each bot keeps its deck whichever seat it has, and the kept record replays", () => {
    const file = deckFile();
    const fixed = {
      a: loadDeck(`${file}#Test/ESD01`, ".", "s"),
      b: loadDeck(`${file}#Test/ESD02`, ".", "s"),
    };
    const recordDir = mkdtempSync(join(tmpdir(), "bots-records-"));
    const bot = { bot: BOTS["random"] as NonNullable<(typeof BOTS)["random"]> };
    const g0 = playMatchGame(bot, bot, "t", 0, "official", 60, {
      fixed,
      recordDir,
    });
    const g1 = playMatchGame(bot, bot, "t", 1, "official", 60, {
      fixed,
      recordDir,
    });
    expect(g0.aSeat).toBe("P1");
    expect(g0.decks).toEqual(["Test/ESD01", "Test/ESD02"]);
    expect(g1.aSeat).toBe("P2");
    expect(g1.decks).toEqual(["Test/ESD02", "Test/ESD01"]);
    const record = JSON.parse(
      readFileSync(join(recordDir, "game-1.json"), "utf8"),
    );
    expect(record.seats.P2.kind).toBe("bot");
    expect(record.decks[1].monsterDeck[0].cardNumber).toMatch(/^ESD01-/);
    expect(replayAll(record).at(-1)?.turn).toBe(g1.turns);
  });

  it("a plan's matchup becomes a resumable `pnpm bots` run with its own report and records", () => {
    const plan: Plan = {
      name: "study",
      defaults: {
        a: "hard",
        b: "hard",
        games: 100,
        workers: 17,
        deterministic: true,
        keepRecords: true,
      },
      matchups: [{ id: "A01", aDeck: "x.txt#A", bDeck: "y.txt#B", games: 60 }],
    };
    const args = matchupArgs(plan, plan.matchups[0] as Plan["matchups"][0]);
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    expect(value("--games")).toBe("60");
    expect(value("--seed")).toBe("study-A01");
    expect(value("--report")).toBe(
      join("bot-reports", "plans", "study", "A01.json"),
    );
    expect(value("--keep-records")).toBe(
      join("bot-reports", "plans", "study", "records", "A01"),
    );
    expect(args).toContain("--deterministic");
  });

  it("#175: a matchup without fixed decks plays the plan's deck source, with each bot's settings", () => {
    const plan: Plan = {
      name: "rules",
      defaults: { a: "hard", b: "hard", bSettings: "rules=0", decks: "mixed" },
      matchups: [{ id: "new-vs-old", games: 200 }],
    };
    const args = matchupArgs(plan, plan.matchups[0] as Plan["matchups"][0]);
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    expect(value("--decks")).toBe("mixed");
    expect(value("--b-settings")).toBe("rules=0");
    expect(args).not.toContain("--a-deck");
  });
});

describe("#177 the current run", () => {
  it("bots-plan writes its folder and plan file to the current-run file, which the shell commands read", () => {
    const dir = mkdtempSync(join(tmpdir(), "bots-run-"));
    process.env["GOJISIM_CURRENT_RUN"] = join(dir, "current-run");
    try {
      expect(readCurrentRun()).toBeNull();
      writeCurrentRun(dir, "bot-reports/plan.json");
      expect(readFileSync(join(dir, "current-run"), "utf8")).toBe(
        `${dir}\n${join(dir, "bot-reports/plan.json")}\n`,
      );
      expect(readCurrentRun()).toEqual({
        dir,
        plan: join(dir, "bot-reports/plan.json"),
      });
    } finally {
      delete process.env["GOJISIM_CURRENT_RUN"];
    }
  });

  it("bots-status counts a finished matchup from its report and one in progress from its journal", () => {
    const out = mkdtempSync(join(tmpdir(), "bots-status-"));
    const plan: Plan = {
      name: "night",
      defaults: { games: 60, seed: "night" },
      matchups: [
        { id: "A01", aDeck: "x#A", bDeck: "y#B" },
        { id: "A02", aDeck: "x#A", bDeck: "y#C", games: 12 },
        { id: "A03", aDeck: "x#A", bDeck: "y#D" },
      ],
    };
    mkdirSync(join(out, "bot-reports", "plans", "night"), { recursive: true });
    writeFileSync(
      join(out, "bot-reports", "plans", "night", "A01.json"),
      JSON.stringify({
        games: Array.from({ length: 60 }, (_, i) => ({ game: i })),
      }),
    );
    const journal = join(out, "bot-reports", "runs", "night-A02-0123456789ab");
    mkdirSync(journal, { recursive: true });
    writeFileSync(join(journal, "shard-0.jsonl"), '{"game":0}\n{"game":2}\n');
    writeFileSync(join(journal, "shard-1.jsonl"), '{"game":1}\n');
    expect(planStatus(plan, out)).toEqual([
      { id: "A01", played: 60, total: 60, done: true },
      { id: "A02", played: 3, total: 12, done: false },
      { id: "A03", played: 0, total: 60, done: false },
    ]);
  });
});

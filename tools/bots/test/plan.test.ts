import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOTS } from "@gojisim/bot";
import { replayAll } from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { loadDeck } from "../src/decks";
import { playMatchGame } from "../src/match";
import { matchupArgs, type Plan } from "../src/plan";

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
});

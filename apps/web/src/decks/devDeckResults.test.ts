import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deckSignature, parseDeckList } from "@gojisim/cards/deck-lists";
import { describe, expect, it } from "vitest";
import { deckResults, readDecks } from "../../devDeckResults";

// Paul, Nov 9: the latest study-deck result against each deck, by card list, on Paul's Mac only.

const DECKS = [
  "[deck] TECH/T7",
  "[monster deck]",
  "1 ESD01-001",
  "[main deck]",
  "2 ESD01-012",
  "",
  "[deck] Run/Tangler (Ian)",
  "[monster deck]",
  "1 ESD02-001",
  "[main deck]",
  "2 ESD02-009",
  "",
  "[deck] Tangler copy",
  "[monster deck]",
  "1 ESD02-001",
  "[main deck]",
  "2 ESD02-009+",
  "",
].join("\n");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deck-results-"));
  writeFileSync(join(root, "decks.txt"), DECKS);
  const reports = join(root, "bot-reports");
  const plan = (
    name: string,
    a: string,
    b: string,
    wins: number,
    games: number,
    mtime: number,
  ) => {
    writeFileSync(
      join(reports, `${name}-plan.json`),
      JSON.stringify({
        name,
        matchups: [
          { id: "m", aDeck: `decks.txt#${a}`, bDeck: `decks.txt#${b}` },
        ],
      }),
    );
    mkdirSync(join(reports, "plans", name), { recursive: true });
    const file = join(reports, "plans", name, "m.json");
    writeFileSync(
      file,
      JSON.stringify({
        games: Array.from({ length: games }, (_, i) => ({
          winner: i < wins ? "a" : "b",
        })),
      }),
    );
    utimesSync(file, mtime, mtime);
  };
  mkdirSync(reports, { recursive: true });
  return { root, reports, plan };
}

describe("dev deck results (devDeckResults.ts)", () => {
  const tangler = parseDeckList(DECKS).decks[1]!;

  it("gives the study deck's win rate against the opponent, matched by card list", () => {
    const { root, reports, plan } = fixture();
    plan("old", "TECH/T7", "Run/Tangler (Ian)", 1, 4, 1000);
    plan("new", "TECH/T7", "Tangler copy", 13, 20, 2000);
    const results = deckResults(reports, root);
    // The copy has the same cards (prints ignored): one entry, the newer report.
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      signature: deckSignature(tangler),
      label: "T7 65%",
    });
  });

  it("leaves out a matchup with the same deck on both sides, and plans without a report", () => {
    const { root, reports, plan } = fixture();
    plan("levels", "Run/Tangler (Ian)", "Tangler copy", 2, 4, 1000);
    writeFileSync(
      join(reports, "pending-plan.json"),
      JSON.stringify({
        name: "pending",
        matchups: [
          {
            id: "m",
            aDeck: "decks.txt#TECH/T7",
            bDeck: "decks.txt#Run/Tangler (Ian)",
          },
        ],
      }),
    );
    expect(deckResults(reports, root)).toEqual([]);
  });

  it("its own reader gives the same signature as deckSignature", () => {
    const decks = parseDeckList(DECKS).decks;
    expect(readDecks(DECKS).map((d) => d.signature)).toEqual(
      decks.map((d) => deckSignature(d)),
    );
  });

  it("no bot-reports folder means no results", () => {
    expect(deckResults(join(tmpdir(), "no-such-reports"), tmpdir())).toEqual(
      [],
    );
  });
});

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DECKS_FILE,
  defaultMetaDecks,
  loadDeck,
  loadMetaDecks,
} from "../src/decks";

// Paul, Nov 9: one flat deck list with tags. The top-tier set is the decks tagged Meta, and run
// plans that name a deck by its old `<file>#<name>` still find it (its `# was:` line).

/** The official starters, under made-up names (no player's decks). */
const starter = (set: string, header: string) =>
  readFileSync(
    new URL(
      `../../../packages/cards/data/decks/${set.toLowerCase()}-starter.txt`,
      import.meta.url,
    ),
    "utf8",
  ).replace(/^\[deck\].*$/m, header);

/** A repository folder with `local-decks/decks.txt`: one deck tagged Meta, one not. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "bots-decks-"));
  mkdirSync(join(root, "local-decks"));
  writeFileSync(
    join(root, DECKS_FILE),
    [
      starter(
        "ESD01",
        "[deck] Red Starter\n# origin: Run\n# was: local-decks/old.txt#Run/Red\ntags: Meta, Bot training",
      ),
      starter("ESD02", "[deck] Blue Starter\ntags: Mine"),
    ].join("\n\n"),
  );
  return root;
}

describe("the one deck list (local-decks/decks.txt)", () => {
  it("--decks meta plays the decks tagged Meta", () => {
    const root = repo();
    expect(loadMetaDecks(DECKS_FILE, root).map((d) => d.name)).toEqual([
      "Red Starter",
    ]);
  });

  it("an older list without tags (meta.txt) still gives all its decks", () => {
    const root = repo();
    writeFileSync(
      join(root, "local-decks/meta.txt"),
      [
        starter("ESD01", "[deck] Run/Red"),
        starter("ESD02", "[deck] Run/Blue"),
      ].join("\n\n"),
    );
    expect(loadMetaDecks("local-decks/meta.txt", root)).toHaveLength(2);
  });

  it("the default is the one deck list when it's there, else meta.txt", () => {
    expect(defaultMetaDecks(repo())).toBe(DECKS_FILE);
    expect(defaultMetaDecks(mkdtempSync(join(tmpdir(), "bots-none-")))).toBe(
      "local-decks/meta.txt",
    );
  });

  it("a plan's old <file>#<name> finds the deck by its # was: line, relative or absolute", () => {
    const root = repo();
    expect(loadDeck("local-decks/old.txt#Run/Red", root, "s").name).toBe(
      "Red Starter",
    );
    expect(
      loadDeck(join(root, "local-decks/old.txt#Run/Red"), root, "s").name,
    ).toBe("Red Starter");
    expect(() => loadDeck("local-decks/old.txt#Run/Nope", root, "s")).toThrow(
      /No deck named/,
    );
  });

  it("an old file that is still there is read as before", () => {
    const root = repo();
    writeFileSync(
      join(root, "local-decks/old.txt"),
      starter("ESD02", "[deck] Run/Red"),
    );
    // The file wins: its own Run/Red (the blue starter), not the moved deck.
    expect(loadDeck("local-decks/old.txt#Run/Red", root, "s").name).toBe(
      "Run/Red",
    );
  });
});

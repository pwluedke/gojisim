import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NamedDeck } from "@gojisim/cards/deck-lists";
import { TEST_DECK_SETS } from "@gojisim/cards/test-decks";
import { describe, expect, it } from "vitest";
import {
  LOCAL_DECKS_MODULE,
  localDecksPlugin,
  readLocalDeckFiles,
} from "../../localDecksPlugin";
import {
  deckOptions,
  fileOptions,
  importedOptions,
  matchesFilter,
  pickerGroups,
  playDeckOptions,
  replaceByName,
} from "./decks";
import { localDecks, parseLocalDecks } from "./localDecks";

/**
 * The development deck files (Monarch, Oct 25, 2026). The fixture folder stands in for
 * `local-decks/`: made-up deck names built from the starter lists, never Paul's files.
 */
const FIXTURE = new URL("../../e2e/fixtures/local-decks", import.meta.url)
  .pathname;
const fixture = parseLocalDecks(readLocalDeckFiles(FIXTURE));
const named = (name: string, from?: NamedDeck): NamedDeck => ({
  name,
  monsterDeck: from?.monsterDeck ?? [],
  mainDeck: from?.mainDeck ?? [],
});

describe("development deck files", () => {
  it("reads every .txt in the folder, by file, and keeps each file's errors once with their lines", () => {
    expect(fixture.counts).toEqual([
      { file: "club-nights.txt", decks: 4 },
      { file: "sample-binder.txt", decks: 1 },
    ]);
    expect(fixture.errors).toEqual([
      {
        file: "club-nights.txt",
        errors: [
          {
            line: 89,
            reason: "Unknown card number XYZ-999",
            text: "4 XYZ-999",
            deck: 3,
          },
        ],
      },
    ]);
    // The rest of the deck still loads, as parseDeckList does.
    const broken = fixture.decks.find((d) => d.label === "Broken Pencil");
    expect(broken?.deck.mainDeck.length).toBeGreaterThan(40);
  });

  it("groups by file and [deck] folder, labelled without the folder", () => {
    const options = fileOptions(fixture.decks);
    expect(options.map((o) => [o.group, o.label])).toEqual([
      ["club-nights.txt", "Harbor Watch"],
      ["club-nights.txt › tournament", "Night Shift"],
      ["club-nights.txt › tournament", "Second Wind"],
      ["club-nights.txt", "Broken Pencil"],
      ["sample-binder.txt › archive", "Old Faithful"],
    ]);
    expect(options[1]?.key).toBe("file:club-nights.txt:tournament/Night Shift");
    expect(options[1]?.build(0).name).toBe("tournament/Night Shift");
  });

  it("unit tests and the dev server get the files through the virtual module", () => {
    expect(localDecks().counts).toEqual(fixture.counts);
    expect(deckOptions([]).filter((o) => o.kind === "file")).toHaveLength(5);
  });

  it("a missing folder (anyone else's clone) is no dev decks and no error", () => {
    expect(readLocalDeckFiles(join(FIXTURE, "missing"))).toEqual([]);
    const none = parseLocalDecks([]);
    expect(none.decks).toEqual([]);
    expect(none.errors).toEqual([]);
    expect(playDeckOptions([], [], none.decks).map((o) => o.kind)).toEqual([
      "official",
      "official",
      ...TEST_DECK_SETS.map(() => "random"),
    ]);
  });

  it("a deck stored in this browser with a file deck's name shows only the file deck", () => {
    const stored = [
      named("tournament/Night Shift"),
      named("Harbor Watch"),
      named("Kept"),
    ];
    expect(
      importedOptions(stored, fixture.decks).map((o) => [o.key, o.label]),
    ).toEqual([["imported:2", "Kept"]]);
    // Labelled without the [deck] folder and grouped by it, like the file decks; keys unchanged.
    const foldered = importedOptions([
      named("Community/Pier Patrol"),
      named("Loose Ends"),
      named("Community/"),
    ]);
    expect(foldered.map((o) => [o.key, o.label, o.group])).toEqual([
      ["imported:0", "Pier Patrol", "Community"],
      ["imported:1", "Loose Ends", undefined],
      ["imported:2", "Community/", undefined],
    ]);
    expect(
      pickerGroups(foldered).map((g) => [
        g.label,
        g.options.map((o) => o.label),
      ]),
    ).toEqual([
      ["Development: imported in /debug", ["Loose Ends", "Community/"]],
      ["Development: imported in /debug › Community", ["Pier Patrol"]],
    ]);
    const all = deckOptions(stored, fixture.decks);
    expect(all.filter((o) => o.label === "Harbor Watch")).toHaveLength(1);
    expect(all.find((o) => o.label === "Harbor Watch")?.kind).toBe("file");
  });

  it("the filter narrows development decks by name, file or folder; starters and picks stay", () => {
    const options = playDeckOptions([], [named("Kept")], fixture.decks);
    const labels = (filter: string, keep: string[] = []) =>
      pickerGroups(options, filter, keep).flatMap((g) =>
        g.options.map((o) => `${g.label}: ${o.label}`),
      );
    expect(labels("shift")).toEqual([
      "Starters: ESD01 official",
      "Starters: ESD02 official",
      "Development: club-nights.txt › tournament: Night Shift",
    ]);
    expect(labels("TOURNAMENT")).toHaveLength(4);
    // A file name matches every deck in it.
    expect(labels("club-nights")).toHaveLength(6);
    expect(labels("sample-binder")).toContain(
      "Development: sample-binder.txt › archive: Old Faithful",
    );
    expect(labels("kept")).toContain("Development: imported in /debug: Kept");
    // A picked deck stays listed whatever the filter.
    expect(
      labels("zzz", ["file:sample-binder.txt:archive/Old Faithful"]),
    ).toContain("Development: sample-binder.txt › archive: Old Faithful");
    expect(matchesFilter(fileOptions(fixture.decks)[0]!, "  harbor ")).toBe(
      true,
    );
  });
});

describe("/debug import", () => {
  it("a deck with a stored deck's name replaces it in place; new names are added; nothing doubles", () => {
    const a = named("A");
    const b = named("B");
    const b2 = named("B", { name: "", monsterDeck: [], mainDeck: [] });
    const c = named("C");
    const next = replaceByName([a, b], [b2, c]);
    expect(next.map((d) => d.name)).toEqual(["A", "B", "C"]);
    expect(next[1]).toBe(b2);
    // Importing the same file twice gives the same list.
    expect(replaceByName(next, [b2, c])).toEqual(next);
  });
});

describe("production builds never include local-decks", () => {
  it("the plugin serves the files in the dev server and nothing in a build", async () => {
    const load = async (command: "serve" | "build") => {
      const plugin = localDecksPlugin(FIXTURE);
      const hook = <T>(h: unknown): T =>
        (typeof h === "function" ? h : (h as { handler: T }).handler) as T;
      hook<(c: { command: string }) => void>(plugin.configResolved)({
        command,
      });
      const id = hook<(id: string) => string>(plugin.resolveId).call(
        {},
        LOCAL_DECKS_MODULE,
      );
      return hook<(id: string) => string>(plugin.load).call({}, id);
    };
    expect(await load("serve")).toContain("Harbor Watch");
    expect(await load("build")).toBe("export const files = [];");
  });

  it("a real build with the fixture folder has none of its deck text", async () => {
    const { build } = await import("vite");
    const out = mkdtempSync(join(tmpdir(), "gojisim-build-"));
    const saved = process.env["GOJISIM_LOCAL_DECKS"];
    process.env["GOJISIM_LOCAL_DECKS"] = FIXTURE;
    try {
      await build({
        root: new URL("../..", import.meta.url).pathname,
        logLevel: "silent",
        build: { outDir: out, emptyOutDir: true },
      });
    } finally {
      if (saved === undefined) delete process.env["GOJISIM_LOCAL_DECKS"];
      else process.env["GOJISIM_LOCAL_DECKS"] = saved;
    }
    const text = readdirSync(join(out, "assets"))
      .filter((f) => /\.(js|css|html)$/.test(f))
      .map((f) => readFileSync(join(out, "assets", f), "utf8"))
      .join("\n");
    rmSync(out, { recursive: true, force: true });
    expect(text.length).toBeGreaterThan(1000);
    for (const name of [
      "Harbor Watch",
      "Night Shift",
      "Old Faithful",
      "XYZ-999",
    ])
      expect(text, name).not.toContain(name);
  }, 120_000);
});

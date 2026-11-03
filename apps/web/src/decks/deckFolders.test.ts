import { describe, expect, it } from "vitest";
import { folderOf, foldersOf, matchesSearch, NO_FOLDER } from "./deckFolders";

describe("My decks folders and search (#181)", () => {
  it("a folder is the name before the last slash; a deck without one has none", () => {
    expect(folderOf("Paul's Decks/2026-06-01 Red Fest")).toBe("Paul's Decks");
    expect(folderOf("Club/Tests/Blue Hoard")).toBe("Club/Tests");
    expect(folderOf("Rager")).toBeNull();
    // Nothing after the slash: the whole name stays a name.
    expect(folderOf("Community/")).toBeNull();
  });

  it("search matches deck and folder names, ignoring case", () => {
    expect(matchesSearch("Paul's Decks/Red Fest", "red")).toBe(true);
    expect(matchesSearch("Paul's Decks/Red Fest", "PAUL")).toBe(true);
    expect(matchesSearch("Paul's Decks/Red Fest", "blue")).toBe(false);
    expect(matchesSearch("Anything", "  ")).toBe(true);
  });

  it("groups by folder, A to Z, No folder last, and leaves out folders with no match", () => {
    const decks = [
      { name: "Rager" },
      { name: "Tuscan's Decks/Ghigandorah" },
      { name: "Paul's Decks/Red Fest" },
      { name: "Paul's Decks/Blue Fest" },
      { name: "ian's decks/Shin Combo" },
    ];
    expect(
      foldersOf(decks, "").map((f) => [f.name, f.decks.map((d) => d.name)]),
    ).toEqual([
      ["ian's decks", ["ian's decks/Shin Combo"]],
      ["Paul's Decks", ["Paul's Decks/Red Fest", "Paul's Decks/Blue Fest"]],
      ["Tuscan's Decks", ["Tuscan's Decks/Ghigandorah"]],
      [NO_FOLDER, ["Rager"]],
    ]);
    expect(foldersOf(decks, "fest").map((f) => f.name)).toEqual([
      "Paul's Decks",
    ]);
    // A folder's name matches all its decks.
    expect(foldersOf(decks, "tuscan")[0]?.decks).toHaveLength(1);
  });
});

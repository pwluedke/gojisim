import { describe, expect, it } from "vitest";
import { savedDeck, tagsOf, withTags } from "../game/deckStore";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { byName, hasAllTags, tagCounts, toggleTag } from "./deckTags";

// Paul, Nov 9: one flat deck list with tags in place of folders.

describe("deck tags", () => {
  it("counts each tag once per deck, ignoring case: most used first, then A–Z", () => {
    expect(
      tagCounts([
        ["Meta", "Bot training"],
        ["meta"],
        ["Mine", "Bot training"],
        [],
      ]),
    ).toEqual([
      { tag: "Bot training", count: 2 },
      { tag: "Meta", count: 2 },
      { tag: "Mine", count: 1 },
    ]);
  });

  it("several selected tags match only decks with all of them; none selected matches all", () => {
    expect(hasAllTags(["Meta", "Bot training"], ["meta", "Bot training"])).toBe(
      true,
    );
    expect(hasAllTags(["Meta"], ["Meta", "Bot training"])).toBe(false);
    expect(hasAllTags([], [])).toBe(true);
  });

  it("toggles a tag in the selection, ignoring case", () => {
    expect(toggleTag(["Meta"], "Mine")).toEqual(["Meta", "Mine"]);
    expect(toggleTag(["Meta", "Mine"], "meta")).toEqual(["Mine"]);
  });

  it("sorts names A–Z ignoring case", () => {
    expect([{ name: "b" }, { name: "A" }, { name: "c" }].sort(byName)).toEqual([
      { name: "A" },
      { name: "b" },
      { name: "c" },
    ]);
  });

  it("a saved deck's tags live in its list text: set, read, and cleared", () => {
    const deck = parseDeckList(
      "[deck] Red\n[monster deck]\n1 ESD01-001\n[main deck]\n2 ESD01-012\n",
    ).decks[0]!;
    const saved = savedDeck(deck, "Red");
    expect(tagsOf(saved)).toEqual([]);
    const tagged = withTags(saved, ["Meta", " Mine ", "meta"])!;
    expect(tagsOf(tagged)).toEqual(["Meta", "Mine"]);
    expect(tagged.list).toContain("tags: Meta, Mine");
    expect(tagged.id).toBe(saved.id);
    expect(tagsOf(withTags(tagged, [])!)).toEqual([]);
    expect(withTags(tagged, [])!.list).not.toContain("tags:");
  });
});

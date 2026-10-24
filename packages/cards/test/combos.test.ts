import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCardAbilities, getCombos } from "../src";
import { getAllCards } from "../src/testDecks";

/** `### N. Name` headings in docs/combos/combos.md, with the deck of their section. */
function documented(): { name: string; deck: string }[] {
  const text = readFileSync(
    new URL("../../../docs/combos/combos.md", import.meta.url),
    "utf8",
  );
  const found: { name: string; deck: string }[] = [];
  let deck = "";
  for (const line of text.split("\n")) {
    const section = /^## .*\(([A-Z]+\d*)\)\s*$/.exec(line);
    if (section) deck = section[1] as string;
    const heading = /^### \d+\. (.+?)\s*$/.exec(line);
    if (heading) found.push({ name: heading[1] as string, deck });
  }
  return found;
}

describe("combo data (M5g)", () => {
  it("every combo in combos.md has a JSON entry in its deck's file, and the reverse", () => {
    const docs = documented();
    expect(docs).toHaveLength(7);
    const data = getCombos().map((c) => ({ name: c.name, deck: c.deck }));
    expect(data).toEqual(expect.arrayContaining(docs));
    expect(docs).toEqual(expect.arrayContaining(data));
    expect(data).toHaveLength(docs.length);
  });

  it("every card number and ability id in the combos exists", () => {
    const numbers = new Set(getAllCards().map((c) => c.deckCardNumber));
    for (const combo of getCombos()) {
      for (const card of combo.cards) expect(numbers, combo.id).toContain(card);
      const refs = JSON.stringify(combo.success).match(
        /"[A-Z]+\d*-\d+#[a-z0-9-]+"/g,
      );
      for (const ref of refs ?? []) {
        const [number = "", id] = ref.slice(1, -1).split("#");
        const ids = getCardAbilities(number).abilities.flatMap((a) =>
          "id" in a ? [a.id] : [],
        );
        expect(ids, `${combo.id}: ${ref}`).toContain(id);
      }
    }
  });
});

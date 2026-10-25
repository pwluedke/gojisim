import { readFileSync, writeFileSync } from "node:fs";
import { type Ability, getCardAbilities, loadAbilities } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import { abilityById, describeAbility } from "./plainWords";

/** Abilities that ask yes/no (M5h #16): optional, an optional cost or replacement, Evolution, a "may" Revenge. */
function asks(ability: Ability): boolean {
  if (ability.kind === "triggered")
    return ability.optional === true || ability.cost?.optional === true;
  if (ability.kind === "replacement") return ability.optional === true;
  if (ability.kind === "keyword")
    return (
      ability.keyword.name === "evolution" ||
      (ability.keyword.name === "revenge" && ability.keyword.optional === true)
    );
  return false;
}

const idOf = (number: string, ability: Ability) =>
  `${number}#${"id" in ability ? ability.id : ability.keyword.name}`;

const FALLBACKS = new URL("./plainWordsFallbacks.json", import.meta.url);

describe("plain-words decision prompts (M5h #16)", () => {
  it.each([
    // A rank read from the paid card isn't worded: the printed text shows alone.
    ["ESD02-004#invading-destroy", "fallback"],
    [
      "EBP02-052#invading-crystals",
      'Discard 1 card from your hand to play 1 "Crystals" token.',
    ],
    [
      "ESD02-007#evolution",
      "Evolve this card: search your deck for a rank 5 or lower [Mothra] battle card and play it on top of this card.",
    ],
    ["EBP04-053#enter-swap", null],
  ])("%s reads %s", (id, start) => {
    const ability = abilityById(id);
    expect(ability).toBeDefined();
    const words = describeAbility(ability as Ability);
    if (start === null) expect(words).not.toBeNull();
    else if (start === "fallback") expect(words).toBeNull();
    else expect(words?.startsWith(start.replace(/\.$/, ""))).toBe(true);
  });

  it("lists every yes/no ability that falls back to its printed text (plainWordsFallbacks.json)", () => {
    const fallbacks: string[] = [];
    let asking = 0;
    for (const number of [...loadAbilities().keys()].sort())
      for (const ability of getCardAbilities(number).abilities) {
        if (!asks(ability)) continue;
        asking++;
        if (describeAbility(ability) === null)
          fallbacks.push(idOf(number, ability));
      }
    // To refresh after improving the describer: GOJISIM_UPDATE_FALLBACKS=1 pnpm test.
    if (process.env["GOJISIM_UPDATE_FALLBACKS"])
      writeFileSync(FALLBACKS, `${JSON.stringify(fallbacks, null, 2)}\n`);
    const listed = JSON.parse(readFileSync(FALLBACKS, "utf8")) as string[];
    expect(fallbacks).toEqual(listed);
    // Most prompts get words.
    expect(fallbacks.length).toBeLessThan(asking / 2);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FightCard, MYSTERY_DECK } from "./FightCard";
import { crackPaths, slamDurations } from "./slam";

describe("invasion-win slam (M5h #20)", () => {
  it("the cracks are seeded: the same monster cracks the same way, another differently", () => {
    expect(crackPaths("c265")).toEqual(crackPaths("c265"));
    expect(crackPaths("c265")).not.toEqual(crackPaths("c266"));
    // Every crack stays near the 200 × 200 box.
    for (const d of crackPaths("c265"))
      for (const n of d.match(/-?\d+(\.\d+)?/g) ?? [])
        expect(Math.abs(Number(n) - 100)).toBeLessThan(140);
  });

  it("Fast takes half of Normal; Off has no motion", () => {
    const normal = slamDurations("normal");
    const fast = slamDurations("fast");
    for (const key of ["lift", "slam", "crater"] as const)
      expect(fast[key]).toBe(normal[key] / 2);
    expect(slamDurations("off")).toEqual({ lift: 0, slam: 0, crater: 0 });
  });
});

describe("fight card (M5h #18)", () => {
  it("your deck, VS, the opponent's deck; a bot side adds its level; a missing name is a Mystery Deck", () => {
    const html = renderToStaticMarkup(
      <FightCard
        you={{ deck: "Burning Tokyo" }}
        opp={{ deck: undefined, bot: "Bot (Hard)" }}
      />,
    );
    const order = ["Burning Tokyo", ">VS<", MYSTERY_DECK, "Bot (Hard)"].map(
      (text) => html.indexOf(text),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(html).not.toContain('data-testid="fight-bot-you"');
  });
});

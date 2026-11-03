import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * #182: hovering Godzilla Against Mechagodzilla (EBP01-073) in your hand shows how many more
 * monster cards your discard pile needs before it can be played (8.2: 7 or fewer forbids it).
 */

type Card = { id: number; deckCardNumber: string };
const cards = JSON.parse(
  readFileSync(
    new URL("../../../packages/cards/data/cards.json", import.meta.url),
    "utf8",
  ),
) as Card[];
const GAM = cards.find((c) => c.deckCardNumber === "EBP01-073") as Card;

/** A made-up deck pair: ESD01's monsters, a main deck of GAM and ESD01 cards, from a fixture. */
function record(): Record<string, unknown> {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/hand-count-five.json", import.meta.url),
      "utf8",
    ),
  ) as { decks: { monsterDeck: Card[]; mainDeck: Card[] }[]; seats: unknown };
  const [p1, p2] = fixture.decks;
  if (!p1 || !p2) throw new Error("fixture decks");
  return {
    version: 1,
    seed: 182,
    decks: [
      {
        id: "P1",
        monsterDeck: p1.monsterDeck,
        mainDeck: p1.mainDeck.map((c, i) => (i % 2 === 0 ? GAM : c)),
      },
      { id: "P2", ...p2 },
    ],
    actions: [],
    seats: fixture.seats,
    botSeed: "182-bots",
  };
}

async function load(page: Page) {
  await page.goto("/play?mode=bot");
  await page.getByTestId("load-record").setInputFiles({
    name: "gam.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(record())),
  });
  await expect(page.getByTestId("board")).toBeVisible();
}

test("#182: hovering GAM in your hand shows the monster cards your discard pile still needs", async ({
  page,
}) => {
  await load(page);
  const gam = page
    .getByTestId("your-hand")
    .getByTestId("hand-card")
    .filter({ has: page.locator(`[data-card-id="${GAM.id}"]`) })
    .first();
  await expect(gam).toBeVisible();
  await gam.locator("div").last().hover();
  // The game's first turn: no monster cards in the discard pile yet, so all 8 are needed.
  await expect(page.getByTestId("tooltip")).toHaveText(
    "8 more monster cards needed in your discard pile to play this.",
  );
});

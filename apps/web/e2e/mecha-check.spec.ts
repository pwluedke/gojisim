import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * #138 Mecha-Check: hovering Mecha-King Ghidorah (EBP02-068) in your hand shows the app's tooltip
 * with the King Ghidorah cards its discard pile still needs; other hand cards show none.
 */

type Card = { id: number; deckCardNumber: string };
const data = (path: string) =>
  readFileSync(
    new URL(`../../../packages/cards/data/${path}`, import.meta.url),
    "utf8",
  );
const cards = JSON.parse(data("cards.json")) as Card[];
const byNumber = (n: string) =>
  cards.find((c) => c.deckCardNumber === n) as Card;
const MECHA = byNumber("EBP02-068");

/** A made-up deck pair: ESD01's monsters, a main deck of Mecha-King Ghidorah and ESD01 cards. */
function record(): Record<string, unknown> {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/hand-count-five.json", import.meta.url),
      "utf8",
    ),
  ) as {
    decks: { monsterDeck: Card[]; mainDeck: Card[] }[];
    seats: unknown;
  };
  const [p1, p2] = fixture.decks;
  if (!p1 || !p2) throw new Error("fixture decks");
  return {
    version: 1,
    seed: 138,
    decks: [
      {
        id: "P1",
        monsterDeck: p1.monsterDeck,
        mainDeck: p1.mainDeck.map((c, i) => (i % 2 === 0 ? MECHA : c)),
      },
      { id: "P2", ...p2 },
    ],
    actions: [],
    seats: fixture.seats,
    botSeed: "138-bots",
  };
}

async function load(page: Page) {
  await page.goto("/play?mode=bot");
  await page.getByTestId("load-record").setInputFiles({
    name: "mecha-check.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(record())),
  });
  await expect(page.getByTestId("board")).toBeVisible();
}

const handCard = (page: Page, id: number, has: boolean) =>
  page
    .getByTestId("your-hand")
    .getByTestId("hand-card")
    .filter({
      [has ? "has" : "hasNot"]: page.locator(`[data-card-id="${id}"]`),
    })
    .first();

test("#138: hovering Mecha-King Ghidorah in your hand shows how many King Ghidorah cards it still needs; other cards show no Mecha-Check", async ({
  page,
}) => {
  await load(page);
  const mecha = handCard(page, MECHA.id, true);
  await expect(mecha).toBeVisible();
  await mecha.locator("div").last().hover();
  const tip = page.getByTestId("tooltip");
  // Rank 23 with no King Ghidorah cards in the discard pile, the opponent's monster near the start.
  await expect(tip).toHaveText(
    /^Mecha-Check: \d+ more King Ghidorah cards needed in your discard pile to play this\.$/,
  );
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);
  const other = handCard(page, MECHA.id, false);
  await other.locator("div").last().hover();
  await expect(page.getByTestId("card-preview")).toBeVisible();
  await expect(page.getByTestId("tooltip")).toHaveCount(0);
});

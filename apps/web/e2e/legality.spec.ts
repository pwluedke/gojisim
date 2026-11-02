import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { importInDeckbuilder, startGame } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Deck legality by match mode: Tournament games take legal decks only (6.1.1, restriction lists);
 * Casual games play an illegal deck with a warning on its mat all game.
 */

/** A godzillatcgdb.com printable list: 4 monster cards and 47 main deck cards (6.1.1.2). */
const shortList = readFileSync(
  new URL(
    "../../../packages/cards/test/fixtures/godzillatcgdb-print-tabs.txt",
    import.meta.url,
  ),
  "utf8",
);

/** Saves the short deck in the Deckbuilder (#161), then picks it for P1 in a Casual game. */
async function importShortDeck(page: Page) {
  await importInDeckbuilder(page, shortList, "Short Gigan");
  await page.goto("/play?mode=bot");
  await page.getByTestId("deck-P1").selectOption({ label: "Short Gigan" });
  await expect(page.getByTestId("deck-P1")).toHaveValue(/^mine:/);
}

test("Tournament: an illegal deck can't be picked (6.1.1.2), and Casual offers it again", async ({
  page,
}) => {
  await importShortDeck(page);
  // A match type switch resets both seats to the starters, which are legal.
  await page.getByTestId("match-mode-tournament").check();
  await expect(page.getByTestId("deck-P1")).toHaveValue("official:ESD01");
  await expect(page.getByTestId("start-game")).toBeEnabled();
  await expect(
    page.getByTestId("deck-P1").locator("option", { hasText: "Short Gigan" }),
  ).toHaveText("Short Gigan (illegal)");
  await expect(
    page.getByTestId("deck-P1").locator("option", { hasText: "Short Gigan" }),
  ).toHaveAttribute("disabled", "");
  await expect(page.getByTestId("tournament-blocked-P1")).toHaveCount(0);
  // Casual offers the illegal deck again, with its warning badge.
  await page.getByTestId("match-mode-casual").check();
  await expect(
    page
      .getByTestId("deck-P1")
      .locator("option", { hasText: "Short Gigan" })
      .first(),
  ).not.toHaveAttribute("disabled");
});

test("Casual: an illegal deck plays, with a warning on its mat for the whole game", async ({
  page,
}) => {
  await importShortDeck(page);
  await expect(page.getByTestId("match-mode-casual")).toBeChecked();
  await expect(page.getByTestId("start-game")).toBeEnabled();
  // Two bots play on their own, so the game moves on without a human; P1 stays at the bottom.
  await page.getByTestId("seat-P1").selectOption("bot");
  await startGame(page);
  const warning = page.getByTestId("deck-warning-P1");
  await expect(warning).toContainText("Illegal deck");
  // #108: the badge counts the reasons; M13b's plain reasons are its tooltip.
  await expect(warning.getByTestId("deck-warning-count")).toHaveText(
    "1 reason",
  );
  await expect(warning).toHaveAttribute(
    "title",
    "Main deck: 47 cards, needs exactly 50",
  );
  // It sits on P1's mat; the bot's legal deck has none.
  await expect(
    page.getByTestId("mat-you").getByTestId("deck-warning-P1"),
  ).toBeVisible();
  await expect(page.getByTestId("deck-warning-P2")).toHaveCount(0);
  // Still there turns later.
  await expect
    .poll(async () => Number(await page.getByTestId("turn").textContent()), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(3);
  await expect(warning).toBeVisible();
});

test("the badges name a restricted card, its limit and the date (Gravity Beam, banned since Sep 1, 2026)", async ({
  page,
}) => {
  // The ESD01 starter with one invasion-icon-2 card swapped for Gravity Beam (EBP01-079: White
  // and icon 2, so colors and the icon-2 count stay legal): only the restriction list fails.
  const starter = readFileSync(
    new URL(
      "../../../packages/cards/data/decks/esd01-starter.txt",
      import.meta.url,
    ),
    "utf8",
  );
  const list = starter
    .replace("[deck] Starter Deck - Godzilla Minus One", "[deck] Beam Test")
    .replace("\n2 ESD01-004\n", "\n1 ESD01-004\n1 EBP01-079\n");
  expect(list).toContain("1 EBP01-079");
  await importInDeckbuilder(page, list, "Beam Test");
  await page.goto("/play?mode=bot");
  await page.getByTestId("deck-P1").selectOption({ label: "Beam Test" });
  const reason = "Gravity Beam (EBP01-079): banned since Sep 1, 2026";
  const badge = page.getByTestId("seat-panel-P1").getByTestId("legality");
  await expect(badge).toHaveText(`Warnings: ${reason}`);
  await expect(badge).toHaveAttribute("title", reason);
  await page.getByTestId("seat-P1").selectOption("bot");
  await startGame(page);
  const warning = page.getByTestId("deck-warning-P1");
  await expect(warning.getByTestId("deck-warning-count")).toHaveText(
    "1 reason",
  );
  await expect(warning).toHaveAttribute("title", reason);
});

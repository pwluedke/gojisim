import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { startGame } from "./helpers";

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

async function importShortDeck(page: Page) {
  await page.goto("/play?mode=bot");
  await page.getByTestId("import-deck").click();
  await page.getByTestId("import-text").fill(shortList);
  await page.getByTestId("import-name").fill("Short Gigan");
  await page.getByTestId("import-save").click();
  // The saved deck is P1's pick.
  await expect(page.getByTestId("deck-P1")).toHaveValue(/^mine:/);
}

test("Tournament: an illegal deck can't be picked, the seat says why, and Start is blocked", async ({
  page,
}) => {
  await importShortDeck(page);
  await page.getByTestId("match-mode-tournament").check();
  await expect(
    page.getByTestId("deck-P1").locator("option", { hasText: "Short Gigan" }),
  ).toHaveText("Short Gigan (illegal)");
  await expect(
    page.getByTestId("deck-P1").locator("option", { hasText: "Short Gigan" }),
  ).toHaveAttribute("disabled", "");
  await expect(page.getByTestId("tournament-blocked-P1")).toContainText(
    "6.1.1.2: Main deck needs exactly 50 cards (has 47)",
  );
  await expect(page.getByTestId("tournament-blocked-P2")).toHaveCount(0);
  await expect(page.getByTestId("start-game")).toBeDisabled();
  await expect(page.getByTestId("start-blocked")).toContainText("P1");
  // A legal deck clears it.
  await page.getByTestId("deck-P1").selectOption("official:ESD01");
  await expect(page.getByTestId("tournament-blocked-P1")).toHaveCount(0);
  await expect(page.getByTestId("start-game")).toBeEnabled();
  // Casual offers the illegal deck again, with its warning badge.
  await page.getByTestId("match-mode-casual").check();
  await expect(
    page.getByTestId("deck-P1").locator("option", { hasText: "Short Gigan" }),
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
  await expect(warning).toContainText("6.1.1.2");
  await expect(warning).toHaveAttribute(
    "title",
    "6.1.1.2: Main deck needs exactly 50 cards (has 47)",
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

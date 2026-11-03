import { expect, type Page, test } from "@playwright/test";
import { startGame } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/** #183: Rematch on the game-over screen starts the same matchup again with a new shuffle. */

async function pickFirst(page: Page) {
  const pick = page.getByTestId("first-pick");
  await expect(page.getByTestId("board")).toBeVisible();
  if (!(await pick.isVisible())) return;
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(pick).toHaveCount(0);
}

async function concede(page: Page) {
  await page.getByTestId("concede").click();
  await page.getByTestId("confirm-yes").click();
  await expect(page.getByTestId("game-over-modal")).toBeVisible();
}

test("finish a game, press Rematch: the same decks and bot level, a new game at turn 1", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("deck-P1").selectOption("official:ESD02");
  await page.getByTestId("deck-P2").selectOption("official:ESD01");
  await page.getByTestId("preset-P2-hard").click();
  await startGame(page);
  const you = await page.getByTestId("fight-deck-you").textContent();
  const opp = await page.getByTestId("fight-deck-opp").textContent();
  const bot = await page.getByTestId("fight-card").textContent();
  expect(bot).toContain("Hard");
  await concede(page);
  // Rematch is the primary button, next to Close.
  const rematch = page.getByTestId("rematch");
  await expect(rematch).toHaveAttribute("data-primary");
  await expect(page.getByTestId("game-over-close")).toBeVisible();
  await rematch.click();
  await pickFirst(page);
  await expect(page.getByTestId("game-over-modal")).toHaveCount(0);
  await expect(page.getByTestId("turn")).toHaveText(/^[12]$/);
  await expect(page.getByTestId("fight-deck-you")).toHaveText(you ?? "");
  await expect(page.getByTestId("fight-deck-opp")).toHaveText(opp ?? "");
  await expect(page.getByTestId("fight-card")).toContainText("Hard");
  // The new game isn't over: no game-over line in the prompt.
  await expect(page.getByTestId("game-over")).toHaveCount(0);
});

test("after Close, the Prompt offers Rematch beside the New game link", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await startGame(page);
  await concede(page);
  await page.getByTestId("game-over-close").click();
  await expect(page.getByTestId("rematch-prompt")).toBeVisible();
});

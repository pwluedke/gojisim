import { expect, test } from "@playwright/test";
import { startGame } from "./helpers";

/**
 * Beta (Paul, Nov 13, 2026): bot difficulty is locked at 100. The other specs run with the
 * dev server's unlock key (animation-off.json); this one removes it, as production has none.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.removeItem("gojisim.e2e.unlockBotLevel"),
  );
});

const NOTE = "Bot difficulty is locked to Hard during the beta.";

test("the bot level controls show 100, can't be changed, and say why", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  const slider = page.getByTestId("difficulty-P2");
  await expect(slider).toBeDisabled();
  await expect(slider).toHaveValue("100");
  await expect(page.getByTestId("difficulty-value-P2")).toHaveText(
    "100 (Level 100)",
  );
  for (const name of ["easy", "medium", "hard"])
    await expect(page.getByTestId(`preset-P2-${name}`)).toBeDisabled();
  await expect(page.getByTestId("difficulty-lock-P2")).toHaveText(NOTE);
  // The same text as the tooltip on the controls.
  await expect(slider.locator("..")).toHaveAttribute("title", NOTE);
  // A second bot seat is locked too.
  await page.getByTestId("seat-P1").selectOption("bot");
  await expect(page.getByTestId("difficulty-P1")).toBeDisabled();
  await expect(page.getByTestId("difficulty-P1")).toHaveValue("100");
});

test("a new game's bot plays at 100", async ({ page }) => {
  await page.goto("/play?mode=bot");
  await startGame(page);
  await expect(page.getByTestId("fight-card")).toContainText("Level 100");
});

test("Ian and Tuscancow (Nov 14): a new game against the bot starts with its hand face up, and it can still be turned off", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await startGame(page);
  const hand = page.getByTestId("opponent-hand");
  await expect(hand.getByTestId("card").first()).toBeVisible();
  await expect(hand.getByTestId("opponent-card-back")).toHaveCount(0);
  await page.getByTestId("test-settings").click();
  const toggle = page.getByTestId("show-opponent-hand");
  await expect(toggle).toBeChecked();
  // Off hides it (backs only), and asks nothing.
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(hand.getByTestId("opponent-card-back").first()).toBeVisible();
  await expect(hand.getByTestId("card")).toHaveCount(0);
});

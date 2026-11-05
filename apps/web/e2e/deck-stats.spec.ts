import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

/** #159: the deck panel's stats and a sample opening hand, on the ESD01 starter. */
async function loadStarter(page: Page) {
  await page.goto("/decks");
  await page.getByTestId("db-my-decks").click();
  await page.getByTestId("db-starter").first().getByTestId("db-load").click();
  await expect(page.getByTestId("db-decks-window")).toHaveCount(0);
}

test("#159: Stats folds open to types, colors, icon 2 and the rank curve; folded it's the counts line, and it's remembered", async ({
  page,
}) => {
  await loadStarter(page);
  const toggle = page.getByTestId("db-stats-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("db-counts")).toContainText("Battle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("db-counts")).toHaveCount(0);
  await expect(page.getByTestId("db-stats-types")).toContainText("Monster");
  await expect(page.getByTestId("db-stats-icon2")).toContainText("/ 10");
  // Eight bars, ranks 1 to 8, adding up to the 50-card main deck's ranked cards.
  const bars = page.getByTestId("db-stats-bar");
  await expect(bars).toHaveCount(8);
  const counts = await bars.evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute("data-count"))),
  );
  expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(40);
  // Remembered after a reload.
  await page.reload();
  await expect(page.getByTestId("db-stats-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("#159: Sample hand shows 5 cards (6.3.1.5); Draw again draws a new seed; Esc and ✕ close it", async ({
  page,
}) => {
  await loadStarter(page);
  await page.getByTestId("db-sample-hand").click();
  const hand = page.getByTestId("db-hand");
  await expect(hand).toBeVisible();
  await expect(page.getByTestId("db-hand-card")).toHaveCount(5);
  const seed = await page.getByTestId("db-hand-seed").textContent();
  await page.getByTestId("db-hand-again").click();
  await expect(page.getByTestId("db-hand-seed")).not.toHaveText(seed ?? "");
  await expect(page.getByTestId("db-hand-card")).toHaveCount(5);
  // A card opens in the detail panel.
  await page.getByTestId("db-hand-card").first().click();
  await expect(page.getByTestId("db-card-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(hand).toHaveCount(0);
  await page.getByTestId("db-sample-hand").click();
  await page.getByTestId("db-hand-close").click();
  await expect(hand).toHaveCount(0);
});

test("#159: Sample hand is off until the main deck has 5 cards", async ({
  page,
}) => {
  await page.goto("/decks");
  await expect(page.getByTestId("db-sample-hand")).toBeDisabled();
});

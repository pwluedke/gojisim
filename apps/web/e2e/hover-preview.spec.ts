import { expect, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/** P1's play timing on turn 13 against the Medium bot (the `hand-five` fixture, as `hand.spec`). */
async function handFive(page: Page) {
  await loadFixture(page, "hand-five");
  await expect(page.getByTestId("board")).toHaveAttribute("data-bottom", "P1");
}

const preview = (page: Page) => page.getByTestId("card-preview");
const handCard = (page: Page) =>
  page.getByTestId("hand-card").first().getByTestId("card");
const boardCard = (page: Page) =>
  page.getByTestId("monster-P1").getByTestId("card");

test("#174: Card preview on hover is on by default; off, hovering hand and board cards opens no preview; on again, it does", async ({
  page,
}) => {
  await handFive(page);
  await page.getByTestId("settings").click();
  const toggle = page.getByTestId("setting-hover-preview");
  await expect(toggle).toBeChecked();
  await handCard(page).hover();
  await expect(preview(page)).toBeVisible();

  await toggle.uncheck();
  await handCard(page).hover();
  await expect(preview(page)).toHaveCount(0);
  await boardCard(page).hover();
  await expect(preview(page)).toHaveCount(0);

  // The setting is saved with the others.
  const saved = await page.evaluate(() =>
    window.localStorage.getItem("gojisim.settings"),
  );
  expect(JSON.parse(saved ?? "{}").hoverPreview).toBe(false);

  await toggle.check();
  await boardCard(page).hover();
  await expect(preview(page)).toBeVisible();
});

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { loadFixture } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

const LINES = JSON.parse(
  readFileSync(new URL("../src/play/leaveLines.json", import.meta.url), "utf8"),
) as string[];

/**
 * #211: the red header links home (`/`). During a game in `/play` it asks first, with a random
 * funny line; elsewhere it just goes.
 */

test("the header is a home link for keyboard and screen readers", async ({
  page,
}) => {
  await page.goto("/history");
  const home = page.getByTestId("header-home");
  await expect(home).toHaveAttribute("href", "/");
  await expect(home).toHaveAttribute("aria-label", "GojiSim home");
  await home.focus();
  await expect(home).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
});

test("outside a game (the new-game screen) the header goes home at once", async ({
  page,
}) => {
  await page.goto("/play");
  await page.getByTestId("header-home").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("leave-modal")).toHaveCount(0);
});

test("during a game the header asks first: Stay and fight (and Esc) keeps the game, Run away goes home", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const home = page.getByTestId("header-home");
  await home.click();
  const modal = page.getByTestId("leave-modal");
  await expect(modal).toBeVisible();
  expect(LINES).toContain(await page.getByTestId("leave-line").innerText());
  await expect(page.getByTestId("leave-stay")).toBeFocused();
  await expect(page.getByTestId("leave-stay")).toHaveText("Stay and fight");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page).toHaveURL(/\/play/);

  await home.click();
  await page.getByTestId("leave-stay").click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByTestId("board")).toBeVisible();

  await home.click();
  await page.getByTestId("leave-run").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("menu-play-bot")).toBeVisible();
});

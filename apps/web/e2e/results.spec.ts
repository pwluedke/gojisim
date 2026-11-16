import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * #340: the results page, on the made-up sample (the real results live on the server, behind
 * the sign-in; the e2e dev server has none, so `/api/results` is routed here).
 */
const sample = readFileSync(
  new URL("../../../packages/cards/test/results-sample.json", import.meta.url),
  "utf8",
);

async function open(page: Page, body = sample, status = 200) {
  await page.route("**/api/results", (route) =>
    route.fulfill({ status, contentType: "application/json", body }),
  );
  await page.goto("/results");
}

test("the menu links to the results page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("menu-results")).toHaveAttribute(
    "href",
    "/results",
  );
});

test("the page explains itself, then shows mistakes, win rates, the decks over time, the field run and every number", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByTestId("results-intro")).toContainText(
    "What this page measures.",
  );
  await expect(page.getByTestId("results-intro")).toContainText(
    "What noise is.",
  );
  // Mistakes: both of the sample's, with A and B and a result.
  const mistakes = page.getByTestId("mistake-row");
  await expect(mistakes).toHaveCount(2);
  await expect(mistakes.first()).toContainText("per 100 chances");
  await expect(mistakes.first().getByTestId("verdict")).toHaveText("Better");
  // Win rates: the guide decks only (the sample's "Other deck" is behind Show all).
  await expect(page.getByTestId("win-row")).toHaveCount(3);
  await expect(page.getByTestId("over-time-series")).toHaveCount(2);
  // The field run: guide decks' cells, the players' read, where they disagree.
  await expect(page.getByTestId("heat-cell")).toHaveCount(2);
  await expect(
    page.getByTestId("numbers-table").locator("tbody tr"),
  ).toHaveCount(3);
  // Players say (#340 part b): the sample's Wrangler-Ghidorat read, from both sides, with the
  // rough guide; the bot's 67% fits "favoured", so nothing disagrees.
  await expect(page.getByTestId("heat-read")).toHaveCount(2);
  await expect(page.getByTestId("read-bands")).toContainText("Rough guide");
  await expect(page.getByTestId("disagree")).toHaveCount(0);
  // Show all: the other deck too.
  await page.getByTestId("results-show-all").check();
  await expect(page.getByTestId("win-row")).toHaveCount(4);
  await expect(page.getByTestId("heat-cell")).toHaveCount(6);
  await expect(page.getByTestId("over-time-series")).toHaveCount(3);
  // The other deck's "heavily favoured" read against its 48%: a disagreement.
  await expect(page.getByTestId("heat-read")).toHaveCount(4);
  await expect(page.getByTestId("disagree")).toContainText(
    "Other deck (sample) vs Ghidorat (sample)",
  );
});

test("the table sorts by a column's heading", async ({ page }) => {
  await open(page);
  const table = page.getByTestId("numbers-table");
  await table.getByRole("button", { name: /^Deck/ }).click();
  const decks = await table
    .locator("tbody tr td:nth-child(3)")
    .allTextContents();
  expect(decks).toEqual([...decks].sort());
});

test("without results (signed out, or none on the server) the page says so", async ({
  page,
}) => {
  await open(page, JSON.stringify({ error: "x" }), 404);
  await expect(page.getByTestId("results-missing")).toBeVisible();
});

test("at phone width the page has no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await open(page);
  await expect(page.getByTestId("win-row").first()).toBeVisible();
  const [scroll, width] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(width);
});

test("#365: the Kaiju Classroom agreement, per deck over time and by bot version", async ({
  page,
}) => {
  const row = (
    date: string,
    deck: string,
    botVersion: string,
    turns: number,
    same: number,
  ) => ({
    date,
    deck,
    botVersion,
    turns,
    same,
    aboutSame: 0,
    worse: turns - same,
    better: 0,
  });
  await page.route("**/api/results/classroom", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rows: [
          row("2026-11-14", "Wrangler", "2026-11-14", 4, 1),
          row("2026-11-15", "Wrangler", "2026-11-15", 4, 3),
          row("2026-11-15", "Ghidorat", "2026-11-15", 2, 2),
          row("2026-11-15", "Other deck (sample)", "2026-11-15", 2, 0),
        ],
      }),
    }),
  );
  await open(page);
  const agreement = page.getByTestId("agreement");
  await expect(agreement.getByTestId("agreement-series")).toHaveCount(2);
  await expect(agreement.getByTestId("agreement-row")).toHaveCount(3);
  await expect(agreement.getByTestId("agreement-row").nth(1)).toContainText(
    "1 (25.0%)",
  );
  await page.getByTestId("results-show-all").check();
  await expect(agreement.getByTestId("agreement-series")).toHaveCount(3);
});

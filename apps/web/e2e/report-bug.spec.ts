import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { fixture, loadFixture } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Report bug (deploy for testers): a button in `/play`'s left column, under Settings, downloads
 * the current game record as JSON (the format `/debug` exports and "Load a game record" reads),
 * at any moment of the game: mid-choice and after the game ends included.
 */

/** Clicks Report bug and returns the downloaded record. */
async function report(page: Page): Promise<Record<string, unknown>> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("report-bug").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^gojisim-\d+-\d+\.json$/);
  return JSON.parse(readFileSync(await download.path(), "utf8")) as Record<
    string,
    unknown
  >;
}

test("mid-choice: the button works over the choice modal, and the file loads back to the same choice", async ({
  page,
}) => {
  await loadFixture(page, "confirm");
  await expect(page.getByTestId("choice-modal")).toBeVisible();
  const record = await report(page);
  const original = fixture("confirm");
  // The record as recorded, positioned at the choice.
  expect(record["seed"]).toBe(original["seed"]);
  expect(record["actions"]).toEqual(original["actions"]);
  expect(record["position"]).toBe((original["actions"] as unknown[]).length);
  await expect(page.getByTestId("report-bug-note")).toContainText(
    "Send the file to Paul",
  );
  // "Load a game record" reads it: the same choice opens.
  const heading = await page.getByTestId("choice-heading").textContent();
  await page.goto("/play?mode=bot");
  await page.getByTestId("load-record").setInputFiles({
    name: "report.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(record)),
  });
  await expect(page.getByTestId("choice-heading")).toHaveText(heading ?? "");
});

test("after the game ends: the record holds the whole game, the concession last", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.getByTestId("concede").click();
  await page.getByTestId("confirm-yes").click();
  await expect(page.getByTestId("game-over-modal")).toBeVisible();
  // Over the game-over modal too.
  const record = await report(page);
  const actions = record["actions"] as { type: string }[];
  expect(actions.at(-1)?.type).toBe("concede");
  expect(record["position"]).toBe(actions.length);
});

test("not during the First / Second pick: no game record exists yet", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("first-pick")).toBeVisible();
  await expect(page.getByTestId("report-bug")).toHaveCount(0);
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("report-bug")).toBeVisible();
});

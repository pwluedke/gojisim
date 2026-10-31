import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { fixture, loadFixture } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Report bug (deploy for testers; in the Test Site panel and behind a popup since M13b) sends the
 * current game record as JSON (the format `/debug` exports and "Load a game record" reads) to the
 * server, at any moment of the game: mid-choice and after the game ends included. A failed send
 * downloads the file instead.
 */

/** Opens Report bug and fills it in. */
async function fillReport(page: Page) {
  await page.getByTestId("report-bug").click();
  await page.getByTestId("report-name").fill("Dr. Serizawa");
  await page.getByTestId("report-text").fill("something looked wrong");
}

/** Reports a bug through the popup and returns the record it sent. */
async function report(page: Page): Promise<Record<string, unknown>> {
  await fillReport(page);
  await expect(page.getByTestId("report-submit")).toHaveText("Send");
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().endsWith("/api/games") && r.method() === "POST",
    ),
    page.getByTestId("report-submit").click(),
  ]);
  await expect(page.getByTestId("test-site-note")).toHaveText("Thanks, sent.");
  return JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
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
  await expect(page.getByTestId("report-bug")).toBeDisabled();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("report-bug")).toBeEnabled();
});

test("a failed send downloads the file instead, and says so", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.route("/api/games", (route) => route.abort(), { times: 1 });
  await fillReport(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("report-submit").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^gojisim-\d+-\d+\.json$/);
  const record = JSON.parse(
    readFileSync(await download.path(), "utf8"),
  ) as Record<string, unknown>;
  expect(record["bugReports"]).toMatchObject([
    {
      text: "something looked wrong",
      reporter: "Dr. Serizawa",
      // #136: the turn and phase, for the staff channel's post.
      when: expect.stringMatching(/^Turn \d+, \w+/),
    },
  ]);
  await expect(page.getByTestId("test-site-note")).toHaveText(
    "Couldn't send. The game file was downloaded; send it to Paul.",
  );
});

test("the Which button? help says Report bug sends the note and the game", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.getByTestId("test-settings").click();
  await page.getByTestId("which-button").click();
  await expect(page.getByTestId("which-button-report-bug")).toHaveText(
    "Report bug: something in the game itself is wrong: a rule, a card doing the wrong thing, or the screen. Your note and the game are sent to us.",
  );
});

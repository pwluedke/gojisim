import { expect, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

/*
 * #279: My games on the dev server, for a dev sign-in (`/auth/dev?as=<name>`): the games the dev
 * server stores are listed for their player, Load opens one, and an unfinished game against the
 * bot carries on (#244). Before, the dev server had no `GET /api/games/mine` and the page said to
 * sign in.
 */

test.use({ viewport: { width: 1440, height: 900 } });

/** A player of this run's own (uploads are limited per minute). */
async function signIn(page: Page) {
  const name = `Hist ${Math.floor(Math.random() * 1e6)}`;
  await page.goto(`/auth/dev?as=${encodeURIComponent(name)}&next=/history`);
  return name;
}

test("#279: a dev sign-in with no games sees 'No games yet', not 'Sign in with Discord'", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByTestId("history-empty")).toContainText("No games yet");
  await expect(page.getByTestId("history-none")).toHaveCount(0);
});

test("#279, #244: a game sent mid-game (Report bug) lists as in progress; Load carries it on, the bot moves", async ({
  page,
}) => {
  await signIn(page);
  // The fixture: P1 (you) at its play timing against a Medium bot.
  await loadFixture(page, "hand-count-five");
  await page.getByTestId("report-bug").click();
  await page.getByTestId("report-name").fill("Tester");
  await page.getByTestId("report-text").fill("checking My games");
  await page.getByTestId("report-submit").click();
  await expect(page.getByTestId("test-site-note")).toHaveText("Thanks, sent.");
  await page.goto("/history");
  const rows = page.getByTestId("history-game");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("In progress");
  await rows.first().getByTestId("history-load").click();
  await expect(page.getByTestId("board")).toBeVisible();
  const turn = Number(await page.getByTestId("turn").textContent());
  // Pass (and confirm) until P1's turn ends; the bot takes its turn and hands it back.
  const deadline = Date.now() + 60_000;
  while (!(await page.getByTestId("bot-thinking").isVisible())) {
    if (Date.now() > deadline) throw new Error("P1's turn didn't end");
    const yes = page.getByTestId("confirm-yes");
    const pass = page.getByTestId("pass");
    if (await yes.isVisible()) await yes.click();
    else if (await pass.isVisible()) await pass.click();
    else await page.waitForTimeout(100);
  }
  await expect
    .poll(async () => Number(await page.getByTestId("turn").textContent()), {
      timeout: 60_000,
    })
    .toBe(turn + 2);
});

test("#279: a conceded game lists with its result", async ({ page }) => {
  await signIn(page);
  await loadFixture(page, "hand-count-five");
  // The server's answer, so the game is stored and indexed before My games asks.
  const uploaded = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/games") &&
      r.request().method() === "POST" &&
      r.status() === 201,
  );
  await page.getByTestId("concede").click();
  await page.getByTestId("confirm-yes").click();
  await uploaded;
  await page.goto("/history");
  await expect(page.getByTestId("history-game").first()).toContainText("Lost");
});

test("#279: My games shows the player once (Showa's header has it), and on a phone the panel stays on screen", async ({
  page,
}) => {
  await signIn(page);
  const badges = page.locator('[data-testid="player-badge"]:visible');
  await expect(badges).toHaveCount(1);
  await expect(page.getByTestId("theme-header")).toContainText("Hist");
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await page.locator("main").boundingBox();
  expect(box).toBeTruthy();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(390 - 16);
  }
});

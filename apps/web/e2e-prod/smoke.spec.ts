import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * The post-deploy smoke check (#92). After Paul's push to `release`, the Smoke check workflow runs
 * it against the live site (`playwright.smoke.config.ts`, the password from the `SITE_PASSWORD`
 * secret). On every PR, `e2e:prod` runs it against the local production build, so the check itself
 * stays working. Each `test.step` names what the failure message reports.
 *
 * Public repo: the password is never printed, and a failure screenshot is taken after the login
 * page is gone (Playwright's own screenshots are off in the smoke config).
 */

const LIVE = !!process.env["SMOKE_URL"];
const PASSWORD = process.env["SMOKE_PASSWORD"] || "e2e testers only";
/** #150: with Discord sign-in (`GOJISIM_AUTH=discord`), the smoke login token instead. */
const TOKEN = process.env["SMOKE_LOGIN_TOKEN"] || "";

/** The turn number on the board. */
const turnNumber = async (page: Page) =>
  Number(await page.getByTestId("turn").textContent());

// A failure screenshot for the workflow's artifact, only once the login page is gone, so the
// password field never shows filled in.
test.afterEach(async ({ page }, testInfo) => {
  if (!LIVE || testInfo.status === testInfo.expectedStatus) return;
  if (page.url().includes("/login")) return;
  await page
    .screenshot({ path: testInfo.outputPath("failure.png") })
    .catch(() => {});
});

test("smoke: log in, start a game against Easy, play a turn, and the game's upload is stored", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Uploads from this browser say `smokeCheck`, so feedback, the win rates and #reports skip them.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gojisim.smokeCheck", "1");
    } catch {
      // A blocked store only means the upload isn't marked; the check still runs.
    }
  });
  if (!LIVE) {
    // The local build has no card art (not in git): serve the e2e suite's plain-color WebP.
    const thumb = readFileSync(
      new URL("../e2e/fixtures/plain-card.webp", import.meta.url),
    );
    await page.route(/\/cards\/[^/]+-thumb\.webp$/, (route) =>
      route.fulfill({ contentType: "image/webp", body: thumb }),
    );
  }

  await test.step("Log in", async () => {
    if (TOKEN) {
      // Discord can't be automated: the server's smoke login signs in the `smoke` player.
      const res = await page.request.post("/auth/smoke", {
        form: { token: TOKEN, next: "/play?mode=bot" },
        maxRedirects: 0,
      });
      expect(res.status()).toBe(303);
      await page.goto("/play?mode=bot");
    } else {
      await page.goto("/play?mode=bot");
      await expect(page).toHaveURL(/\/login/);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Enter" }).click();
    }
    await expect(page).toHaveURL(/\/play/);
  });

  await test.step("New-game screen", async () => {
    await expect(page.getByTestId("start-game")).toBeVisible();
    await page.getByTestId("preset-P2-easy").click();
  });

  await test.step("Start a game against Easy", async () => {
    await page.getByTestId("start-game").click();
    await expect(page.getByTestId("board")).toBeVisible();
    await expect(page.getByTestId("first-pick")).toBeVisible();
  });

  await test.step("First / Second pick", async () => {
    await page.getByTestId("first-pick-card-0").click();
    await page.getByTestId("first-pick-continue").click();
    await expect(page.getByTestId("first-pick")).toHaveCount(0);
  });

  await test.step("Card images load", async () => {
    // At least one card (the board or your hand) shows its image (a missing one is hidden on error).
    await expect
      .poll(
        () =>
          page
            .locator('img[src^="/cards/"]')
            .evaluateAll((imgs) =>
              imgs.some(
                (img) =>
                  (img as HTMLImageElement).complete &&
                  (img as HTMLImageElement).naturalWidth > 0,
              ),
            ),
        { timeout: 30_000 },
      )
      .toBe(true);
  });

  await test.step("Take one action", async () => {
    // If Easy went first, its turn plays out before Pass shows.
    await expect(page.getByTestId("pass")).toBeVisible({ timeout: 60_000 });
    const turn = await turnNumber(page);
    await page.getByTestId("pass").click();
    await page.getByTestId("confirm-yes").click();
    await expect
      .poll(() => turnNumber(page), { intervals: [200], timeout: 30_000 })
      .toBeGreaterThan(turn);
  });

  await test.step("The bot answers", async () => {
    // Easy plays its turn, and the game comes back to us.
    const turn = await turnNumber(page);
    await expect
      .poll(() => turnNumber(page), { intervals: [200], timeout: 60_000 })
      .toBeGreaterThan(turn);
    await expect(page.getByTestId("pass")).toBeVisible({ timeout: 60_000 });
  });

  await test.step("The game's upload is stored", async () => {
    const stored = page.waitForResponse(
      (r) => r.url().endsWith("/api/games") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByTestId("concede").click();
    await page.getByTestId("confirm-yes").click();
    await expect(page.getByTestId("game-over-modal")).toBeVisible();
    const res = await stored;
    expect(res.status()).toBe(201);
    expect(res.request().postDataJSON()).toMatchObject({ smokeCheck: true });
  });
});

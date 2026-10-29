import { expect, type Page, test } from "@playwright/test";
import { startGame } from "./helpers";

/**
 * Bot announcements: "Announce bot plays" shows one line per bot action in a banner over the
 * board, and the bot waits for it (at least the pace's minimum, or OK with Confirm). Off keeps
 * the move toast (decision 221). Seed 2: the bot (P2) goes first, so it acts at once.
 */

/** Saved settings: animations off (as every spec), no bot delay, and the given announcements. */
const storage = (settings: Record<string, unknown>) => ({
  cookies: [],
  origins: [
    {
      origin: "http://localhost:5179",
      localStorage: [
        {
          name: "gojisim.settings",
          value: JSON.stringify({ animation: "off", botDelay: 0, ...settings }),
        },
      ],
    },
  ],
});

/** Starts seed 2 against the bot, which goes first. */
async function botFirst(page: Page) {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("2");
  await startGame(page);
}

const logLines = (page: Page) => page.getByTestId("log-line").count();

test.describe("off", () => {
  test.use({ storageState: storage({}) });

  test("off by default: the move toast shows, with no announcement banner", async ({
    page,
  }) => {
    await botFirst(page);
    await expect(page.getByTestId("bot-toast")).toContainText("Bot (");
    await expect(page.getByTestId("bot-announcement-region")).toHaveCount(0);
    await page.getByTestId("settings").click();
    await expect(page.getByTestId("setting-announce")).not.toBeChecked();
    await expect(page.getByTestId("setting-announce-pace")).toHaveCount(0);
  });
});

test.describe("on, 2.5 s", () => {
  test.use({
    storageState: storage({ announceBotPlays: true, announcePace: 1 }),
  });

  test("each bot action shows a line, and the bot waits at least the minimum before acting again", async ({
    page,
  }) => {
    await botFirst(page);
    const line = page.getByTestId("bot-announcement");
    await expect(line).toHaveText(/^Bot /);
    await expect(page.getByTestId("bot-announcement-region")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    // The toast is replaced.
    await expect(page.getByTestId("bot-toast")).toHaveCount(0);
    const text = await line.textContent();
    const lines = await logLines(page);
    // 2.5 s minimum (longer lines stay longer): nothing new for 2 s.
    await page.waitForTimeout(2000);
    await expect(line).toHaveText(text ?? "");
    expect(await logLines(page)).toBe(lines);
    // Then the bot carries on.
    await expect
      .poll(() => logLines(page), { timeout: 30_000 })
      .toBeGreaterThan(lines);
  });
});

test.describe("on, Confirm", () => {
  test.use({
    storageState: storage({ announceBotPlays: true, announcePace: 5 }),
  });

  test("Confirm holds the bot until OK or Space", async ({ page }) => {
    test.setTimeout(60_000);
    await botFirst(page);
    const line = page.getByTestId("bot-announcement");
    await expect(page.getByTestId("announce-ok")).toHaveText("OK [Space]");
    const first = await line.textContent();
    const lines = await logLines(page);
    await page.waitForTimeout(3000);
    await expect(line).toHaveText(first ?? "");
    expect(await logLines(page)).toBe(lines);
    // Space dismisses; the bot's next action brings the next line, which waits again.
    await page.keyboard.press(" ");
    await expect
      .poll(() => logLines(page), { timeout: 30_000 })
      .toBeGreaterThan(lines);
    await expect(page.getByTestId("announce-ok")).toBeVisible();
    // OK closes the line (the bot may have passed, so no next line is waited for).
    await page.getByTestId("announce-ok").click();
    await expect(line).toHaveCount(0);
  });
});

test.describe("the settings", () => {
  test.use({ storageState: storage({}) });

  test("the toggle shows the pace slider, and both are saved", async ({
    page,
  }) => {
    await botFirst(page);
    await page.getByTestId("settings").click();
    await page.getByTestId("setting-announce").check();
    const pace = page.getByTestId("setting-announce-pace");
    await expect(page.getByTestId("announce-pace-label")).toHaveText("3.5 s");
    await pace.fill("5");
    await expect(page.getByTestId("announce-pace-label")).toHaveText("Confirm");
    await pace.fill("0");
    await expect(page.getByTestId("announce-pace-label")).toHaveText("1.5 s");
    await page.reload();
    await botFirst(page);
    await page.getByTestId("settings").click();
    await expect(page.getByTestId("setting-announce")).toBeChecked();
    await expect(page.getByTestId("announce-pace-label")).toHaveText("1.5 s");
  });
});

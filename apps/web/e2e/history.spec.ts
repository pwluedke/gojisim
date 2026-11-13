import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * My games (#151). The dev server has no accounts, so the server's answers are routed here: the
 * page lists the player's games with result, bot level and decks, and Load opens one in /play.
 * Without accounts, the page says to sign in. (The server side is in apps/server's tests.)
 */
const record = readFileSync(
  new URL("./fixtures/hand-count-five.json", import.meta.url),
  "utf8",
);
const GAME = "11111111-2222-4333-8444-555555555555";

test("#151: without accounts, My games says to sign in", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByTestId("history-none")).toHaveText(
    "Sign in with Discord to see your games.",
  );
});

test("#151: My games lists the player's games, and Load replays one in /play", async ({
  page,
}) => {
  await page.route("**/api/games/mine", (route) =>
    route.fulfill({
      json: {
        season: "beta",
        games: [
          {
            gameId: GAME,
            startedAt: Date.UTC(2026, 10, 1, 20),
            updatedAt: Date.UTC(2026, 10, 1, 20, 30),
            endedAt: Date.UTC(2026, 10, 1, 20, 30),
            result: "win",
            botLevel: "Medium",
            deckNames: "ESD01 official vs ESD02 official",
          },
          {
            gameId: "22222222-2222-4333-8444-555555555555",
            startedAt: Date.UTC(2026, 10, 1, 19),
            updatedAt: Date.UTC(2026, 10, 1, 19),
            endedAt: null,
            result: null,
            botLevel: "Easy",
            deckNames: null,
          },
        ],
      },
    }),
  );
  await page.route(`**/api/games/${GAME}`, (route) =>
    route.fulfill({ contentType: "application/json", body: record }),
  );
  await page.goto("/history");
  // #153: the beta season says its games don't count.
  await expect(page.getByTestId("beta-note")).toHaveText(
    "Beta games don't count toward your record.",
  );
  const rows = page.getByTestId("history-game");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Won");
  await expect(rows.nth(0)).toContainText(
    "vs Medium · ESD01 official vs ESD02 official",
  );
  await expect(rows.nth(1)).toContainText("In progress");
  await rows.nth(0).getByTestId("history-load").click();
  await expect(page).toHaveURL(new RegExp(`/play\\?mode=bot&load=${GAME}$`));
  // The fixture's game: P1 at its play timing with 5 cards.
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("your-hand-count")).toHaveText("5");
});

test("#244: a game against the bot loaded from My games carries on: after the player's turn, the bot takes its own, never 'Paused'", async ({
  page,
}) => {
  await page.route(`**/api/games/${GAME}`, (route) =>
    route.fulfill({ contentType: "application/json", body: record }),
  );
  // The fixture: P1 (human) at its play timing, P2 a Medium bot.
  await page.goto(`/play?mode=bot&load=${GAME}`);
  await expect(page.getByTestId("prompt-step")).toContainText("your turn");
  const turn = Number(await page.getByTestId("turn").textContent());
  // Pass (and confirm) until P1's turn ends.
  const deadline = Date.now() + 60_000;
  while (!(await page.getByTestId("bot-thinking").isVisible())) {
    if (Date.now() > deadline) throw new Error("P1's turn didn't end");
    const yes = page.getByTestId("confirm-yes");
    const pass = page.getByTestId("pass");
    if (await yes.isVisible()) await yes.click();
    else if (await pass.isVisible()) await pass.click();
    else await page.waitForTimeout(100);
  }
  await expect(page.getByTestId("bot-thinking")).not.toContainText("Paused");
  // The bot played its turn: it's P1's turn again, two turns on.
  await expect
    .poll(async () => Number(await page.getByTestId("turn").textContent()), {
      timeout: 60_000,
    })
    .toBe(turn + 2);
  await expect(page.getByTestId("prompt-step")).toContainText("your turn");
});

test("M9a: an online game lists with its result and 'online', but without Load (its record holds the opponent's deck)", async ({
  page,
}) => {
  await page.route("**/api/games/mine", (route) =>
    route.fulfill({
      json: {
        season: "beta",
        games: [
          {
            gameId: "33333333-2222-4333-8444-555555555555",
            startedAt: Date.UTC(2026, 10, 11, 4),
            updatedAt: Date.UTC(2026, 10, 11, 4, 30),
            endedAt: Date.UTC(2026, 10, 11, 4, 30),
            result: "loss",
            botLevel: null,
            deckNames: "ESD01 official vs ESD02 official",
            h2h: true,
          },
        ],
      },
    }),
  );
  await page.goto("/history");
  const row = page.getByTestId("history-game");
  await expect(row).toContainText("Lost");
  await expect(row).toContainText("online · ESD01 official vs ESD02 official");
  await expect(row.getByTestId("history-load")).toHaveCount(0);
});

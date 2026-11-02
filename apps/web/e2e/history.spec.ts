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

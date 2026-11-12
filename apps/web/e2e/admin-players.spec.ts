import { expect, type Page, test } from "@playwright/test";

/*
 * #235: the players page for admins. The dev server has no accounts, so the server's answers
 * are routed here; `apps/server/src/admin.test.ts` tests the server's side (who gets 404, what
 * it counts and leaves out, the CSV).
 */

const NOV = (day: number) => Date.UTC(2026, 10, day, 18);
const report = (season: string | null) => ({
  season,
  seasons: ["beta", "launch"],
  currentSeason: "launch",
  totals: {
    players: 2,
    games: season === "beta" ? 3 : 5,
    gamesLast7Days: 3,
    gamesBySeason: { beta: 3, launch: 2 },
  },
  players: [
    {
      name: "Ann",
      firstSeen: NOV(1),
      lastSeen: NOV(10),
      botGames: 3,
      onlineGames: 1,
      wins: 1,
      losses: 2,
      botLevels: ["Easy", "Hard"],
    },
    {
      name: "Bo",
      firstSeen: NOV(5),
      lastSeen: NOV(11),
      botGames: 1,
      onlineGames: 1,
      wins: 2,
      losses: 0,
      botLevels: ["Medium"],
    },
  ],
});

async function asAdmin(page: Page, admin: boolean) {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        id: "p1",
        name: "Ann",
        avatarUrl: null,
        season: "launch",
        ...(admin ? { admin: true } : {}),
      },
    }),
  );
}

test("#235: the menu links to the players page for an admin only", async ({
  page,
}) => {
  await asAdmin(page, false);
  await page.goto("/");
  await expect(page.getByTestId("menu-play-bot")).toBeVisible();
  await expect(page.getByTestId("menu-admin-players")).toHaveCount(0);
  await page.unrouteAll();
  await asAdmin(page, true);
  await page.goto("/");
  await expect(page.getByTestId("menu-admin-players")).toHaveAttribute(
    "href",
    "/admin/players",
  );
});

test("#235: the players page: totals with beta apart, a sortable table, a season filter and the CSV", async ({
  page,
}) => {
  const asked: string[] = [];
  await page.route("**/api/admin/players*", (route) => {
    const url = new URL(route.request().url());
    asked.push(url.search);
    return route.fulfill({ json: report(url.searchParams.get("season")) });
  });
  await page.goto("/admin/players");
  await expect(page.getByTestId("admin-total-players")).toHaveText("2");
  await expect(page.getByTestId("admin-total-games")).toContainText("5");
  await expect(page.getByTestId("admin-beta-games")).toHaveText("beta 3");
  await expect(page.getByTestId("admin-total-week")).toHaveText("3");

  // Last seen, newest first, to start; then by name, either way, and by losses (most first).
  const names = () =>
    page.getByTestId("admin-row").locator("td:first-child").allTextContents();
  await expect.poll(names).toEqual(["Bo", "Ann"]);
  await page.getByTestId("admin-sort-name").click();
  await expect.poll(names).toEqual(["Ann", "Bo"]);
  await page.getByTestId("admin-sort-name").click();
  await expect.poll(names).toEqual(["Bo", "Ann"]);
  await page.getByTestId("admin-sort-losses").click();
  await expect.poll(names).toEqual(["Ann", "Bo"]);
  const ann = page.getByTestId("admin-row").filter({ hasText: "Ann" });
  await expect(ann).toContainText("Easy, Hard");

  // The season filter asks the server for that season, and the CSV follows it.
  await expect(page.getByTestId("admin-csv")).toHaveAttribute(
    "href",
    "/api/admin/players.csv",
  );
  await page.getByTestId("admin-season").selectOption("beta");
  await expect(page.getByTestId("admin-total-games")).toHaveText("3");
  expect(asked).toContain("?season=beta");
  await expect(page.getByTestId("admin-beta-games")).toHaveCount(0);
  await expect(page.getByTestId("admin-csv")).toHaveAttribute(
    "href",
    "/api/admin/players.csv?season=beta",
  );
});

test("#235: anyone but an admin gets Not found", async ({ page }) => {
  await page.route("**/api/admin/players*", (route) =>
    route.fulfill({ status: 404, json: { error: "not-found" } }),
  );
  await page.goto("/admin/players");
  await expect(page.getByTestId("admin-not-found")).toBeVisible();
  await expect(page.getByTestId("admin-table")).toHaveCount(0);
});

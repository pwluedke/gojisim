import { expect, test } from "@playwright/test";

/**
 * The production build behind the testers' password (deploy for testers): every route needs the
 * signed cookie; the login page, robots.txt and the health route don't. Runs against
 * `apps/server` serving `apps/web/dist` (playwright.prod.config.ts).
 */

const PASSWORD = "e2e testers only";

test("a page goes to the login page; a wrong password says so; the right one opens the app and a game starts", async ({
  page,
}) => {
  const first = await page.goto("/play");
  await expect(page).toHaveURL(/\/login\?next=%2Fplay$/);
  expect(first?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await page.getByLabel("Password").fill("not it");
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong password.");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enter" }).click();
  // Back where the tester was going: the built app's new-game screen.
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByTestId("start-game")).toBeVisible();
  // The cookie: HttpOnly, Secure, SameSite=Lax, about 30 days.
  const [cookie] = await page.context().cookies();
  expect(cookie?.name).toBe("gojisim_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  const days = ((cookie?.expires ?? 0) * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThan(30.1);
  // A game runs on the built app (two bots, so no pick to wait for).
  await page.getByTestId("seat-P1").selectOption("bot");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("mat-you")).toBeVisible();
  // With the cookie, card images and the API answer; the menu loads too.
  const card = await page.request.get("/cards/test-thumb.webp");
  expect(card.status()).toBe(200);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GojiSim" })).toBeVisible();
});

test("without the cookie: assets, card images and the API are 401; robots.txt and the health route answer", async ({
  request,
}) => {
  const html = await (await request.get("/login", { maxRedirects: 0 })).text();
  // The app's own script, as the built index.html names it.
  const app = await request.get("/", { maxRedirects: 0 });
  expect(app.status()).toBe(303);
  expect(html).toContain('action="/login"');
  for (const path of [
    "/cards/test-thumb.webp",
    "/api/decklog/1STAP",
    "/favicon.svg",
  ])
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(
      401,
    );
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  expect(await (await request.get("/healthz")).json()).toEqual({
    status: "ok",
  });
});

test("a tampered cookie opens nothing", async ({ page, context }) => {
  await context.addCookies([
    {
      name: "gojisim_session",
      value: `${Date.now() + 86_400_000}.not-a-signature`,
      url: "http://localhost:5199",
    },
  ]);
  await page.goto("/play");
  await expect(page).toHaveURL(/\/login/);
});

import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";

/** The turn number. */
export async function turnNumber(page: Page): Promise<number> {
  return Number(await page.getByTestId("turn").textContent());
}

/**
 * Passes and waits for the next turn: confirms "End Main and move to the Counter Phase?",
 * which every Pass asks (M5h).
 */
export async function passTurn(page: Page): Promise<void> {
  const turn = await turnNumber(page);
  await page.getByTestId("pass").click();
  await page.getByTestId("confirm-yes").click();
  await expect
    .poll(() => turnNumber(page), { intervals: [100] })
    .toBe(turn + 1);
}

/** Passes, then waits through the bot's turn until it is the human's play timing again. */
export async function passToMyTurn(page: Page): Promise<void> {
  const turn = await turnNumber(page);
  await passTurn(page);
  await expect
    .poll(() => turnNumber(page), { intervals: [100], timeout: 30_000 })
    .toBe(turn + 2);
  await expect(page.getByTestId("pass")).toBeVisible({ timeout: 30_000 });
}

/**
 * Starts P1 (human) vs P2 (the Medium bot) with `seed`. `first`: P1 goes first, so the board
 * waits at the human's turn 1 (the First / Second pick picks the card that says so).
 */
export async function vsBot(
  page: Page,
  seed: number,
  first = true,
): Promise<void> {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill(String(seed));
  await page.getByTestId("start-game").click();
  await page.getByTestId("first-pick-card-0").click();
  const face = await page
    .getByTestId("first-pick-card-0")
    .getAttribute("data-face");
  // The other card says the opposite, but the pick is made: start again with the other card.
  if ((face === "First") !== first) {
    await page.goto("/play?mode=bot");
    await page.getByTestId("seed-input").fill(String(seed));
    await page.getByTestId("start-game").click();
    await page.getByTestId("first-pick-card-1").click();
  }
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("board")).toBeVisible();
  if (first) await expect(page.getByTestId("pass")).toBeVisible();
}

/**
 * Opens `/play` and loads a choice fixture record (e2e/fixtures, made by generate.ts); `patch`
 * changes the record's fields first (e.g. `{ mode: "tournament" }`).
 */
export async function loadFixture(
  page: Page,
  name: string,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await page.goto("/play?mode=bot");
  await page.getByTestId("load-record").setInputFiles({
    name: `${name}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...fixture(name), ...patch })),
  });
  await expect(page.getByTestId("board")).toBeVisible();
}

/** A fixture record's JSON. */
export const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"),
  ) as Record<string, unknown>;

/**
 * Starts the game set up on the new-game screen. The First / Second pick (M5e) picks the card
 * with the picker's own seat index unless `card` is given, which keeps the first player each seed
 * had before M5e. Two bot seats skip the pick.
 */
export async function startGame(page: Page, card?: 0 | 1): Promise<void> {
  await page.getByTestId("start-game").click();
  const pick = page.getByTestId("first-pick");
  // The board and the pick modal over it appear together (two bots: the board alone).
  await expect(page.getByTestId("board")).toBeVisible();
  if (!(await pick.isVisible())) return;
  const picker = await pick.getAttribute("data-picker");
  await page
    .getByTestId(`first-pick-card-${card ?? (picker === "P2" ? 1 : 0)}`)
    .click();
  await page.getByTestId("first-pick-continue").click();
  await expect(pick).toHaveCount(0);
}

/**
 * The center of the part of `locator` inside the window. Your hand cards run below the window's
 * bottom edge (only their top 40 % shows), so pointer moves aim at what is on screen.
 */
export async function visibleCenter(
  page: Page,
  locator: Locator,
): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  const view = page.viewportSize();
  if (!box || !view) throw new Error("no box");
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, view.height);
  return { x: box.x + box.width / 2, y: (top + bottom) / 2 };
}

/** A plain-color WebP (not the art), served for the official images, which aren't in git. */
const plainCard = readFileSync(
  new URL("./fixtures/plain-card.webp", import.meta.url),
);

/**
 * Serves (`present`) or blocks the official card back and First / Second images (Tester fixes
 * 1), whatever `public/cards` holds on this machine: Paul's has them, CI doesn't. Call it before
 * `page.goto`.
 */
export async function officialImages(page: Page, present: boolean) {
  await page.route(
    /\/cards\/(first|second)-\d-thumb\.webp$|\/cards\/back-thumb\.webp$/,
    (route) =>
      present
        ? route.fulfill({ contentType: "image/webp", body: plainCard })
        : route.abort(),
  );
}

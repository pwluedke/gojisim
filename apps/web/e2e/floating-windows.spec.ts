import { expect, test } from "@playwright/test";
import { dragWindowAndHover, loadFixture } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Paul, Nov 16: every window that opens over the board is a `FloatingWindow`: dragged by its
 * title bar, with Hide, and no backdrop, so the board's cards keep their hover previews. One
 * drag-then-hover case per window here; the combo window's is in m5g.spec.ts, the Classroom
 * windows' in classroom.spec.ts, the feedback windows' in feedback-window.spec.ts.
 */

test("the choice window (a target pick): dragged by its title, the board's cards preview; the game still waits on it", async ({
  page,
}) => {
  await loadFixture(page, "target");
  await expect(page.getByTestId("choice-modal")).toBeVisible();
  await dragWindowAndHover(page, "choice-modal");
  // Still the pick the game waits on: Hide folds it to a tab, Show brings it back.
  await page.getByTestId("window-hide").click();
  await expect(page.getByTestId("choice-modal")).toBeHidden();
  await page.getByTestId("window-show").click();
  await expect(page.getByTestId("choice-option").first()).toBeVisible();
});

test("the deck search window: dragged by its title, the board's cards preview", async ({
  page,
}) => {
  await loadFixture(page, "search");
  // The search window opens after the pick (m5e).
  await page
    .getByTestId("choice-modal")
    .locator('[data-testid="choice-option"][data-card-id]')
    .first()
    .click();
  await expect(page.getByTestId("search-modal")).toBeVisible();
  await dragWindowAndHover(page, "search-modal");
});

test("the stack viewer: dragged by its title, the board's cards preview", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.getByTestId("discard-P1").click();
  await expect(page.getByTestId("stack-viewer")).toBeVisible();
  await dragWindowAndHover(page, "stack-viewer");
});

test("the First / Second pick: dragged by its title, the board under it is reachable (no backdrop)", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("first-pick")).toBeVisible();
  // Before the pick no hand is dealt and the mat holds no card to preview: with the window
  // dragged aside, what the pointer meets at the mat's center is the mat, not a backdrop.
  await dragWindowAndHover(page, "first-pick", null, -500, -200);
  const mat = await page.getByTestId("mat-you").boundingBox();
  if (!mat) throw new Error("no mat");
  const onMat = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x as number, y as number)
        ?.closest('[data-testid="mat-you"]') !== null,
    [mat.x + mat.width / 2, mat.y + mat.height / 2],
  );
  expect(onMat).toBe(true);
});

test("the Leave this game? window: dragged by its title, the board's cards preview", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.getByTestId("header-home").click();
  await expect(page.getByTestId("leave-modal")).toBeVisible();
  await dragWindowAndHover(page, "leave-modal");
  await page.getByTestId("leave-stay").click();
  await expect(page.getByTestId("leave-modal")).toHaveCount(0);
});

test("the game-over window: dragged by its title, the board's cards preview", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.getByTestId("concede").click();
  await page.getByTestId("confirm-yes").click();
  await expect(page.getByTestId("game-over-modal")).toBeVisible();
  await dragWindowAndHover(page, "game-over-modal");
});

test("the keyboard shortcuts window (?): dragged by its title, the board's cards preview; Esc closes it", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcut-list")).toBeVisible();
  await dragWindowAndHover(page, "shortcut-list");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("shortcut-list")).toHaveCount(0);
});

/** Off the board (Paul: every modal is movable): dragged, kept in the viewport; no board to hover. */
test("the Deckbuilder's Import deck, My decks and Sample hand windows drag by their title or header", async ({
  page,
}) => {
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await expect(page.getByTestId("import-deck")).toBeVisible();
  await dragWindowAndHover(page, "import-deck", null);
  await page.getByTestId("import-cancel").click();

  await page.getByTestId("db-my-decks").click();
  await expect(page.getByTestId("db-decks-window")).toBeVisible();
  await dragWindowAndHover(page, "db-decks-window", null);
  await page.getByTestId("db-starter").first().getByTestId("db-load").click();
  await expect(page.getByTestId("db-decks-window")).toHaveCount(0);

  await page.getByTestId("db-sample-hand").click();
  await expect(page.getByTestId("db-hand")).toBeVisible();
  await dragWindowAndHover(page, "db-hand", null);
  // A click outside it (its backdrop) still closes it.
  await page.mouse.click(5, 5);
  await expect(page.getByTestId("db-hand")).toHaveCount(0);
});

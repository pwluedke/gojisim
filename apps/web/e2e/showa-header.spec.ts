import { expect, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

/**
 * Paul, Nov 10: on the board, Showa Poster's header is a block over the left panel only (no
 * full-width bar): GOJISIM! with ゴジシム! under it, and the signed-in player under those. The
 * mat reaches the top of the screen. Other screens keep the full-width bar, with the katakana
 * under the English there too.
 */

test.use({ viewport: { width: 1440, height: 900 } });

type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (page: Page, id: string): Promise<Box> => {
  const b = await page.getByTestId(id).first().boundingBox();
  if (!b) throw new Error(`no ${id}`);
  return b;
};

async function showa(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "off", theme: "showa" }),
    );
  });
}

/** The katakana's top is under the English wordmark's bottom. */
async function stacked(page: Page) {
  const header = page.getByTestId("theme-header");
  const en = await header.getByText("GOJISIM!").boundingBox();
  const ja = await header.locator('[lang="ja"]').boundingBox();
  expect(en && ja).toBeTruthy();
  expect((ja as Box).y).toBeGreaterThanOrEqual(
    (en as Box).y + (en as Box).height - 2,
  );
}

test("the board: the header is a block over the left panel only, and the mat starts at the top", async ({
  page,
}) => {
  await showa(page);
  await loadFixture(page, "hand-five");
  const header = page.getByTestId("theme-header");
  await expect(header).toHaveAttribute("data-header", "block");
  await expect(page.getByTestId("theme-header")).toHaveCount(1);
  const block = await boxOf(page, "theme-header");
  const left = await boxOf(page, "left-column");
  // At the left panel's width, from the top of the screen.
  expect(Math.abs(block.x - left.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(block.width - left.width)).toBeLessThanOrEqual(2);
  expect(block.y).toBeLessThanOrEqual(1);
  // Nothing above the board: it and the mat start at the top.
  const board = await boxOf(page, "board");
  expect(board.y).toBeLessThanOrEqual(1);
  const mat = await boxOf(page, "mat-opp");
  expect(mat.y).toBeLessThan(16);
  // The block is red like the bar was.
  const color = await header.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(color).not.toBe("rgba(0, 0, 0, 0)");
  await stacked(page);
});

test("the board's block keeps the home link and the in-game confirm (#211)", async ({
  page,
}) => {
  await showa(page);
  await loadFixture(page, "hand-five");
  const home = page.getByTestId("header-home");
  await expect(home).toHaveAttribute("href", "/");
  await home.click();
  // A game in progress asks first; nothing has left the board yet.
  await expect(page.getByTestId("leave-modal")).toBeVisible();
  await expect(page).toHaveURL(/\/play/);
});

test("signed in, the player badge is in the block, under the wordmark", async ({
  page,
}) => {
  await showa(page);
  await page.goto("/auth/dev?next=%2Fplay%3Fmode%3Dbot");
  await loadFixture(page, "hand-five");
  const block = page.getByTestId("theme-header");
  const badge = block.getByTestId("player-badge");
  await expect(badge).toBeVisible();
  const home = await boxOf(page, "header-home");
  const b = (await badge.boundingBox()) as Box;
  expect(b.y).toBeGreaterThanOrEqual(home.y + home.height - 1);
  const area = await block.boundingBox();
  expect(b.x + b.width).toBeLessThanOrEqual(
    (area as Box).x + (area as Box).width + 1,
  );
});

test("the menu keeps the full-width bar, with the katakana under the English", async ({
  page,
}) => {
  await showa(page);
  await page.goto("/");
  const header = page.getByTestId("theme-header");
  await expect(header).toHaveAttribute("data-header", "bar");
  const bar = await boxOf(page, "theme-header");
  expect(bar.width).toBeGreaterThanOrEqual(1440 - 1);
  expect(Math.round(bar.height)).toBe(56);
  await stacked(page);
});

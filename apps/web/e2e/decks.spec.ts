import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

/**
 * The Deckbuilder (#157): the card grid, search and filters (kept in the URL), the preview on
 * hover, the art choice, and the header's Import and My decks.
 */
const count = async (page: import("@playwright/test").Page) =>
  Number(
    ((await page.getByTestId("db-count").textContent()) ?? "").split(" ")[0],
  );

test("#157: search and filters narrow the grid, combine, live in the URL, and Clear resets them", async ({
  page,
}) => {
  await page.goto("/decks");
  await expect(page.getByTestId("db-card").first()).toBeVisible();
  const all = await count(page);
  expect(all).toBeGreaterThan(300);
  // Only the visible rows are drawn.
  expect(await page.getByTestId("db-card").count()).toBeLessThan(all);

  await page.getByTestId("db-search").fill("destoroyah");
  await expect.poll(() => count(page)).toBeLessThan(all);
  const searched = await count(page);
  expect(searched).toBeGreaterThan(0);
  await page.getByTestId("db-type-Monster").check();
  await expect.poll(() => count(page)).toBeLessThan(searched);
  await expect(page).toHaveURL(/\/decks\?q=destoroyah&type=Monster$/);

  // The URL restores the view.
  const filtered = await count(page);
  await page.reload();
  await expect(page.getByTestId("db-search")).toHaveValue("destoroyah");
  await expect(page.getByTestId("db-type-Monster")).toBeChecked();
  await expect.poll(() => count(page)).toBe(filtered);

  await page.getByTestId("db-clear").click();
  await expect.poll(() => count(page)).toBe(all);
  await expect(page).toHaveURL(/\/decks$/);

  await page.getByTestId("db-set-ESD01").check();
  await page.getByTestId("db-rank-min").fill("2");
  await page.getByTestId("db-rank-max").fill("3");
  await expect.poll(() => count(page)).toBeLessThan(all);
  for (const n of await page
    .getByTestId("db-card")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-card-number"))))
    expect(n).toMatch(/^ESD01-/);
});

test("#157: hovering a card shows it in full; a card with parallel prints has an art choice", async ({
  page,
}) => {
  await page.goto("/decks?q=godzilla");
  const first = page.getByTestId("db-card").first();
  await first.hover();
  const preview = page.getByTestId("db-preview");
  await expect(preview).toBeVisible();
  await expect(preview.locator("h2")).toHaveText(
    (await first.locator("img").getAttribute("alt")) ?? "",
  );
  const withArt = page
    .getByTestId("db-card")
    .filter({ has: page.getByTestId("db-art") })
    .first();
  await withArt.scrollIntoViewIfNeeded();
  const index = withArt.getByTestId("db-art-index");
  await expect(index).toHaveText(/^Art 1\/\d+$/);
  const before = await withArt.locator("img").getAttribute("src");
  await withArt.getByRole("button", { name: "Next art" }).click();
  await expect(index).toHaveText(/^Art 2\/\d+$/);
  expect(await withArt.locator("img").getAttribute("src")).not.toBe(before);
});

test("#157: the header opens Import and My decks (starters, your decks, Export all, Import backup)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("menu-decks").click();
  await expect(page).toHaveURL(/\/decks$/);
  await page.getByTestId("db-import").click();
  await expect(page.getByTestId("import-text")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/decks");
  await page.getByTestId("db-my-decks").click();
  const win = page.getByTestId("db-decks-window");
  await expect(win.getByTestId("db-starter")).toHaveText([
    "ESD01 official",
    "ESD02 official",
  ]);
  await expect(win.getByTestId("db-export-all")).toBeDisabled();
  await expect(win.getByTestId("db-import-backup")).toBeVisible();
  await win.getByTestId("db-decks-close").click();
  await expect(win).toHaveCount(0);
});

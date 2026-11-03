import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { deckAction, myDeckNames } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * #181, the Deckbuilder's My decks window (Paul's layout 1): decks grouped by folder under
 * collapsible headers, a search, one Load per row and a ⋯ menu for the rest.
 */

const starter = readFileSync(
  new URL(
    "../../../packages/cards/data/decks/esd01-starter.txt",
    import.meta.url,
  ),
  "utf8",
);
const named = (name: string) =>
  starter.replace(/^\[deck\].*$/m, `[deck] ${name}`);
/** A list 6.1.1.2 rejects: one main deck card short. */
const short = (name: string) => named(name).replace(/^4 (ESD01-\d+)$/m, "3 $1");

async function withDecks(page: Page) {
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await page
    .getByTestId("import-text")
    .fill(
      [
        named("Club/Red Rage"),
        named("Club/Blue Hoard"),
        short("Tests/Short One"),
        named("Rager"),
      ].join("\n\n"),
    );
  // Import all keeps each deck's folder (#167).
  await page.getByTestId("import-all").click();
  await expect(page.getByTestId("import-all-result")).toContainText(
    "Saved 4 of 4 decks",
  );
  await page.getByTestId("import-cancel").click();
}

const win = (page: Page) => page.getByTestId("db-decks-window");
const folder = (page: Page, name: string) =>
  win(page).locator(`[data-testid="db-folder"][data-folder="${name}"]`);
const row = (page: Page, name: string) =>
  win(page).locator(`[data-testid="db-deck"][data-deck-name="${name}"]`);

test("decks group by folder under collapsible headers, rows show the name after the folder, with Legal / Not legal", async ({
  page,
}) => {
  await withDecks(page);
  await page.getByTestId("db-my-decks").click();
  await expect(page.getByTestId("db-decks-count")).toHaveText("4 decks");
  const folders = await win(page)
    .getByTestId("db-folder")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-folder")));
  expect(folders).toEqual(["Starter decks", "Club", "Tests", "No folder"]);
  await expect(folder(page, "Club").getByRole("button").first()).toContainText(
    "2",
  );
  await expect(
    row(page, "Club/Red Rage").getByTestId("db-deck-name"),
  ).toHaveText("Red Rage");
  await expect(row(page, "Club/Red Rage")).toContainText("Legal");
  await expect(row(page, "Tests/Short One")).toContainText("Not legal");
  // One visible action per row: Load (primary) and the menu button.
  await expect(row(page, "Club/Red Rage").getByRole("button")).toHaveCount(2);
  // A header folds its folder away and back.
  const head = folder(page, "Club").getByRole("button").first();
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "Club/Red Rage")).toHaveCount(0);
  await head.click();
  await expect(row(page, "Club/Red Rage")).toBeVisible();
});

test("search matches deck and folder names, ignoring case, and opens every folder with a match", async ({
  page,
}) => {
  await withDecks(page);
  await page.getByTestId("db-my-decks").click();
  await folder(page, "Club").getByRole("button").first().click();
  await page.getByTestId("db-decks-search").fill("BLUE");
  expect(await myDeckNames(page)).toEqual(["Club/Blue Hoard"]);
  await expect(
    folder(page, "Club").getByRole("button").first(),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId("db-decks-search").fill("club");
  expect(await myDeckNames(page)).toEqual(["Club/Red Rage", "Club/Blue Hoard"]);
  await page.getByTestId("db-decks-search").fill("nothing like it");
  await expect(page.getByTestId("db-decks-none")).toBeVisible();
});

test("the ⋯ menu: Duplicate, Rename, Copy deck list, Export, then a red Delete; arrow keys move in it, Esc and a click outside close it", async ({
  page,
}) => {
  await withDecks(page);
  await page.getByTestId("db-my-decks").click();
  const menuButton = row(page, "Rager").getByTestId("db-deck-menu");
  await expect(menuButton).toHaveAttribute("aria-haspopup", "menu");
  await menuButton.click();
  const menu = row(page, "Rager").getByTestId("db-deck-menu-list");
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Duplicate",
    "Rename",
    "Copy deck list",
    "Export",
    "Delete",
  ]);
  await expect(menu.getByTestId("db-delete")).toHaveAttribute(
    "data-danger",
    "",
  );
  // The first item has focus; the arrows move through them and wrap.
  await expect(menu.getByTestId("db-duplicate")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByTestId("rename-deck")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByTestId("db-delete")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(menuButton).toBeFocused();
  // A click outside closes it too.
  await menuButton.click();
  await page.getByTestId("db-decks-count").click();
  await expect(menu).toHaveCount(0);
  // Export downloads the deck's list; Delete still asks.
  const download = page.waitForEvent("download");
  await deckAction(row(page, "Rager"), "db-export-deck");
  expect((await download).suggestedFilename()).toBe("Rager.txt");
  await deckAction(row(page, "Rager"), "db-delete");
  await row(page, "Rager").getByTestId("db-delete-confirm").click();
  expect(await myDeckNames(page)).not.toContain("Rager");
});

test("Import opens from the window's search row", async ({ page }) => {
  await page.goto("/decks");
  await page.getByTestId("db-my-decks").click();
  await page.getByTestId("db-decks-import").click();
  await expect(page.getByTestId("import-text")).toBeVisible();
});

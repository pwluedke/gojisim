import { readFileSync, writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { deckAction, myDeckNames } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * #181, the Deckbuilder's My decks window (Paul's layout 1), as Paul changed it on Nov 9: one flat
 * list A–Z with tag buttons above it (no folders), a search, one Load per row and a ⋯ menu for
 * the rest; Replace with backup at the foot.
 */

const starter = readFileSync(
  new URL(
    "../../../packages/cards/data/decks/esd01-starter.txt",
    import.meta.url,
  ),
  "utf8",
);
const named = (name: string, tags?: string) =>
  starter.replace(
    /^\[deck\].*$/m,
    `[deck] ${name}${tags ? `\ntags: ${tags}` : ""}`,
  );
/** A list 6.1.1.2 rejects: one main deck card short. */
const short = (name: string) => named(name).replace(/^4 (ESD01-\d+)$/m, "3 $1");

async function withDecks(page: Page) {
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await page
    .getByTestId("import-text")
    .fill(
      [
        named("Red Rage", "Meta, Bot training"),
        named("Blue Hoard", "Meta"),
        short("Short One"),
        named("Rager", "Mine"),
      ].join("\n\n"),
    );
  await page.getByTestId("import-all").click();
  await expect(page.getByTestId("import-all-result")).toContainText(
    "Saved 4 of 4 decks",
  );
  await page.getByTestId("import-cancel").click();
}

const win = (page: Page) => page.getByTestId("db-decks-window");
const row = (page: Page, name: string) =>
  win(page).locator(`[data-testid="db-deck"][data-deck-name="${name}"]`);
const tag = (page: Page, name: string) =>
  win(page).locator(`[data-testid="db-tag"][data-tag="${name}"]`);

test("decks are one flat list A–Z with their tags and Legal / Not legal; no folder headers", async ({
  page,
}) => {
  await withDecks(page);
  await page.getByTestId("db-my-decks").click();
  await expect(page.getByTestId("db-decks-count")).toHaveText("4 decks");
  expect(await myDeckNames(page)).toEqual([
    "Blue Hoard",
    "Rager",
    "Red Rage",
    "Short One",
  ]);
  // Only the starters keep a header; My decks has none.
  const groups = await win(page)
    .getByTestId("db-folder")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-folder")));
  expect(groups).toEqual(["Starter decks"]);
  await expect(row(page, "Red Rage").getByTestId("db-row-tags")).toHaveText(
    "Meta · Bot training",
  );
  await expect(row(page, "Red Rage")).toContainText("Legal");
  await expect(row(page, "Short One")).toContainText("Not legal");
  // One visible action per row: Load (primary) and the menu button.
  await expect(row(page, "Red Rage").getByRole("button")).toHaveCount(2);
});

test("tag buttons filter the list; several tags show decks with all of them; the search still works", async ({
  page,
}) => {
  await withDecks(page);
  await page.getByTestId("db-my-decks").click();
  // Most used first: Meta (2), then Bot training and Mine (1 each), A–Z.
  await expect(win(page).getByTestId("db-tag")).toHaveText([
    "Meta 2",
    "Bot training 1",
    "Mine 1",
  ]);
  await tag(page, "Meta").click();
  await expect(tag(page, "Meta")).toHaveAttribute("aria-pressed", "true");
  expect(await myDeckNames(page)).toEqual(["Blue Hoard", "Red Rage"]);
  await tag(page, "Bot training").click();
  expect(await myDeckNames(page)).toEqual(["Red Rage"]);
  await tag(page, "Mine").click();
  await expect(page.getByTestId("db-decks-none")).toBeVisible();
  await tag(page, "Mine").click();
  await tag(page, "Bot training").click();
  await tag(page, "Meta").click();
  // The search matches names and tags, ignoring case.
  await page.getByTestId("db-decks-search").fill("BLUE");
  expect(await myDeckNames(page)).toEqual(["Blue Hoard"]);
  await page.getByTestId("db-decks-search").fill("mine");
  expect(await myDeckNames(page)).toEqual(["Rager"]);
  await page.getByTestId("db-decks-search").fill("nothing like it");
  await expect(page.getByTestId("db-decks-none")).toBeVisible();
});

test("Edit tags sets a deck's tags; they stay after a reload", async ({
  page,
}) => {
  await withDecks(page);
  await page.getByTestId("db-my-decks").click();
  await deckAction(row(page, "Rager"), "db-edit-tags");
  await row(page, "Rager").getByTestId("tags-input").fill("Mine, Old, ");
  await row(page, "Rager").getByTestId("tags-save").click();
  await expect(row(page, "Rager").getByTestId("db-row-tags")).toHaveText(
    "Mine · Old",
  );
  await expect(win(page)).toHaveAttribute("data-decks-stored", "true");
  await page.reload();
  await page.getByTestId("db-my-decks").click();
  await expect(row(page, "Rager").getByTestId("db-row-tags")).toHaveText(
    "Mine · Old",
  );
});

test("Replace with backup asks first, then My decks holds only the backup's decks", async ({
  page,
}, testInfo) => {
  await withDecks(page);
  await page.getByTestId("db-my-decks").click();
  const file = testInfo.outputPath("backup.json");
  writeFileSync(
    file,
    JSON.stringify({
      app: "gojisim",
      kind: "decks",
      version: 1,
      decks: [
        { name: "Only One", list: named("Only One", "Meta") },
        { name: "Only Two", list: named("Only Two") },
      ],
    }),
  );
  await page.getByTestId("db-replace-file").setInputFiles(file);
  await expect(page.getByTestId("db-replace-confirm")).toHaveText(
    "Replace all 4 with 2",
  );
  // Nothing changes until it's confirmed.
  expect(await myDeckNames(page)).toHaveLength(4);
  await page.getByTestId("db-replace-confirm").click();
  expect(await myDeckNames(page)).toEqual(["Only One", "Only Two"]);
  await expect(page.getByTestId("db-decks-note")).toContainText(
    "Replaced My decks with the backup's 2 decks.",
  );
  await expect(win(page)).toHaveAttribute("data-decks-stored", "true");
  await page.reload();
  expect(await myDeckNames(page)).toEqual(["Only One", "Only Two"]);
});

test("the ⋯ menu: Duplicate, Rename, Edit tags, Copy deck list, Export, then a red Delete; arrow keys move in it, Esc and a click outside close it", async ({
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
    "Edit tags",
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

test("Paul, Nov 9: the Deckbuilder edits a deck's tags; saving keeps them", async ({
  page,
}) => {
  await withDecks(page);
  await page.getByTestId("db-my-decks").click();
  await row(page, "Rager").getByTestId("db-load").click();
  const field = page.getByTestId("db-deck-tags");
  await expect(field).toHaveValue("Mine");
  await field.fill("Mine, Tournament,");
  await field.press("Enter");
  await expect(field).toHaveValue("Mine, Tournament");
  await page.getByTestId("db-save").click();
  await page.getByTestId("db-my-decks").click();
  await expect(row(page, "Rager").getByTestId("db-row-tags")).toHaveText(
    "Mine · Tournament",
  );
});

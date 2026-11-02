import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { startGame } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * M7a: importing a deck in the browser, and My decks. Since #161 both live in the Deckbuilder
 * (`/decks`): Import in its header, and the My decks window (Load, Duplicate, Rename, Copy,
 * Delete, Export all, Import backup). `/play` picks the saved decks.
 */

/** A deck copied from godzillatcgdb.com's printable deck list (tab-separated rows). */
const tcgdbList = readFileSync(
  new URL(
    "../../../packages/cards/test/fixtures/godzillatcgdb-print-tabs.txt",
    import.meta.url,
  ),
  "utf8",
);

const cardsFixture = (name: string) =>
  readFileSync(
    new URL(`../../../packages/cards/test/fixtures/${name}`, import.meta.url),
    "utf8",
  );

/** Saves `text` with Import in the Deckbuilder; the My decks window opens after. */
async function importDeck(page: Page, text: string, name?: string) {
  await page.getByTestId("db-import").click();
  await page.getByTestId("import-text").fill(text);
  if (name) await page.getByTestId("import-name").fill(name);
  await page.getByTestId("import-save").click();
  await expect(page.getByTestId("db-decks-window")).toBeVisible();
}

/** The My decks window's deck names (it opens if closed). */
async function myDecks(page: Page) {
  const win = page.getByTestId("db-decks-window");
  if (!(await win.isVisible())) await page.getByTestId("db-my-decks").click();
  return win.locator('[data-testid="db-deck"] > span:first-child');
}

const deckRow = (page: Page, name: string) =>
  page
    .getByTestId("db-decks-window")
    .locator(`[data-testid="db-deck"][data-deck-name="${name}"]`);

/** Picks the saved deck `label` for P1 in /play. */
async function pickInPlay(page: Page, label: string) {
  await page.goto("/play?mode=bot");
  await page.getByTestId("deck-P1").selectOption({ label });
}

test("paste a godzillatcgdb list, save it in the Deckbuilder, pick it in /play and start a game against the bot", async ({
  page,
}) => {
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await page.getByTestId("import-text").fill(tcgdbList);
  await expect(page.getByTestId("import-format")).toContainText(
    "godzillatcgdb.com printable deck list",
  );
  // How to copy each format, one line each.
  await expect(page.getByTestId("import-help").locator("li")).toHaveCount(5);
  await expect(page.getByTestId("import-counts")).toHaveText(
    "Monster deck 4 · Main deck 47",
  );
  await expect(page.getByTestId("import-cards")).toContainText(
    "3 × Destroy All Monsters [EBP01-076]",
  );
  // Legality problems are warnings; the deck still saves.
  await expect(page.getByTestId("import-warnings")).toContainText("6.1.1.2");
  await expect(page.getByTestId("import-name")).toHaveValue(
    "Sample Gigan Deck",
  );
  await page.getByTestId("import-save").click();
  await expect(await myDecks(page)).toHaveText(["Sample Gigan Deck"]);
  // /play lists it under My decks, with its badge.
  await pickInPlay(page, "Sample Gigan Deck");
  await expect(page.getByTestId("deck-P1")).toHaveValue(/^mine:/);
  await expect(
    page.getByTestId("seat-panel-P1").getByTestId("legality"),
  ).toContainText("Warnings");
  await startGame(page);
  await expect(
    page.getByTestId("monster-P1").getByTestId("card"),
  ).toHaveAttribute("title", /EBP04-027/);
});

test("an unknown card number blocks saving", async ({ page }) => {
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await page
    .getByTestId("import-text")
    .fill(
      "[deck] Bad\n[monster deck]\n1 ESD01-001\n[main deck]\n4 ZZZ99-999\n",
    );
  await expect(page.getByTestId("import-errors")).toContainText(
    "Line 5: Unknown card number ZZZ99-999",
  );
  await expect(page.getByTestId("import-save")).toBeDisabled();
});

test("rename and delete a saved deck; saved decks survive a reload and show in /play", async ({
  page,
}) => {
  await page.goto("/decks");
  await importDeck(page, tcgdbList, "Gigan");
  await page.getByTestId("db-decks-close").click();
  await importDeck(page, tcgdbList, "Second");
  await expect(await myDecks(page)).toHaveText(["Gigan", "Second"]);
  await page.reload();
  await expect(await myDecks(page)).toHaveText(["Gigan", "Second"]);
  await deckRow(page, "Gigan").getByTestId("rename-deck").click();
  await page.getByTestId("rename-input").fill("Renamed Gigan");
  await page.getByTestId("rename-save").click();
  await expect(await myDecks(page)).toHaveText(["Renamed Gigan", "Second"]);
  await deckRow(page, "Second").getByTestId("db-delete").click();
  await deckRow(page, "Second").getByTestId("db-delete-confirm").click();
  await expect(await myDecks(page)).toHaveText(["Renamed Gigan"]);
  await page.reload();
  await expect(await myDecks(page)).toHaveText(["Renamed Gigan"]);
  await page.goto("/play?mode=bot");
  await expect(page.getByTestId("deck-P2").locator("option")).toContainText([
    "Renamed Gigan",
  ]);
});

test("Copy puts the deck on the clipboard as plain text", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/decks");
  await importDeck(page, tcgdbList, "Gigan");
  await deckRow(page, "Gigan").getByTestId("copy-deck").click();
  await expect(page.getByTestId("db-decks-note")).toContainText("Copied Gigan");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toMatch(/^\[deck\] Gigan\n\[monster deck\]\n1 EBP04-027\n/);
});

test("Export all writes one JSON backup; importing it brings the decks back", async ({
  page,
}) => {
  await page.goto("/decks");
  await importDeck(page, tcgdbList, "Gigan");
  const download = page.waitForEvent("download");
  await page.getByTestId("db-export-all").click();
  const file = await (await download).path();
  const backup = readFileSync(file, "utf8");
  expect(JSON.parse(backup)).toMatchObject({
    app: "gojisim",
    kind: "decks",
    decks: [{ name: "Gigan" }],
  });
  await deckRow(page, "Gigan").getByTestId("db-delete").click();
  await deckRow(page, "Gigan").getByTestId("db-delete-confirm").click();
  await expect(await myDecks(page)).toHaveCount(0);
  await page.getByTestId("db-backup-file").setInputFiles({
    name: "gojisim-my-decks.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(await myDecks(page)).toHaveText(["Gigan"]);
  await expect(page.getByTestId("db-decks-note")).toContainText(
    "Restored 1 deck",
  );
});

test("without storage, an imported deck still works for this visit, and My decks says so", async ({
  page,
}) => {
  // IndexedDB blocked (a private window with storage off, for example).
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new Error("SecurityError: storage is blocked");
      },
    });
  });
  await page.goto("/decks");
  await importDeck(page, tcgdbList, "Visitor");
  await expect(page.getByTestId("decks-session-only")).toBeVisible();
  await expect(await myDecks(page)).toHaveText(["Visitor"]);
  // It opens in the builder for this visit.
  await deckRow(page, "Visitor").getByTestId("db-load").click();
  await expect(page.getByTestId("db-deck-name")).toHaveValue("Visitor");
});

test("Enter in the deck name saves the deck", async ({ page }) => {
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await page.getByTestId("import-text").fill(tcgdbList);
  await page.getByTestId("import-name").fill("Entered");
  await page.getByTestId("import-name").press("Enter");
  await expect(await myDecks(page)).toHaveText(["Entered"]);
});

test("a godzillatcgdb deck page copied whole (Select All, Copy) imports with its counts and plays", async ({
  page,
}) => {
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await page
    .getByTestId("import-text")
    .fill(cardsFixture("godzillatcgdb-deck-page.txt"));
  await expect(page.getByTestId("import-format")).toContainText(
    "godzillatcgdb.com deck page",
  );
  await expect(page.getByTestId("import-counts")).toHaveText(
    "Monster deck 4 · Main deck 50",
  );
  await expect(page.getByTestId("import-cards")).toContainText(
    "4 × Gigan (2004) [EBP04-028]",
  );
  await expect(page.getByTestId("import-warnings")).toHaveCount(0);
  await expect(page.getByTestId("import-name")).toHaveValue(
    "Sample Gigan Deck",
  );
  await page.getByTestId("import-save").click();
  await expect(await myDecks(page)).toHaveText(["Sample Gigan Deck"]);
  await pickInPlay(page, "Sample Gigan Deck");
  await expect(
    page.getByTestId("seat-panel-P1").getByTestId("legality"),
  ).toHaveText("Legal");
  await startGame(page);
  await expect(
    page.getByTestId("monster-P1").getByTestId("card"),
  ).toHaveAttribute("title", /EBP04-027/);
});

test("a godzilla-sim Export to Clipboard (no name line) saves once it's named", async ({
  page,
}) => {
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await page
    .getByTestId("import-text")
    .fill(cardsFixture("godzilla-sim-export-one.txt"));
  await expect(page.getByTestId("import-format")).toContainText("godzilla-sim");
  await expect(page.getByTestId("import-name")).toHaveValue("");
  await expect(page.getByTestId("import-save")).toBeDisabled();
  await page.getByTestId("import-name").fill("From godzilla-sim");
  await page.getByTestId("import-save").click();
  await expect(await myDecks(page)).toHaveText(["From godzilla-sim"]);
});

test("Import all keeps folders, skips a deck already saved, asks about a name clash, and reports the bad one (#167)", async ({
  page,
}) => {
  const all = cardsFixture("godzilla-sim-export-all.txt");
  const heisei = "Starters/Starter Deck - Heisei Series Godzilla";
  const minusOne = all.slice(
    all.indexOf("[deck] Starters/Starter Deck - Godzilla Minus One"),
    all.indexOf(`[deck] ${heisei}`),
  );
  await page.goto("/decks");
  // My decks already has a different "...Heisei Series Godzilla" (the Minus One list).
  await importDeck(page, minusOne, heisei);
  await page.getByTestId("db-decks-close").click();
  const text = `${all}\n[deck] Club/Broken\n[main deck]\n4 ZZZ99-999\n`;
  await page.getByTestId("db-import").click();
  await page.getByTestId("import-text").fill(text);
  await page.getByTestId("import-all").click();
  await expect(page.getByTestId("import-all-result")).toContainText(
    "Saved 1 of 3 decks: Starters/Starter Deck - Godzilla Minus One",
  );
  await expect(page.getByTestId("import-all-result")).toContainText(
    "Not saved, Club/Broken: Line",
  );
  const clash = page.getByTestId("import-clash");
  await expect(clash).toHaveAttribute("data-deck-name", heisei);
  await clash.getByTestId("import-clash-keep").click();
  await expect(clash).toContainText(`Kept both: saved as "${heisei} (2)"`);
  // A second click can't save the same decks again.
  await expect(page.getByTestId("import-all")).toBeDisabled();
  await expect(page.getByTestId("import-cancel")).toHaveText("Close [Esc]");
  await page.getByTestId("import-cancel").click();
  await expect(await myDecks(page)).toHaveText([
    heisei,
    "Starters/Starter Deck - Godzilla Minus One",
    `${heisei} (2)`,
  ]);
  await page.getByTestId("db-decks-close").click();

  // The same text again: what's saved is skipped; Replace gives the clash the imported list.
  await page.getByTestId("db-import").click();
  await page.getByTestId("import-text").fill(all);
  await page.getByTestId("import-all").click();
  await expect(page.getByTestId("import-all-same")).toContainText(
    "Already in My decks: Starters/Starter Deck - Godzilla Minus One",
  );
  await page.getByTestId("import-clash-replace").click();
  await expect(page.getByTestId("import-clash")).toContainText("Replaced.");
  await page.getByTestId("import-cancel").click();
  await expect(await myDecks(page)).toHaveCount(3);
});

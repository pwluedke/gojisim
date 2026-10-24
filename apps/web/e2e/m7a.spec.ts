import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { startGame } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/** M7a: importing a deck in the browser, and My decks. */

/** A deck copied from godzillatcgdb.com's printable deck list (tab-separated rows). */
const tcgdbList = readFileSync(
  new URL(
    "../../../packages/cards/test/fixtures/godzillatcgdb-print-tabs.txt",
    import.meta.url,
  ),
  "utf8",
);

async function importDeck(page: Page, text: string, name?: string) {
  await page.getByTestId("import-deck").click();
  await page.getByTestId("import-text").fill(text);
  if (name) await page.getByTestId("import-name").fill(name);
  await page.getByTestId("import-save").click();
  await expect(page.getByTestId("import-deck")).toBeVisible();
}

const myDecks = (page: Page) => page.getByTestId("my-deck-name");

test("paste a godzillatcgdb list, save it, pick it and start a game against the bot", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("import-deck").click();
  await page.getByTestId("import-text").fill(tcgdbList);
  await expect(page.getByTestId("import-format")).toContainText(
    "godzillatcgdb.com printable deck list",
  );
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
  await expect(myDecks(page)).toHaveText(["Sample Gigan Deck"]);
  // Saved decks are listed under My decks, with their badge, and the new one is P1's pick.
  await expect(page.getByTestId("deck-P1")).toHaveValue(/^mine:/);
  await page
    .getByTestId("deck-P1")
    .selectOption({ label: "Sample Gigan Deck" });
  await expect(
    page.getByTestId("seat-panel-P1").getByTestId("legality"),
  ).toContainText("Warnings");
  await startGame(page);
  await expect(
    page.getByTestId("monster-P1").getByTestId("card"),
  ).toHaveAttribute("title", /EBP04-027/);
});

test("an unknown card number blocks saving", async ({ page }) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("import-deck").click();
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

test("rename and delete a saved deck; saved decks survive a reload", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await importDeck(page, tcgdbList, "Gigan");
  await importDeck(page, tcgdbList, "Second");
  await expect(myDecks(page)).toHaveText(["Gigan", "Second"]);
  // Storage has caught up before the reload.
  await expect(page.getByTestId("my-decks")).toHaveAttribute(
    "data-decks-stored",
    "true",
  );
  await page.reload();
  await expect(myDecks(page)).toHaveText(["Gigan", "Second"]);
  const first = page.getByTestId("my-deck").filter({ hasText: "Gigan" });
  await first.getByTestId("rename-deck").click();
  await page.getByTestId("rename-input").fill("Renamed Gigan");
  await page.getByTestId("rename-save").click();
  await expect(myDecks(page)).toHaveText(["Renamed Gigan", "Second"]);
  const second = page.getByTestId("my-deck").filter({ hasText: "Second" });
  await second.getByTestId("delete-deck").click();
  await second.getByTestId("delete-confirm").click();
  await expect(myDecks(page)).toHaveText(["Renamed Gigan"]);
  // Storage has caught up before the reload.
  await expect(page.getByTestId("my-decks")).toHaveAttribute(
    "data-decks-stored",
    "true",
  );
  await page.reload();
  await expect(myDecks(page)).toHaveText(["Renamed Gigan"]);
  await expect(page.getByTestId("deck-P2").locator("option")).toContainText([
    "Renamed Gigan",
  ]);
});

test("Copy puts the deck on the clipboard as plain text", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/play?mode=bot");
  await importDeck(page, tcgdbList, "Gigan");
  await page.getByTestId("copy-deck").click();
  await expect(page.getByTestId("decks-note")).toContainText("Copied Gigan");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toMatch(/^\[deck\] Gigan\n\[monster deck\]\n1 EBP04-027\n/);
});

test("Export all writes one JSON backup; importing it brings the decks back", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await importDeck(page, tcgdbList, "Gigan");
  const download = page.waitForEvent("download");
  await page.getByTestId("export-decks").click();
  const file = await (await download).path();
  const backup = readFileSync(file, "utf8");
  expect(JSON.parse(backup)).toMatchObject({
    app: "gojisim",
    kind: "decks",
    decks: [{ name: "Gigan" }],
  });
  const row = page.getByTestId("my-deck").filter({ hasText: "Gigan" });
  await row.getByTestId("delete-deck").click();
  await row.getByTestId("delete-confirm").click();
  await expect(myDecks(page)).toHaveCount(0);
  await page.getByTestId("import-backup").setInputFiles({
    name: "gojisim-my-decks.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(myDecks(page)).toHaveText(["Gigan"]);
  await expect(page.getByTestId("decks-note")).toContainText("Imported 1 deck");
});

test("without storage, an imported deck still works for this visit", async ({
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
  await page.goto("/play?mode=bot");
  await expect(page.getByTestId("decks-session-only")).toBeVisible();
  await importDeck(page, tcgdbList, "Visitor");
  await expect(myDecks(page)).toHaveText(["Visitor"]);
  await expect(page.getByTestId("deck-P1")).toHaveValue(/^mine:/);
  await startGame(page);
  await expect(
    page.getByTestId("monster-P1").getByTestId("card"),
  ).toHaveAttribute("title", /EBP04-027/);
});

test("Enter in the deck name saves the deck (it doesn't start a game)", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("import-deck").click();
  await page.getByTestId("import-text").fill(tcgdbList);
  await page.getByTestId("import-name").fill("Entered");
  await page.getByTestId("import-name").press("Enter");
  await expect(myDecks(page)).toHaveText(["Entered"]);
  await expect(page.getByTestId("first-pick")).toHaveCount(0);
  await expect(page.getByTestId("start-game")).toBeVisible();
});

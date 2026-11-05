import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * #166 card insights (Paul's OK, Nov 4, 2026): under the card text in the card detail, folded by
 * default and remembered, the My decks holding the card (click to load), its archetypes and
 * its combos.
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

async function saveDecks(page: Page, names: string[]) {
  await page.getByTestId("db-import").click();
  await page.getByTestId("import-text").fill(names.map(named).join("\n\n"));
  await page.getByTestId("import-all").click();
  await expect(page.getByTestId("import-all-result")).toContainText(
    `Saved ${names.length} of ${names.length} decks`,
  );
  await page.getByTestId("import-cancel").click();
}

/** Opens the card detail of the only card the search finds. */
async function openCard(page: Page, query: string) {
  await page.goto(`/decks?q=${encodeURIComponent(query)}`);
  await page.getByTestId("db-card-image").first().click();
  await expect(page.getByTestId("db-card-panel")).toBeVisible();
}

test("card insights start folded; open, they list My decks, archetypes and combos, and stay open", async ({
  page,
}) => {
  await page.goto("/decks");
  await saveDecks(page, ["Club/Red Rage", "Ginza Test"]);
  // Ginza Annihilated (ESD01-013): in the ESD01 starter and the Ginza Inferno combo.
  await openCard(page, "Ginza Annihilated");
  await expect(page.getByTestId("db-insights-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("db-insights-body")).toHaveCount(0);
  await page.getByTestId("db-insights-toggle").click();
  const decks = page.getByTestId("db-insights-decks");
  await expect(decks).toContainText("Red Rage");
  await expect(decks).toContainText("Ginza Test");
  await expect(decks.getByRole("button", { name: "Red Rage" })).toHaveAttribute(
    "title",
    "Folder: Club",
  );
  await expect(page.getByTestId("db-insights-combos")).toContainText(
    "Ginza Inferno",
  );
  // Remembered: the next card opens with the section open.
  await openCard(page, "Godzilla Emerges");
  await expect(page.getByTestId("db-insights-body")).toBeVisible();
});

test("a deck in card insights loads into the Deckbuilder", async ({ page }) => {
  await page.goto("/decks");
  // Import all takes two or more decks.
  await saveDecks(page, ["Club/Red Rage", "Other"]);
  await openCard(page, "Ginza Annihilated");
  await page.getByTestId("db-insights-toggle").click();
  await page
    .getByTestId("db-insights-decks")
    .getByRole("button", { name: "Red Rage" })
    .click();
  await expect(page.getByTestId("db-deck-name")).toHaveValue("Club/Red Rage");
});

test("a card in no deck, archetype or combo says so", async ({ page }) => {
  await page.goto("/decks");
  await page.evaluate(() =>
    window.localStorage.setItem("gojisim.deckbuilder.insightsOpen", "true"),
  );
  // Constructed Future (SD05-005): in no saved deck, catalog archetype or combo.
  await openCard(page, "Constructed Future");
  await expect(page.getByTestId("db-insights-none")).toHaveText(
    "No decks, archetypes or combos use it yet.",
  );
});

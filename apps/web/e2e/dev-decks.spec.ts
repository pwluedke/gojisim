import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * Development decks from `local-decks/*.txt` (Monarch, Oct 25, 2026). The dev server reads the
 * fixture folder `e2e/fixtures/local-decks` here (playwright.config.ts): made-up decks, never
 * Paul's files.
 */

const starter = readFileSync(
  new URL(
    "../../../packages/cards/data/decks/esd01-starter.txt",
    import.meta.url,
  ),
  "utf8",
);
/** A deck list with one deck called `name` (the ESD01 starter's cards). */
const deckList = (...names: string[]) =>
  names
    .map((name) => starter.replace(/^\[deck\].*$/m, `[deck] ${name}`))
    .join("\n");

/** Option texts of a select's optgroup. */
const optionsIn = (page: Page, select: string, group: string) =>
  page
    .getByTestId(select)
    .locator(`optgroup[label="${group}"] option`)
    .allTextContents();

test("/play lists the development deck files grouped by file and folder; the filter finds a deck by name, file or folder", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(page.getByTestId("dev-deck-filter")).toBeVisible();
  expect(
    await optionsIn(
      page,
      "deck-P1",
      "Development: club-nights.txt › tournament",
    ),
  ).toEqual(["Night Shift", "Second Wind"]);
  expect(
    await optionsIn(page, "deck-P1", "Development: club-nights.txt"),
  ).toEqual(["Harbor Watch", "Broken Pencil"]);
  expect(
    await optionsIn(
      page,
      "deck-P1",
      "Development: sample-binder.txt › archive",
    ),
  ).toEqual(["Old Faithful"]);

  const filter = page.getByTestId("dev-deck-filter");
  await filter.fill("faithful");
  const groups = page.getByTestId("deck-P1").locator("optgroup");
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(1)).toHaveAttribute(
    "label",
    "Development: sample-binder.txt › archive",
  );
  // The starters always stay.
  await expect(groups.nth(0)).toHaveAttribute("label", "Starters");
  await filter.fill("tournament");
  expect(
    await page
      .getByTestId("deck-P1")
      .locator('optgroup[label^="Development"] option')
      .allTextContents(),
  ).toEqual(["Night Shift", "Second Wind"]);
  // Enter in the filter never starts a game.
  await filter.press("Enter");
  await expect(page.getByTestId("start-game")).toBeVisible();

  // Pick one and play it: the fight card names it.
  const option = page
    .getByTestId("deck-P1")
    .locator("option", { hasText: "Second Wind" });
  await page
    .getByTestId("deck-P1")
    .selectOption((await option.getAttribute("value")) ?? "");
  // The pick stays listed once the filter no longer matches it.
  await filter.fill("faithful");
  await expect(page.getByTestId("deck-P1")).toHaveValue(
    "file:club-nights.txt:tournament/Second Wind",
  );
  await page.getByTestId("start-game").click();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("fight-deck-you")).toHaveText("Second Wind");
});

test("/debug shows each file's deck count and its parse errors once, with the line; the rest of the deck loads", async ({
  page,
}) => {
  await page.goto("/debug");
  const files = page.getByTestId("local-deck-files");
  await expect(files).toContainText(
    "club-nights.txt (4), sample-binder.txt (1)",
  );
  const errors = page.getByTestId("local-deck-errors");
  await expect(errors).toHaveCount(1);
  await expect(errors).toHaveAttribute("data-file", "club-nights.txt");
  await expect(errors).toHaveText(
    "club-nights.txt line 89: Unknown card number XYZ-999",
  );
  // Broken Pencil still loads, without the unknown line (so it's short of 50).
  await expect(
    page
      .getByTestId("deck-P1")
      .locator("option", { hasText: "Broken Pencil ✗ 6.1.1.2" }),
  ).toHaveCount(1);
});

test("/debug: importing a file again replaces decks with the same name; Clear removes every imported deck", async ({
  page,
}) => {
  await page.goto("/debug");
  const importList = (text: string) =>
    page.getByTestId("import-deck-list").setInputFiles({
      name: "mine.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(text),
    });
  const p1 = page.getByTestId("deck-P1");
  const kept = p1.locator("option", { hasText: "Kept Deck" });
  await importList(deckList("Kept Deck", "Other Deck"));
  await expect(kept).toHaveCount(1);
  await importList(deckList("Kept Deck"));
  await expect(kept).toHaveCount(1);
  await expect(p1.locator("option", { hasText: "Other Deck" })).toHaveCount(1);
  await page.reload();
  await expect(kept).toHaveCount(1);

  await page.getByTestId("clear-imported-decks").click();
  await expect(page.getByTestId("clear-imported-confirm")).toContainText(
    "Clear 2 imported decks",
  );
  await page.getByTestId("clear-imported-yes").click();
  await expect(kept).toHaveCount(0);
  await expect(page.getByTestId("clear-imported-decks")).toHaveCount(0);
  await page.reload();
  await expect(kept).toHaveCount(0);
  // The file decks are not imports: they stay.
  await expect(p1.locator("option", { hasText: "Harbor Watch" })).toHaveCount(
    1,
  );
});

test("a deck stored in this browser with a file deck's name shows once, as the file deck, in /play and /debug", async ({
  page,
}) => {
  await page.addInitScript(
    (text) => {
      window.localStorage.setItem("gojisim.debug.importedDecks", text);
    },
    deckList("Harbor Watch", "tournament/Night Shift", "Only Stored"),
  );
  for (const path of ["/play", "/debug"]) {
    await page.goto(path);
    const p1 = page.getByTestId("deck-P1");
    await expect(p1.locator("option", { hasText: "Harbor Watch" })).toHaveCount(
      1,
    );
    await expect(p1.locator("option", { hasText: "Night Shift" })).toHaveCount(
      1,
    );
    await expect(
      p1.locator('optgroup[label="Development: imported in /debug"] option'),
    ).toHaveCount(1);
    await expect(p1.locator("option", { hasText: "Only Stored" })).toHaveCount(
      1,
    );
  }
});

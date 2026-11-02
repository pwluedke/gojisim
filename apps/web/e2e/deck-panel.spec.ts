import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

/**
 * The deck panel (#158): build a deck by click and by drag, see its legality live, save it to My
 * decks, edit it, copy it, load decks and duplicate them, and be asked before unsaved changes go.
 */
const panel = (page: Page) => page.getByTestId("db-panel");
/** A main deck row (a monster card can be in both zones). */
const row = (page: Page, cardNumber: string) =>
  page
    .getByTestId("db-zone-main")
    .locator(`[data-testid="db-row"][data-card-number="${cardNumber}"]`);

async function loadStarter(page: Page, index = 0) {
  await page.getByTestId("db-my-decks").click();
  await page
    .getByTestId("db-starter")
    .nth(index)
    .getByTestId("db-load")
    .click();
  await expect(page.getByTestId("db-decks-window")).toHaveCount(0);
}

test("#158: clicks and drags build the deck, counts and limits show, and legality updates live", async ({
  page,
}) => {
  await page.goto("/decks?type=Monster&set=ESD01");
  const monsters = page.getByTestId("db-card");
  await monsters.first().click();
  await expect(page.getByTestId("db-count-monster")).toHaveText("1/4");
  await expect(page.getByTestId("db-legality")).toHaveAttribute(
    "data-legal",
    "false",
  );
  await expect(page.getByTestId("db-reason").first()).toContainText(
    "Monster deck: 1 card",
  );
  // The same card again: its rank is taken, so it goes to the main deck.
  await monsters.first().click();
  await expect(page.getByTestId("db-count-main")).toHaveText("1/50");
  // A drag onto the monster deck puts it there.
  await monsters.nth(1).dragTo(page.getByTestId("db-zone-monster"));
  await expect(page.getByTestId("db-count-monster")).toHaveText("2/4");
  // - and + change a row's count.
  const first = panel(page)
    .getByTestId("db-zone-main")
    .getByTestId("db-row")
    .first();
  await first.getByTestId("db-plus").click();
  await expect(first).toContainText("2×");
  await first.getByTestId("db-minus").click();
  await first.getByTestId("db-minus").click();
  await expect(page.getByTestId("db-count-main")).toHaveText("0/50");
});

test("#158: a starter loads legal; a banned card is marked with its reason; the deck saves, edits and copies through My decks", async ({
  page,
}) => {
  await page.goto("/decks");
  await loadStarter(page);
  await expect(page.getByTestId("db-deck-name")).toHaveValue("ESD01 official");
  await expect(page.getByTestId("db-count-monster")).toHaveText("4/4");
  await expect(page.getByTestId("db-count-main")).toHaveText("50/50");
  await expect(page.getByTestId("db-legality")).toHaveAttribute(
    "data-legal",
    "true",
  );

  // A 51st card breaks 6.1.1.2, and a fifth copy breaks the copy limit, marking that row.
  const anyRow = panel(page)
    .getByTestId("db-zone-main")
    .getByTestId("db-row")
    .first();
  const number = await anyRow.getAttribute("data-card-number");
  for (let i = 0; i < 4; i++) await anyRow.getByTestId("db-plus").click();
  await expect(page.getByTestId("db-legality")).toHaveAttribute(
    "data-legal",
    "false",
  );
  await expect(page.getByTestId("db-reason")).toContainText([
    /needs exactly 50/,
  ]);
  await expect(row(page, number ?? "")).toHaveAttribute("data-broken", "true");

  // Saved (illegal is allowed), it's in My decks; edited and saved again, the same deck changes.
  await page.getByTestId("db-deck-name").fill("Red Variant");
  await page.getByTestId("db-save").click();
  await expect(page.getByTestId("db-panel-note")).toHaveText(
    "Saved Red Variant.",
  );
  await expect(page.getByTestId("db-my-decks")).toHaveText("My decks (1)");
  for (let i = 0; i < 4; i++) await anyRow.getByTestId("db-minus").click();
  await page.getByTestId("db-save").click();
  await expect(page.getByTestId("db-my-decks")).toHaveText("My decks (1)");
  await expect(page.getByTestId("db-legality")).toHaveAttribute(
    "data-legal",
    "true",
  );

  // Save as copy makes a second deck.
  await page.getByTestId("db-save-copy").click();
  await expect(page.getByTestId("db-panel-note")).toHaveText(
    "Saved a copy as Red Variant (copy).",
  );
  await expect(page.getByTestId("db-my-decks")).toHaveText("My decks (2)");

  // My decks: Duplicate, and Load opens the saved deck as it was saved.
  await page.getByTestId("db-my-decks").click();
  const win = page.getByTestId("db-decks-window");
  await win
    .locator('[data-deck-name="Red Variant"]')
    .getByTestId("db-duplicate")
    .click();
  await expect(win.getByTestId("db-deck")).toHaveCount(3);
  await expect(
    win.locator('[data-deck-name="Red Variant (copy 2)"]'),
  ).toHaveCount(1);
  await win
    .locator('[data-deck-name="Red Variant"]')
    .getByTestId("db-load")
    .click();
  await expect(page.getByTestId("db-deck-name")).toHaveValue("Red Variant");
  await expect(page.getByTestId("db-count-main")).toHaveText("50/50");

  // The saved deck plays: it's under My decks in /play's picker.
  await page.goto("/play?mode=bot");
  await expect(
    page
      .getByTestId("deck-P1")
      .locator('optgroup[label="My decks"] option', { hasText: "Red Variant" }),
  ).toHaveCount(3);
});

test("#158: leaving with unsaved changes asks first; Cancel keeps the deck", async ({
  page,
}) => {
  await page.goto("/decks");
  await loadStarter(page);
  await page
    .getByTestId("db-zone-main")
    .getByTestId("db-row")
    .first()
    .getByTestId("db-plus")
    .click();
  // New deck asks; Cancel keeps the changes.
  page.once("dialog", (d) => {
    expect(d.message()).toBe(
      'Discard the unsaved changes to "ESD01 official"?',
    );
    void d.dismiss();
  });
  await page.getByTestId("db-new").click();
  await expect(page.getByTestId("db-count-main")).toHaveText("51/50");
  // Loading another deck asks too; OK discards.
  page.once("dialog", (d) => void d.accept());
  await loadStarter(page, 1);
  await expect(page.getByTestId("db-deck-name")).toHaveValue("ESD02 official");
  // A clean deck doesn't ask.
  let asked = false;
  page.once("dialog", (d) => {
    asked = true;
    void d.dismiss();
  });
  await page.getByTestId("db-new").click();
  await expect(page.getByTestId("db-count-main")).toHaveText("0/50");
  expect(asked).toBe(false);
});

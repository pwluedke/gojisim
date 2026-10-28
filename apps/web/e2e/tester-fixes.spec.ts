import { expect, test } from "@playwright/test";
import { loadFixture } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/** Tester fixes 1: Undo, View board and the preview in the choice modal; the whole-deck search. */

test("Undo [U] in the modal takes back the confirmed discard; the left panel's button is under the backdrop", async ({
  page,
}) => {
  await loadFixture(page, "undo-discard");
  const modal = page.getByTestId("choice-modal");
  await expect(modal).toHaveAttribute("data-kind", "target");
  await expect(page.getByTestId("choice-source")).toContainText("EBP03-017");
  // The left panel's Undo is under the modal's backdrop: what the page shows there is the backdrop.
  const left = await page.getByTestId("undo").boundingBox();
  const covered = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x as number, y as number)
        ?.closest('[data-testid="undo"]') === null,
    [left!.x + left!.width / 2, left!.y + left!.height / 2],
  );
  expect(covered).toBe(true);
  const undo = page.getByTestId("choice-undo");
  await expect(undo).toHaveText("Undo [U]");
  await undo.click();
  // Back to the discard pick (5.7.1): the discarded card is in the hand again.
  await expect(page.getByTestId("choice-heading")).toContainText(
    "choosing a card to discard",
  );
  // U does the same: the yes / no of the optional cost comes back.
  await page.keyboard.press("u");
  await expect(modal).toHaveAttribute("data-kind", "confirm");
});

test("View board (or B) hides the modal behind a banner; B, the banner or Esc brings it back", async ({
  page,
}) => {
  await loadFixture(page, "target");
  const modal = page.getByTestId("choice-modal");
  await expect(modal).toBeVisible();
  await page.getByTestId("view-board").click();
  await expect(modal).toHaveAttribute("data-viewing-board", "true");
  await expect(page.getByTestId("view-board-banner")).toHaveText(
    /Choice open:\s*Return \[B\]/,
  );
  // The board's cards preview while the modal is away.
  await page.getByTestId("view-board-return").click();
  await expect(modal).not.toHaveAttribute("data-viewing-board", "true");
  await page.keyboard.press("b");
  await expect(page.getByTestId("view-board-banner")).toBeVisible();
  await page.keyboard.press("b");
  await expect(page.getByTestId("view-board-banner")).toHaveCount(0);
  await page.keyboard.press("b");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("view-board-banner")).toHaveCount(0);
  // Esc returned to the modal without closing anything else.
  await expect(modal).toBeVisible();
  // The hold-to-peek eye stays.
  await expect(page.getByTestId("choice-eye")).toBeVisible();
});

test("hovering a card in the modal opens the large preview above it", async ({
  page,
}) => {
  await loadFixture(page, "target");
  const option = page.getByTestId("choice-option").first();
  const cardId = await option.getAttribute("data-card-id");
  await option.hover();
  const preview = page.getByTestId("modal-preview");
  await expect(preview.getByTestId("card-preview")).toHaveAttribute(
    "data-card-id",
    cardId as string,
  );
  // Above the modal: it renders in the modal's own layer, over the backdrop (the preview ignores
  // the pointer, decision 198, so a hit test can't see it).
  await expect(
    page.getByTestId("choice-modal").getByTestId("card-preview"),
  ).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(preview).toHaveCount(0);
});

test("a search can show the whole deck, sorted, with the cards that don't match dimmed", async ({
  page,
}) => {
  await loadFixture(page, "search");
  const options = page.getByTestId("choice-option");
  const matching = await options.count();
  await expect(page.getByTestId("search-deck-card")).toHaveCount(0);
  await page.getByTestId("search-show-deck").check();
  const dimmed = page.getByTestId("search-deck-card");
  expect(await dimmed.count()).toBeGreaterThan(0);
  // The matching cards stay pickable; the others can't be picked.
  await expect(options).toHaveCount(matching);
  await expect(dimmed.first()).toHaveAttribute("aria-disabled", "true");
  await expect(dimmed.first()).toBeDisabled();
  // Hidden cards: the preview shows the printed card.
  await dimmed.first().hover();
  await expect(page.getByTestId("modal-preview")).toBeVisible();
  // Sorted by card number, so the list never shows the deck's order (decision 165).
  const numbers = await dimmed.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-card-number") ?? ""),
  );
  expect(numbers).toEqual([...numbers].sort((a, b) => a.localeCompare(b)));
  await page.getByTestId("search-show-deck").uncheck();
  await expect(dimmed).toHaveCount(0);
});

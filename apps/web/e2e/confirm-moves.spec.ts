import { expect, test, type Page } from "@playwright/test";
import { loadFixture, visibleCenter } from "./helpers";

/** #355: the Confirm moves setting asks before a hand play, a discard or a strategy is sent. */

test.use({ viewport: { width: 1440, height: 900 } });

/** Drags the first hand card onto your discard pile (an invasion) and lets go. */
async function dragToDiscard(page: Page) {
  const card = page.getByTestId("hand-card").first();
  const discard = page.getByTestId("discard-P1");
  const a = await visibleCenter(page, card);
  const b = await visibleCenter(page, discard);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 20, a.y - 10, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
}

test("with Confirm moves on, a drag onto the discard pile asks first: Cancel leaves the card in hand, Confirm discards it", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const hand = page.getByTestId("hand-card");
  const discardCount = page.getByTestId("discard-count-P1");
  const cards = await hand.count();
  const discarded = await discardCount.textContent();

  // Off by default.
  await page.getByTestId("settings").click();
  await expect(page.getByTestId("setting-confirm-moves")).not.toBeChecked();
  await page.getByTestId("setting-confirm-moves").check();
  await page.getByTestId("settings").click();

  // Cancel: nothing is sent, the card stays in hand.
  await dragToDiscard(page);
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("?");
  await expect(page.getByTestId("confirm-yes")).toHaveText("Confirm [Enter]");
  await expect(
    page.locator('[data-highlight="true"][data-target="discard"]'),
  ).toHaveCount(1);
  await page.getByTestId("confirm-cancel").click();
  await expect(dialog).toHaveCount(0);
  await expect(hand).toHaveCount(cards);
  await expect(discardCount).toHaveText(discarded ?? "");

  // Escape cancels too.
  await dragToDiscard(page);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(hand).toHaveCount(cards);

  // Confirm (Enter): the card goes to the discard pile.
  await dragToDiscard(page);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(hand).toHaveCount(cards - 1);
  await expect(discardCount).not.toHaveText(discarded ?? "");
});

test("with Confirm moves on, a click-to-play into a zone asks first and shows the zone; off, it plays at once", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const hand = page.getByTestId("hand-card");
  const cards = await hand.count();
  const playIntoZone = async () => {
    await hand.first().click();
    await page.locator('[data-lit][data-target^="zone:"]').first().click();
    // A card with several plays there opens "Which one?": take its first.
    const menu = page.getByTestId("action-menu-item");
    if (await menu.count()) await menu.first().click();
  };
  await page.getByTestId("settings").click();
  await page.getByTestId("setting-confirm-moves").check();
  await page.getByTestId("settings").click();
  await playIntoZone();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await expect(
    page.locator('[data-highlight="true"][data-target^="zone:"]'),
  ).toHaveCount(1);
  await page.getByTestId("confirm-cancel").click();
  await expect(hand).toHaveCount(cards);
  // Off again: the play goes through with no dialog.
  await page.getByTestId("settings").click();
  await page.getByTestId("setting-confirm-moves").uncheck();
  await page.getByTestId("settings").click();
  await playIntoZone();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(hand).toHaveCount(cards - 1);
});

import { expect, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

/*
 * Paul, Nov 11: Manda (2004) EBP04-045 says "you may discard 1 non-blue battle card ... to play
 * this card with its rank reduced by 2". With the plain play legal too, the zone offers both, in
 * the "Which one?" menu (8.2.1, 10.5.4).
 */

test.use({ viewport: { width: 1440, height: 900 } });

const handCount = (page: Page) =>
  page
    .getByTestId("your-hand-count")
    .textContent()
    .then((t) => Number(t));

/** Finds Manda in the hand by its hover preview (card id 770 or 771), selects it and opens a zone's menu. */
async function openMandaMenu(page: Page) {
  const cards = page.getByTestId("hand-card");
  for (let i = 0; i < (await cards.count()); i++) {
    await cards.nth(i).hover();
    const id = await page
      .getByTestId("card-preview")
      .getAttribute("data-card-id", { timeout: 2_000 })
      .catch(() => null);
    if (id !== "770" && id !== "771") continue;
    await cards.nth(i).click();
    await page.locator('[data-lit][data-target^="zone:"]').first().click();
    return page.getByTestId("action-menu");
  }
  throw new Error("no Manda in the hand");
}

test("8.2.1, 10.5.4 (Paul, Nov 11): Manda's zone offers the plain play and the play paid with a non-blue battle card", async ({
  page,
}) => {
  await loadFixture(page, "manda-cost");
  const before = await handCount(page);
  const menu = await openMandaMenu(page);
  const items = menu.getByTestId("action-menu-item");
  // The plain play, and one play per different paying card.
  await expect(items.filter({ hasNotText: "discarding" })).toHaveCount(1);
  expect(await items.filter({ hasText: "discarding" }).count()).toBeGreaterThan(
    0,
  );
  await items.filter({ hasText: "discarding" }).first().click();
  // Manda and the card paid for it both leave the hand.
  await expect.poll(() => handCount(page)).toBe(before - 2);
});

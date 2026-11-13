import { expect, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

/*
 * #250 (Paul's report, Nov 12): placing several tokens at once, each zone already picked shows the
 * token until the choice is done (9.1.2), for every token type.
 */

test.use({ viewport: { width: 1440, height: 900 } });

/** Picks lit zones until no zone choice is left. */
async function finishPicks(page: Page) {
  const zones = page.locator("[data-zone-choice]");
  while ((await zones.count()) > 0) {
    await zones.first().click();
    await page.waitForTimeout(200);
  }
}

for (const [fixture, name] of [
  ["token-crystals", "Crystals"],
  ["token-tentacles", "Tentacles"],
] as const)
  test(`#250, 9.1.2: ${name}: a zone already picked shows the token until every token is placed`, async ({
    page,
  }) => {
    await loadFixture(page, fixture);
    const marker = page.getByTestId("mat-you").getByTestId("picked-token");
    await expect(marker.first()).toBeVisible();
    await expect(marker.first()).toContainText(name);
    // The picked zone isn't offered again while others are left (5.11.1.3).
    const pickedZones = await marker.count();
    expect(pickedZones).toBeGreaterThan(0);
    expect(await page.locator("[data-zone-choice]").count()).toBeGreaterThan(0);
    await finishPicks(page);
    // Done: the markers go, and the tokens are on the mat.
    await expect(page.getByTestId("picked-token")).toHaveCount(0);
    await expect(
      page.getByTestId("mat-you").locator('[data-token="true"]'),
    ).not.toHaveCount(0);
  });

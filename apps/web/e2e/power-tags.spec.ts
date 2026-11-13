import { expect, test } from "@playwright/test";
import { loadFixture } from "./helpers";

/*
 * #245 (Paul, Nov 12): cards on the board show every addition as a yellow tag at the top; the
 * number at the bottom is the printed power and never changes. The rage zone panel keeps the totals.
 */

test.use({ viewport: { width: 1440, height: 900 } });

const num = (text: string | null) => Number(/-?\d+/.exec(text ?? "")?.[0]);

test("#245: a boosted battle card shows its printed counter power at the bottom and the boost as a CP tag", async ({
  page,
}) => {
  // The zone fixture: your Godzilla (2023) has +3000 counter power.
  await loadFixture(page, "zone");
  const card = page
    .getByTestId("board")
    .locator('[data-testid="card"]')
    .filter({
      has: page.locator(
        '[data-testid="change-chip"][data-kind="counterPower"]',
      ),
    })
    .first();
  await expect(card.getByTestId("counter-power-chip")).toHaveText(/^\d+$/);
  await expect(
    card.locator('[data-testid="change-chip"][data-kind="counterPower"]'),
  ).toHaveText(/^CP \+\d+$/);
});

test("#245, 3.4.5: the invading monster shows its printed threat at the bottom and every addition (rage included) as one Threat tag; the panel keeps the total", async ({
  page,
}) => {
  await loadFixture(page, "zone");
  // Your invading monster: the card with the threat chip on your mat.
  const monster = page
    .getByTestId("mat-you")
    .locator('[data-testid="card"]')
    .filter({ has: page.getByTestId("threat-chip") });
  await expect(monster).toHaveCount(1);
  const bottom = num(await monster.getByTestId("threat-chip").textContent());
  const tag = monster.locator(
    '[data-testid="change-chip"][data-kind="threat"]',
  );
  await expect(tag).toHaveText(/^Threat \+\d+$/);
  const total = num(await page.getByTestId("threat-P1").textContent());
  // Printed plus the tag is the panel's total: nothing is counted twice or left out.
  expect(bottom + num(await tag.textContent())).toBe(total);
  expect(bottom).toBeLessThan(total);
});

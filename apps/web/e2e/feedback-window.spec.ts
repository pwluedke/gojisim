import { expect, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Paul, Nov 15: the in-game feedback windows (Report bug, Bad Bot!, Good Bot!, Monster Island
 * Mailbox) leave the board in view and usable while writing. Each is dragged by its title bar and
 * stays inside the window; a card on the board still shows its hover preview; Hide folds it to a
 * tab and Show brings it back with the typed text kept; Send still sends.
 */

const WINDOWS = [
  { name: "Report bug", button: "report-bug", modal: "bug-modal" },
  { name: "Bad Bot!", button: "bad-bot", modal: "badBot-modal" },
  { name: "Good Bot!", button: "good-bot", modal: "goodBot-modal" },
  { name: "Monster Island Mailbox", button: "idea", modal: "idea-modal" },
] as const;

/** Drags the window by its title bar by (`dx`, `dy`). */
async function dragTitle(page: Page, dx: number, dy: number) {
  const title = await page.getByTestId("window-title").boundingBox();
  if (!title) throw new Error("no title bar");
  // Left of the title bar's Hide button.
  const x = title.x + 20;
  const y = title.y + title.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
}

for (const w of WINDOWS)
  test(`${w.name}: dragged by its title and kept on screen, the board's hover preview works beside it, Hide keeps the text, and Send sends`, async ({
    page,
  }) => {
    await loadFixture(page, "hand-five");
    await page.getByTestId(w.button).click();
    const modal = page.getByTestId(w.modal);
    await expect(modal).toBeVisible();
    // No backdrop over the board.
    await expect(page.locator('[data-testid$="-modal"]')).toHaveCount(1);

    // Dragged by the title bar: it moves with the pointer.
    const before = await modal.boundingBox();
    if (!before) throw new Error("no window");
    await dragTitle(page, -400, -40);
    await expect(modal).toHaveAttribute("data-moved", "true");
    const after = await modal.boundingBox();
    if (!after) throw new Error("no window");
    expect(after.x).toBeCloseTo(before.x - 400, -1);
    expect(after.y).toBeCloseTo(before.y - 40, -1);
    // Dragged far past the corner, it stops at the window's edge.
    await dragTitle(page, -3000, -3000);
    const corner = await modal.boundingBox();
    expect(corner).toMatchObject({ x: 0, y: 0 });

    // The board stays usable: a card in hand shows its preview with the window open.
    await page.getByTestId("hand-card").last().hover();
    await expect(page.getByTestId("card-preview")).toBeVisible();

    // Hide folds it to a tab; Show brings it back with the text kept.
    await page.getByTestId("report-name").fill("Dr. Serizawa");
    await page.getByTestId("report-text").fill(`${w.name}: kept`);
    await page.getByTestId("window-hide").click();
    await expect(modal).toBeHidden();
    await expect(page.getByTestId("window-show")).toHaveText(
      `${w.name} · Show`,
    );
    await page.getByTestId("hand-card").first().hover();
    await expect(page.getByTestId("card-preview")).toBeVisible();
    await page.getByTestId("window-show").click();
    await expect(modal).toBeVisible();
    await expect(page.getByTestId("window-show")).toHaveCount(0);
    await expect(page.getByTestId("report-name")).toHaveValue("Dr. Serizawa");
    await expect(page.getByTestId("report-text")).toHaveValue(
      `${w.name}: kept`,
    );

    // Send still sends.
    await page.getByTestId("report-submit").click();
    await expect(page.getByTestId("test-site-note")).toHaveText(
      "Thanks, sent.",
    );
    await expect(modal).toHaveCount(0);
  });

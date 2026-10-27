import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

/**
 * Bot hand row and larger mats: the bot's hand is a row of overlapping half-size cards left of its
 * mat, top-aligned with it, or one card with the count when the row would reach the mat; the
 * freed height goes to both mats. `hand-ten` leaves the bot 5 cards, `hand-five` 8.
 */

type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (page: Page, id: string): Promise<Box> => {
  const b = await page.getByTestId(id).first().boundingBox();
  if (!b) throw new Error(`no ${id}`);
  return b;
};

async function noScroll(page: Page) {
  const [sw, sh, w, h] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.scrollHeight,
    window.innerWidth,
    window.innerHeight,
  ]);
  expect(sw).toBeLessThanOrEqual(w as number);
  expect(sh).toBeLessThanOrEqual(h as number);
}

/** The card height before this change: 7.5 card heights and 96 px of chrome (with Showa's). */
const oldCardHeight = (height: number) =>
  (height - (96 + 4 * 12 + 4 * 12 + 4 * 3 + 56)) / 7.5;

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const)
  test.describe(`${width}x${height}`, () => {
    test.use({ viewport: { width, height } });

    for (const [fixture, cards] of [
      ["hand-ten", 5],
      ["hand-five", 8],
    ] as const)
      test(`${cards} bot cards: the row's top is the mat's top, it stays left of the mat, or it is one card with the count`, async ({
        page,
      }) => {
        await loadFixture(page, fixture);
        await expect(page.getByTestId("opponent-hand-count")).toHaveText(
          String(cards),
        );
        const mat = await boxOf(page, "mat-opp");
        const hand = page.getByTestId("opponent-hand");
        const row = await boxOf(page, "opponent-hand");
        // Top-aligned with the mat's top, never above it.
        expect(Math.abs(row.y - mat.y)).toBeLessThanOrEqual(1);
        const backs = page.getByTestId("opponent-card-back");
        const first = await backs.first().boundingBox();
        if (!first) throw new Error("no back");
        const needed = first.width * (1 + (cards - 1) / 6);
        if ((await hand.getAttribute("data-mode")) === "row") {
          await expect(backs).toHaveCount(cards);
          // Each next card shows about a sixth of the one before.
          const second = await backs.nth(1).boundingBox();
          expect(second?.x ?? 0).toBeCloseTo(first.x + first.width / 6, 0);
          const last = await backs.last().boundingBox();
          expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThan(mat.x);
          expect(needed).toBeLessThanOrEqual(row.width + 0.5);
        } else {
          // 5 cards always show as a row at 1440×900 and wider (Monarch, Oct 26, 2026).
          expect(cards === 5 && width >= 1440).toBe(false);
          // The row would have reached the mat: one card with the count on it.
          expect(needed).toBeGreaterThan(row.width);
          await expect(backs).toHaveCount(1);
          await expect(hand.getByTestId("opponent-hand-count")).toBeVisible();
          expect(first.x + first.width).toBeLessThan(mat.x);
        }
        // Both hands' rows stay inside the board, clear of the side columns.
        const left = await boxOf(page, "left-column");
        const right = await boxOf(page, "right-column");
        for (const id of ["opponent-hand", "mat-opp", "mat-you"]) {
          const b = await boxOf(page, id);
          expect(b.x, id).toBeGreaterThanOrEqual(left.x + left.width);
          expect(b.x + b.width, id).toBeLessThanOrEqual(right.x);
        }
        await noScroll(page);
      });

    test("the mats take the freed height: larger cards, the same proportions, no scroll", async ({
      page,
    }) => {
      await loadFixture(page, "hand-ten");
      const zone = await boxOf(page, "zone-P1-1");
      // The bot's row no longer takes half a card height above the mats.
      expect(zone.height).toBeGreaterThan(oldCardHeight(height) * 1.06);
      expect(zone.width / zone.height).toBeCloseTo(63 / 88, 1);
      const you = await boxOf(page, "mat-you");
      const opp = await boxOf(page, "mat-opp");
      // Both mats the same size, one above the other, the bot's starting right under the header.
      expect(Math.abs(you.width - opp.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(you.height - opp.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(you.x - opp.x)).toBeLessThanOrEqual(1);
      const header = await boxOf(page, "theme-header");
      expect(opp.y - (header.y + header.height)).toBeLessThan(24);
      // Your hand stays under your mat.
      const hand = await boxOf(page, "your-hand");
      expect(hand.y).toBeGreaterThan(you.y + you.height);
      await noScroll(page);
    });
  });

test.describe("Show opponent's hand", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("on: the row is face up, hovering it fans the cards out, a fanned card opens the preview, moving off closes it", async ({
    page,
  }) => {
    await loadFixture(page, "hand-ten", { showOpponentHand: true });
    const hand = page.getByTestId("opponent-hand");
    await expect(hand.getByTestId("opponent-card-back")).toHaveCount(0);
    await expect(hand.getByTestId("card")).toHaveCount(5);
    const fan = page.getByTestId("opponent-hand-fan");
    await expect(fan).toHaveCount(0);
    await hand.hover({ position: { x: 4, y: 4 } });
    await expect(fan.getByTestId("card")).toHaveCount(5);
    // Each fanned card is whole and readable: board-size cards side by side, none covered.
    const boxes = await fan
      .getByTestId("card")
      .evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
      );
    const zone = await boxOf(page, "zone-P1-1");
    boxes.forEach((b, i) => {
      expect(Math.abs(b.height - zone.height)).toBeLessThanOrEqual(1);
      const next = boxes[i + 1];
      if (next && next.y === b.y)
        expect(next.x).toBeGreaterThanOrEqual(b.x + b.width);
    });
    const card = fan.getByTestId("card").nth(2);
    await card.hover();
    await expect(page.getByTestId("card-preview")).toHaveAttribute(
      "data-card-id",
      (await card.getAttribute("data-card-id")) ?? "",
    );
    // Off the row and the fan: the fan closes.
    await page.getByTestId("zone-P1-3").hover();
    await expect(fan).toHaveCount(0);
  });

  test("off: the row stays face down and hovering it opens no fan", async ({
    page,
  }) => {
    await loadFixture(page, "hand-ten");
    const hand = page.getByTestId("opponent-hand");
    await expect(hand.getByTestId("opponent-card-back")).toHaveCount(5);
    await hand.hover({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(200);
    await expect(page.getByTestId("opponent-hand-fan")).toHaveCount(0);
    await expect(page.getByTestId("card-preview")).toHaveCount(0);
  });
});

for (const theme of ["showa", "dark", "grey", "light"] as const)
  test(`the count badge and the open fan meet AA in the ${theme} theme (axe)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t }),
      );
    }, theme);
    await loadFixture(page, "hand-five", { showOpponentHand: true });
    const hand = page.getByTestId("opponent-hand");
    await expect(hand).toHaveAttribute("data-mode", "count");
    await hand.hover({ position: { x: 4, y: 4 } });
    await expect(page.getByTestId("opponent-hand-fan")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[data-testid="opponent-hand"]')
      .withRules(["color-contrast"])
      .analyze();
    expect(
      results.violations.flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary ?? ""}`),
      ),
    ).toEqual([]);
  });

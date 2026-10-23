import { expect, type Page, test } from "@playwright/test";
import { passTurn, startGame } from "./helpers";

/**
 * The M5b fix (godzilla-sim formatting): every card is the full card image at one size derived
 * from the window, and the board never scrolls. Seed 1 in hotseat, both players only passing:
 * P1 holds 10 cards on turn 9.
 */
async function handOfTen(page: Page) {
  await page.goto("/play?mode=hotseat");
  await page.getByTestId("seed-input").fill("1");
  await startGame(page);
  for (let i = 0; i < 8; i++) {
    await passTurn(page);
  }
  await expect(page.getByTestId("board")).toHaveAttribute("data-bottom", "P1");
  await expect(page.getByTestId("your-hand-count")).toHaveText("10");
}

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

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
] as const)
  test.describe(`${width}x${height}`, () => {
    test.use({ viewport: { width, height } });

    test("a hand of 10: all 10 cards' left edges show, nothing clipped, no scrolling", async ({
      page,
    }) => {
      await handOfTen(page);
      const strip = await page.getByTestId("hand-strip").boundingBox();
      const cards = page.getByTestId("hand-card");
      await expect(cards).toHaveCount(10);
      const boxes: ({
        x: number;
        y: number;
        width: number;
        height: number;
      } | null)[] = [];
      for (let i = 0; i < 10; i++) boxes.push(await cards.nth(i).boundingBox());
      if (!strip) throw new Error("no strip");
      boxes.forEach((box, i) => {
        if (!box) throw new Error(`no box for card ${i}`);
        // Whole card inside the strip.
        expect(box.x).toBeGreaterThanOrEqual(strip.x);
        expect(box.x + box.width).toBeLessThanOrEqual(strip.x + strip.width);
        expect(box.y).toBeGreaterThanOrEqual(strip.y);
        expect(box.y + box.height).toBeLessThanOrEqual(strip.y + strip.height);
        // Its left edge shows: the next card starts to its right.
        const next = boxes[i + 1];
        if (next) expect(next.x).toBeGreaterThan(box.x + 8);
      });
      await noScroll(page);
    });

    test("every card is the full image of its card: one size on the board, a larger one in the hand (M5f)", async ({
      page,
    }) => {
      await handOfTen(page);
      // Put a battle card on the mat, next to the two monsters.
      const lit = page.locator(
        '[data-testid="hand-card"][data-hand-lit="true"]',
      );
      await lit.first().click();
      await page.locator('[data-lit][data-target^="zone:"]').first().click();
      await expect(page.getByTestId("your-hand-count")).toHaveText("9");
      await expect(page.getByTestId("counter-power-chip")).toHaveCount(1);
      await expect(page.getByTestId("threat-chip")).toHaveCount(2);

      const sizesOf = async (selector: string, expected: number) => {
        const cards = page.getByTestId("board").locator(selector);
        expect(await cards.count()).toBe(expected);
        const sizes: { width: number; height: number }[] = [];
        for (const card of await cards.all()) {
          const cardId = await card.getAttribute("data-card-id");
          await expect(card.locator("img")).toHaveAttribute(
            "src",
            `/cards/${cardId}-thumb.webp`,
          );
          const box = await card.boundingBox();
          if (!box) throw new Error("no box for a card");
          sizes.push(box);
        }
        const first = sizes[0];
        if (!first) throw new Error("no cards");
        for (const box of sizes) {
          expect(Math.abs(box.width - first.width)).toBeLessThanOrEqual(1);
          expect(Math.abs(box.height - first.height)).toBeLessThanOrEqual(1);
        }
        // The printed card's aspect, 63:88.
        expect(Math.abs(first.width - (first.height * 63) / 88)).toBeLessThan(
          1,
        );
        return first;
      };
      // 1 battle card and 2 monsters on the mats; 9 cards in the hand.
      const board = await sizesOf(
        '[data-testid="card"]:not([data-testid="opponent-hand"] *):not([data-testid="your-hand"] *)',
        3,
      );
      const hand = await sizesOf(
        '[data-testid="your-hand"] [data-testid="card"]',
        9,
      );
      expect(hand.height).toBeGreaterThan(board.height);
      // Mat cells are card-sized too.
      const z1 = await page.getByTestId("zone-P1-1").boundingBox();
      expect(Math.abs((z1?.width ?? 0) - board.width)).toBeLessThanOrEqual(1);
      expect(Math.abs((z1?.height ?? 0) - board.height)).toBeLessThanOrEqual(1);
      await noScroll(page);
    });

    test("M5d layout: prompt, phase and settings in the left column, the log in the right column, the hand centered under the mat", async ({
      page,
    }) => {
      await handOfTen(page);
      await expect(page.getByTestId("sidebar")).toHaveCount(0);
      const box = async (id: string) => {
        const b = await page.getByTestId(id).first().boundingBox();
        if (!b) throw new Error(`no ${id}`);
        return b;
      };
      const leftColumn = await box("left-column");
      const oppHand = await box("opponent-hand");
      const mat = await box("mat-you");
      const log = await box("log-panel");
      const right = await box("right-column");
      // The left column holds the prompt, the phase tracker and settings, left of the board.
      expect(leftColumn.x).toBeLessThanOrEqual(1);
      expect(leftColumn.height).toBeGreaterThan(height * 0.95);
      for (const id of ["prompt", "phase-tracker", "settings"]) {
        const b = await box(id);
        expect(b.x).toBeGreaterThanOrEqual(leftColumn.x);
        expect(b.x + b.width).toBeLessThanOrEqual(
          leftColumn.x + leftColumn.width + 1,
        );
      }
      expect(oppHand.x).toBeGreaterThanOrEqual(leftColumn.x + leftColumn.width);
      expect(mat.x).toBeGreaterThanOrEqual(leftColumn.x + leftColumn.width);
      // The log fills the right column, right of the mats.
      expect(log.x).toBeGreaterThanOrEqual(mat.x + mat.width);
      expect(log.x).toBeGreaterThanOrEqual(right.x);
      expect(log.height).toBeGreaterThan(height * 0.8);
      // The hand's cards are centered under the mat's columns.
      const cards = page.getByTestId("hand-card");
      const first = await cards.first().boundingBox();
      const last = await cards.last().boundingBox();
      if (!first || !last) throw new Error("no hand");
      // The mat's grid is centered in its element, and so are the hand's cards.
      const handCenter = (first.x + last.x + last.width) / 2;
      expect(
        Math.abs(handCenter - (mat.x + mat.width / 2)),
      ).toBeLessThanOrEqual(2);
      const left = await box("monster-deck-P1");
      const discard = await box("discard-P1");
      expect(
        Math.abs(handCenter - (left.x + discard.x + discard.width) / 2),
      ).toBeLessThanOrEqual(2);
      // The board uses the height: the hand strip ends near the bottom, without scrolling.
      const strip = await box("hand-strip");
      expect(strip.y + strip.height).toBeGreaterThan(height - 40);
      await noScroll(page);
      // The card preview covers the log while a card is previewed.
      await cards.first().hover();
      const preview = await box("card-preview");
      expect(preview.x).toBeGreaterThanOrEqual(right.x);
      expect(preview.x + preview.width).toBeLessThanOrEqual(
        right.x + right.width + 1,
      );
    });

    test("the playmat's arrows sit in the gaps, clear of every card and chip", async ({
      page,
    }) => {
      await handOfTen(page);
      // Path 1 to 8 (7 arrows) and counter moves 8 to 3, 7 to 4, 6 to 5, on both mats.
      await expect(page.getByTestId("path-arrow")).toHaveCount(14);
      await expect(page.getByTestId("counter-arrow")).toHaveCount(6);
      const cards = page.locator(
        '[data-testid^="mat-"] [data-testid="card"], [data-testid^="mat-"] [data-testid="pile-back"]',
      );
      const boxes: ({
        x: number;
        y: number;
        width: number;
        height: number;
      } | null)[] = [];
      for (let i = 0; i < (await cards.count()); i++)
        boxes.push(await cards.nth(i).boundingBox());
      expect(boxes.length).toBeGreaterThan(4);
      const arrows = page.locator(
        '[data-testid="path-arrow"], [data-testid="counter-arrow"]',
      );
      for (let i = 0; i < (await arrows.count()); i++) {
        const point = await arrows.nth(i).boundingBox();
        if (!point) throw new Error(`no arrow ${i}`);
        // The chevron reaches about 4 px around its point.
        for (const box of boxes) {
          if (!box) continue;
          const inside =
            point.x > box.x - 4 &&
            point.x < box.x + box.width + 4 &&
            point.y > box.y - 4 &&
            point.y < box.y + box.height + 4;
          expect(inside).toBe(false);
        }
      }
    });
  });

import { expect, type Page, test } from "@playwright/test";

/**
 * The M5b fix (godzilla-sim formatting): every card is the full card image at one size derived
 * from the window, and the board never scrolls. Seed 1 in hotseat, both players only passing:
 * P1 holds 10 cards on turn 9.
 */
async function handOfTen(page: Page) {
  await page.goto("/play?mode=hotseat");
  await page.getByTestId("seed-input").fill("1");
  await page.getByTestId("start-game").click();
  for (let i = 0; i < 8; i++) {
    const turn = Number(await page.getByTestId("turn").textContent());
    await page.getByTestId("pass").click();
    await expect(page.getByTestId("turn")).toHaveText(String(turn + 1));
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

    test("every card on the board is the full image of its card, all at one size", async ({
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

      const cards = page
        .getByTestId("board")
        .locator('[data-testid="card"]:not([data-testid="opponent-hand"] *)');
      const n = await cards.count();
      expect(n).toBe(12); // 9 in hand, 1 battle card, 2 monsters.
      const sizes: { width: number; height: number }[] = [];
      for (let i = 0; i < n; i++) {
        const card = cards.nth(i);
        const cardId = await card.getAttribute("data-card-id");
        await expect(card.locator("img")).toHaveAttribute(
          "src",
          `/cards/${cardId}-thumb.webp`,
        );
        const box = await card.boundingBox();
        if (!box) throw new Error(`no box for card ${i}`);
        sizes.push(box);
      }
      const first = sizes[0];
      if (!first) throw new Error("no cards");
      for (const box of sizes) {
        expect(Math.abs(box.width - first.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.height - first.height)).toBeLessThanOrEqual(1);
      }
      // The printed card's aspect, 63:88.
      expect(Math.abs(first.width - (first.height * 63) / 88)).toBeLessThan(1);
      // Mat cells are card-sized too.
      const z1 = await page.getByTestId("zone-P1-1").boundingBox();
      expect(Math.abs((z1?.width ?? 0) - first.width)).toBeLessThanOrEqual(1);
      expect(Math.abs((z1?.height ?? 0) - first.height)).toBeLessThanOrEqual(1);
      await noScroll(page);
    });
  });

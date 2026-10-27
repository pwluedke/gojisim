import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { loadFixture, visibleCenter } from "./helpers";

/**
 * Your hand at the window's bottom edge (Paul): only the top 40 % of each card shows; cards overlap
 * like a held hand, each covering about a quarter of the one to its left, more as the hand grows,
 * and the row never scrolls. Hovering, focus or a selection raises a card whole, 1.5 times the
 * board card size, with no layout shift. Card backs have a white border in every theme.
 */

const THEMES = ["showa", "dark", "grey", "light"] as const;
const PEEK = 0.4;
const STEP = 0.75;

type Box = { x: number; y: number; width: number; height: number };

async function settings(page: Page, theme = "showa") {
  await page.addInitScript((theme) => {
    localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "off", theme }),
    );
  }, theme);
}

const cards = (page: Page) => page.getByTestId("hand-card");
const boxes = async (locators: Locator[]) =>
  Promise.all(
    locators.map(async (l) => {
      const b = await l.boundingBox();
      if (!b) throw new Error("no box");
      return b;
    }),
  );
/** The lifted card's box: the card itself, wherever it is raised to. */
const lifted = async (card: Locator) => {
  const b = await card.getByTestId("hand-lift").boundingBox();
  if (!b) throw new Error("no lifted box");
  return b;
};
const boardCardHeight = async (page: Page) =>
  (await page.getByTestId("deck-P1").getByTestId("pile-back").boundingBox())
    ?.height ?? 0;

async function noScroll(page: Page) {
  expect(
    await page.evaluate(() => ({
      y: document.documentElement.scrollHeight <= window.innerHeight,
      x: document.documentElement.scrollWidth <= window.innerWidth,
    })),
  ).toEqual({ y: true, x: true });
}

/** A raised card is whole, inside the window, about 1.5 times the board card, and on top. */
async function expectRaised(
  page: Page,
  card: Locator,
  { hit = true }: { hit?: boolean } = {},
) {
  const view = page.viewportSize();
  if (!view) throw new Error("no viewport");
  const board = await boardCardHeight(page);
  await expect
    .poll(async () => (await lifted(card)).height, { timeout: 2000 })
    .toBeCloseTo(board * 1.5, 0);
  const box = await lifted(card);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height + 1);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width);
  // A selected card lets clicks through to the zones, so only a hovered or focused one is hit.
  if (!hit) return;
  // Above the board and the other hand cards: its center hits it.
  const found = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x as number, y as number)
        ?.closest('[data-testid="hand-card"]')
        ?.getAttribute("data-instance-id") ??
      document
        .elementFromPoint(x as number, y as number)
        ?.closest("[data-instance-id]")
        ?.getAttribute("data-instance-id"),
    [box.x + box.width / 2, box.y + box.height / 4],
  );
  expect(found).toBe(
    await card
      .locator("[data-instance-id]")
      .first()
      .getAttribute("data-instance-id"),
  );
}

for (const [fixture, count] of [
  ["hand-count-five", 5],
  ["hand-ten", 10],
  ["hand-fifteen", 15],
] as const)
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ] as const)
    test(`${count} cards at ${width}x${height}: the top 40 % shows, each covers a quarter or more of the one to its left, nothing scrolls`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await settings(page);
      await loadFixture(page, fixture);
      await expect(cards(page)).toHaveCount(count);
      await expect(page.getByTestId("your-hand-count")).toHaveText(
        String(count),
      );
      const all = await boxes(await cards(page).all());
      const board = await boardCardHeight(page);
      const hand = (await page.getByTestId("your-hand").boundingBox()) as Box;
      const mat = (await page.getByTestId("mat-you").boundingBox()) as Box;
      for (const b of all) {
        // Board card size, and the top 40 % above the window's bottom edge.
        expect(b.height).toBeCloseTo(board, 0);
        expect(height - b.y).toBeCloseTo(b.height * PEEK, 0);
      }
      // The row never reaches into the mat.
      expect(hand.y).toBeGreaterThanOrEqual(mat.y + mat.height);
      const steps = all.slice(1).map((b, i) => b.x - (all[i] as Box).x);
      const w = (all[0] as Box).width;
      for (const step of steps) {
        // Each card covers at least a quarter of its neighbor; the steps are even.
        expect(step).toBeLessThanOrEqual(w * STEP + 0.5);
        expect(step).toBeGreaterThan(0);
        expect(Math.abs(step - (steps[0] as number))).toBeLessThan(1);
      }
      // The whole row is within the hand: the last card's right edge too.
      const last = all[all.length - 1] as Box;
      expect(last.x + last.width).toBeLessThanOrEqual(hand.x + hand.width + 1);
      expect((all[0] as Box).x).toBeGreaterThanOrEqual(hand.x - 1);
      await noScroll(page);
      if (process.env["HAND_SHOTS"] && width === 1440)
        await page.screenshot({
          path: `${process.env["HAND_SHOTS"]}/hand-${count}-rest.png`,
        });
    });

test.describe("raising a card", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("hover raises a card whole and on top, with no layout shift; moving off lowers it", async ({
    page,
  }) => {
    await settings(page);
    await loadFixture(page, "hand-ten");
    const all = await cards(page).all();
    const before = await boxes(all);
    const mat = await page.getByTestId("mat-you").boundingBox();
    // The first, a middle and the last card: the end cards stay inside the window too.
    for (const i of [0, 4, all.length - 1]) {
      const card = all[i] as Locator;
      const point = await visibleCenter(page, card);
      // The part of the card the next one doesn't cover.
      await page.mouse.move(
        (before[i] as Box).x + (before[i] as Box).width * 0.2,
        point.y,
      );
      await expectRaised(page, card);
      // Nothing moved: every hand card's place and the mat stay put.
      expect(await boxes(all)).toEqual(before);
      expect(await page.getByTestId("mat-you").boundingBox()).toEqual(mat);
      await noScroll(page);
      if (process.env["HAND_SHOTS"] && i === 4)
        await page.screenshot({
          path: `${process.env["HAND_SHOTS"]}/hand-raised.png`,
        });
    }
    await page.mouse.move(700, 300);
    await expect
      .poll(async () => (await lifted(all[4] as Locator)).height)
      .toBeCloseTo((before[4] as Box).height, 0);
  });

  test("a raised card never takes a neighbor's strip: pointing at the next card raises that card", async ({
    page,
  }) => {
    await settings(page);
    await loadFixture(page, "hand-ten");
    const all = await cards(page).all();
    const rest = await boxes(all);
    for (const i of [2, 5]) {
      const box = rest[i] as Box;
      const next = rest[i + 1] as Box;
      await page.mouse.move(box.x + box.width * 0.2, 890);
      await expectRaised(page, all[i] as Locator);
      // The left part of the next card's strip, which the raised card covers, then its center.
      for (const x of [next.x + 2, next.x + next.width / 2]) {
        await page.mouse.move(x, 885);
        await expectRaised(page, all[i + 1] as Locator);
      }
    }
    // A click on the next card's visible center lands on it (CI found this).
    await page.mouse.move(rest[3]!.x + 5, 890);
    await all[4]!.click();
    await expect(all[4]!).toHaveAttribute("data-selected", "true");
  });

  test("keyboard focus raises a card the same way", async ({ page }) => {
    await settings(page);
    await loadFixture(page, "hand-ten");
    await page.mouse.move(700, 300);
    const card = cards(page).nth(3);
    await card.focus();
    await page.keyboard.press("Shift");
    await expectRaised(page, card);
  });

  test("a selected card stays raised until Esc, and its destinations under it still take a click", async ({
    page,
  }) => {
    await settings(page);
    // hand-five: P1 has every hand action, so a card is lit.
    await loadFixture(page, "hand-five");
    const card = page
      .locator('[data-testid="hand-card"][data-hand-lit="true"]')
      .first();
    await card.click({
      position: {
        x: 10,
        y: 10,
      },
    });
    await expect(card).toHaveAttribute("data-selected", "true");
    // Off the card: it stays raised while selected.
    await page.mouse.move(700, 120);
    await expectRaised(page, card, { hit: false });
    await page.keyboard.press("Escape");
    await expect(card).not.toHaveAttribute("data-selected", "true");
    await expect
      .poll(async () => (await lifted(card)).height)
      .toBeLessThan((await boardCardHeight(page)) * 1.1);
    // Select again and click a lit zone, even one the raised card covers: the play goes through.
    await card.click({ position: { x: 10, y: 10 } });
    const cardId = await card.getByTestId("card").getAttribute("data-card-id");
    const zone = page.locator('[data-lit][data-target^="zone:"]').first();
    const target = await zone.getAttribute("data-target");
    await zone.click({ force: true });
    await expect(
      page
        .getByTestId(`zone-P1-${target?.slice(5)}`)
        .locator(`[data-card-id="${cardId}"]`),
    ).toHaveCount(1);
  });

  test("a drag starts from the raised card and plays it", async ({ page }) => {
    await settings(page);
    // hand-five: P1 has every hand action, so a card is lit.
    await loadFixture(page, "hand-five");
    const card = page
      .locator('[data-testid="hand-card"][data-hand-lit="true"]')
      .first();
    const cardId = await card.getByTestId("card").getAttribute("data-card-id");
    // Find a lit zone for it, then let go.
    await card.click({ position: { x: 10, y: 10 } });
    const target = await page
      .locator('[data-lit][data-target^="zone:"]')
      .first()
      .getAttribute("data-target");
    await page.keyboard.press("Escape");
    const zone = page.getByTestId(`zone-P1-${target?.slice(5)}`);
    const rest = (await card.boundingBox()) as Box;
    await page.mouse.move(rest.x + 10, 890);
    await expectRaised(page, card);
    // Grab the raised card high up, well above the row.
    const up = await lifted(card);
    await page.mouse.move(up.x + up.width / 2, up.y + up.height / 3);
    await page.mouse.down();
    await page.mouse.move(up.x + up.width / 2 + 20, up.y + up.height / 3 - 20, {
      steps: 4,
    });
    const to = await visibleCenter(page, zone);
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await expect(zone.locator(`[data-card-id="${cardId}"]`)).toHaveCount(1);
  });

  test("the card preview and the expanded hand (H) still work", async ({
    page,
  }) => {
    await settings(page);
    await loadFixture(page, "hand-ten");
    const card = cards(page).nth(2);
    const box = (await card.boundingBox()) as Box;
    await page.mouse.move(box.x + 10, 890);
    await expect(page.getByTestId("card-preview")).toBeVisible();
    await page.mouse.move(700, 300);
    await page.keyboard.press("h");
    await expect(page.getByTestId("expanded-hand")).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test.describe("card backs", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const theme of THEMES)
    test(`a white border on every back, 3 % of its width, in ${theme}`, async ({
      page,
    }) => {
      await settings(page, theme);
      await loadFixture(page, "hand-ten");
      for (const id of ["pile-back", "opponent-card-back"]) {
        const back = page.getByTestId(id).first();
        await expect(back).toBeVisible();
        const style = await back.evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            width: el.getBoundingClientRect().width,
            border: parseFloat(s.borderTopWidth),
            sides: [
              s.borderTopColor,
              s.borderRightColor,
              s.borderBottomColor,
              s.borderLeftColor,
            ],
            widths: [
              s.borderTopWidth,
              s.borderRightWidth,
              s.borderBottomWidth,
              s.borderLeftWidth,
            ],
            outline: s.outlineStyle,
          };
        });
        expect(style.sides).toEqual(Array(4).fill("rgb(255, 255, 255)"));
        expect(new Set(style.widths).size).toBe(1);
        expect(style.border / style.width).toBeGreaterThan(0.02);
        expect(style.border / style.width).toBeLessThan(0.045);
        // An outline outside the white keeps it visible on a light page.
        expect(style.outline).toBe("solid");
      }
      // axe, with a card raised.
      const card = cards(page).nth(2);
      const box = (await card.boundingBox()) as Box;
      await page.mouse.move(box.x + 10, 890);
      const results = await new AxeBuilder({ page })
        .include('[data-testid="board"]')
        .withRules(["color-contrast"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
});

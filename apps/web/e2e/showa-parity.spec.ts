import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

/**
 * #108: Showa Poster lays out /play's board like the other themes. Its header bar, fight card,
 * colors and look stay; its controls, line height and the Illegal deck badge take the other
 * themes' sizes (amends decision 453). Boxes are measured from the board's top-left, since
 * Showa's 56 px header bar sits above the board.
 */

type Box = { x: number; y: number; width: number; height: number };

/** The hand-five game, with P2's deck flagged illegal so its badge shows, Settings open. */
async function open(page: Page, theme: string) {
  await page.addInitScript((t) => {
    window.localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "off", theme: t }),
    );
  }, theme);
  await loadFixture(page, "hand-five", {
    deckLegality: [
      { player: "P1", legal: true, failedRules: [], asOf: "2026-10-29" },
      {
        player: "P2",
        legal: false,
        failedRules: [
          "Main deck: 47 cards, needs exactly 50",
          "Gravity Beam (EBP01-079): banned since Sep 1, 2026",
        ],
        asOf: "2026-10-29",
      },
    ],
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await page.getByTestId("settings").click();
}

async function box(page: Page, id: string): Promise<Box> {
  const b = await page.getByTestId(id).first().boundingBox();
  if (!b) throw new Error(`no box for ${id}`);
  return b;
}

/** Boxes from the board's top-left. */
async function measure(page: Page, ids: readonly string[]) {
  const board = await box(page, "board");
  const out: Record<string, Box> = {};
  for (const id of ids) {
    const b = await box(page, id);
    out[id] = { ...b, x: b.x - board.x, y: b.y - board.y };
  }
  return { board, boxes: out };
}

const LEFT = ["prompt", "settings", "mat-settings", "test-site"] as const;

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
] as const)
  test(`Showa's left column, Test Site, battle log and badge match Grey's at ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const ids = [...LEFT, "battle-log", "mat-opp", "deck-warning-P2"];
    await open(page, "grey");
    const grey = await measure(page, ids);
    await open(page, "showa");
    const showa = await measure(page, ids);
    const near = (id: string, key: keyof Box, by: number) =>
      expect(
        Math.abs((showa.boxes[id]?.[key] ?? 0) - (grey.boxes[id]?.[key] ?? 0)),
        `${id} ${key}: showa ${showa.boxes[id]?.[key]}, grey ${grey.boxes[id]?.[key]}`,
      ).toBeLessThanOrEqual(by);
    // Showa may not sit lower or grow taller than Grey by more than a few pixels. It may be
    // shorter: Grey's system-ui is another font on each platform (taller lines on CI's Linux
    // than on a Mac), while Showa's fonts are bundled.
    const notPast = (id: string, key: "y" | "height", by: number) =>
      expect(
        (showa.boxes[id]?.[key] ?? 0) - (grey.boxes[id]?.[key] ?? 0),
        `${id} ${key}: showa ${showa.boxes[id]?.[key]}, grey ${grey.boxes[id]?.[key]}`,
      ).toBeLessThanOrEqual(by);
    for (const id of LEFT) {
      near(id, "x", 4);
      near(id, "width", 4);
      notPast(id, "y", 12);
      notPast(id, "height", 12);
    }
    // The Test Site panel is on screen in both.
    for (const m of [grey, showa]) {
      const site = m.boxes["test-site"] as Box;
      expect(site.y + m.board.y + site.height).toBeLessThanOrEqual(height);
    }
    // The battle log keeps its column and reaches the same bottom (the fight card above it stays
    // Showa's own size).
    near("battle-log", "x", 4);
    near("battle-log", "width", 6);
    const bottom = (m: typeof grey) =>
      (m.boxes["battle-log"] as Box).y +
      (m.boxes["battle-log"] as Box).height -
      m.board.height;
    expect(Math.abs(bottom(showa) - bottom(grey))).toBeLessThanOrEqual(6);
  });

test("in every theme the Illegal deck badge fits inside its mat, and the left column's panels don't overflow", async ({
  page,
}) => {
  for (const theme of ["showa", "dark", "grey", "light"]) {
    await open(page, theme);
    const mat = await box(page, "mat-opp");
    const badge = await box(page, "deck-warning-P2");
    expect(badge.y + badge.height, theme).toBeLessThanOrEqual(
      mat.y + mat.height,
    );
    expect(badge.x + badge.width, theme).toBeLessThanOrEqual(mat.x + mat.width);
    await expect(
      page.getByTestId("deck-warning-P2").getByTestId("deck-warning-count"),
    ).toHaveText("2 reasons");
    // Nothing in the left column sticks out past its panel.
    const column = await box(page, "prompt");
    for (const id of LEFT) {
      const b = await box(page, id);
      expect(b.x + b.width, `${theme} ${id}`).toBeLessThanOrEqual(
        column.x + column.width + 1,
      );
      const overflow = await page
        .getByTestId(id)
        .first()
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `${theme} ${id}`).toBeLessThanOrEqual(0);
    }
  }
});

test("Showa's board with Settings open meets WCAG AA contrast (axe)", async ({
  page,
}) => {
  await open(page, "showa");
  const results = await new AxeBuilder({ page })
    .include('[data-testid="board"]')
    .withRules(["color-contrast"])
    .analyze();
  expect(
    results.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" "))),
  ).toEqual([]);
});

import { expect, type Locator, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

/**
 * #292 (Paul, Nov 13): the Rage zone shows rage and threat only; each player's counter power sits
 * unboxed, centered above and between zones 7 and 6, with an arrow across the center line to the
 * opponent's Rage zone; the turn player's number and arrow glow. Zone 8 sits just above zone 7, and
 * Strategy 1, the Rage zone and zone 8 line up at their top edges, Strategy 2 right under Strategy 1.
 */

const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error("no box");
  return b;
};

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width - 1 &&
  b.x < a.x + a.width - 1 &&
  a.y < b.y + b.height - 1 &&
  b.y < a.y + a.height - 1;

/** Your turn (P1), a zone choice open: P1's counter power 17000, P2's 37000. */
const yourTurn = (page: Page) => loadFixture(page, "multi-destroy");

test("the Rage zone shows rage and threat only; each counter power shows the total", async ({
  page,
}) => {
  await yourTurn(page);
  for (const id of ["P1", "P2"]) {
    const rage = page.getByTestId(`rage-zone-${id}`);
    await expect(rage.getByTestId(`rage-${id}`)).toBeVisible();
    await expect(rage.getByTestId(`threat-${id}`)).toBeVisible();
    await expect(rage).not.toContainText("Counter power");
    await expect(page.getByTestId(`counter-bar-${id}`)).toHaveCount(0);
  }
  // The number sits in its own player's mat.
  await expect(
    page.getByTestId("mat-you").getByTestId("counter-power-P1"),
  ).toHaveText("17000");
  await expect(
    page.getByTestId("mat-opp").getByTestId("counter-power-P2"),
  ).toHaveText("37000");
});

test("the turn player's number and arrow glow; the other's are dim, and it follows the turn", async ({
  page,
}) => {
  await yourTurn(page);
  await expect(page.getByTestId("counter-badge-P1")).toHaveAttribute(
    "data-turn",
    "true",
  );
  await expect(page.getByTestId("counter-arrow-P1")).toHaveAttribute(
    "data-turn",
    "true",
  );
  await expect(page.getByTestId("counter-badge-P2")).toHaveAttribute(
    "data-turn",
    "false",
  );
  await expect(page.getByTestId("counter-arrow-P2")).toHaveAttribute(
    "data-turn",
    "false",
  );
  // The bot's turn: P2's lights, P1's dims.
  await loadFixture(page, "discard-bot-turn");
  await expect(page.getByTestId("counter-badge-P2")).toHaveAttribute(
    "data-turn",
    "true",
  );
  await expect(page.getByTestId("counter-arrow-P2")).toHaveAttribute(
    "data-turn",
    "true",
  );
  await expect(page.getByTestId("counter-badge-P1")).toHaveAttribute(
    "data-turn",
    "false",
  );
});

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`at ${width}: each arrow runs from its number across the center line to the opponent's Rage zone, and nothing covers a card, the numbers or the zone prompt`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await yourTurn(page);
    const youRage = await box(page.getByTestId("rage-zone-P1"));
    const oppRage = await box(page.getByTestId("rage-zone-P2"));
    for (const [id, rage] of [
      ["P1", oppRage],
      ["P2", youRage],
    ] as const) {
      const badge = await box(page.getByTestId(`counter-group-${id}`));
      const arrow = await box(page.getByTestId(`counter-arrow-${id}`));
      // The arrow is vertical, inside the number's width and the Rage zone's width.
      const x = arrow.x + arrow.width / 2;
      expect(x).toBeGreaterThan(badge.x);
      expect(x).toBeLessThan(badge.x + badge.width);
      expect(x).toBeGreaterThan(rage.x);
      expect(x).toBeLessThan(rage.x + rage.width);
      // It spans the gap between the number and the Rage zone, and only that gap.
      const top = Math.min(badge.y, rage.y + rage.height);
      const bottom = Math.max(badge.y + badge.height, rage.y);
      expect(arrow.y).toBeGreaterThanOrEqual(top - 6);
      expect(arrow.y + arrow.height).toBeLessThanOrEqual(bottom + 6);
      // Nothing covers the number.
      const n = await box(page.getByTestId(`counter-power-${id}`));
      const hit = await page.evaluate(
        ([px, py]) =>
          document
            .elementFromPoint(px as number, py as number)
            ?.closest("[data-testid^='counter-badge-']")
            ?.getAttribute("data-testid") ?? null,
        [n.x + n.width / 2, n.y + n.height / 2],
      );
      expect(hit).toBe(`counter-badge-${id}`);
      // No card on the board sits under the number or the arrow.
      for (const card of await page
        .locator("[data-testid^='mat-'] [data-instance-id]")
        .all()) {
        const c = await card.boundingBox();
        if (!c) continue;
        expect(overlaps(c, badge)).toBe(false);
        expect(overlaps(c, { ...arrow, x: x - 3, width: 6 })).toBe(false);
      }
      // The zone prompt stays clear of the numbers.
      const prompt = await box(page.getByTestId("beside-prompt"));
      expect(overlaps(prompt, badge)).toBe(false);
    }
  });
}

test("zone 8 sits just above zone 7 (staggered, not a full row up), mirrored on the opponent's mat", async ({
  page,
}) => {
  await yourTurn(page);
  for (const [id, side] of [
    ["P1", "you"],
    ["P2", "opp"],
  ] as const) {
    const z8 = await box(page.getByTestId(`zone-${id}-8`));
    const z7 = await box(page.getByTestId(`zone-${id}-7`));
    // Toward the center line by under half a card, so it overlaps zone 7's row.
    const lift = side === "you" ? z7.y - z8.y : z8.y - z7.y;
    expect(lift).toBeGreaterThan(0);
    expect(lift).toBeLessThan(z7.height / 2);
  }
});

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`at ${width}: Strategy 1, the Rage zone and zone 8 share their top edge; Strategy 2 sits right under Strategy 1; the counter power is centered above zones 7 and 6 (mirrored on the opponent's mat)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await yourTurn(page);
    for (const [id, side] of [
      ["P1", "you"],
      ["P2", "opp"],
    ] as const) {
      const mat = page.getByTestId(`mat-${side}`);
      const s1 = await box(page.getByTestId(`strategy-${id}-1`));
      const s2 = await box(page.getByTestId(`strategy-${id}-2`));
      const rage = await box(page.getByTestId(`rage-zone-${id}`));
      const z8 = await box(page.getByTestId(`zone-${id}-8`));
      const z7 = await box(page.getByTestId(`zone-${id}-7`));
      const z6 = await box(page.getByTestId(`zone-${id}-6`));
      const deck = await box(mat.getByTestId(`monster-deck-${id}`));
      const n = await box(page.getByTestId(`counter-power-${id}`));
      // "Top" is the edge nearest the center line: the bottom edge on the opponent's turned mat.
      const near = (b: { y: number; height: number }) =>
        side === "you" ? b.y : b.y + b.height;
      expect(Math.abs(near(s1) - near(z8))).toBeLessThan(2);
      expect(Math.abs(near(rage) - near(z8))).toBeLessThan(2);
      // Strategy 2 right after Strategy 1 (a small gap), clear of the monster deck.
      const gap =
        side === "you" ? s2.y - (s1.y + s1.height) : s1.y - (s2.y + s2.height);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThan(12);
      expect(overlaps(s2, deck)).toBe(false);
      // The number: centered between zones 7 and 6, between them and the center line.
      const between =
        (Math.min(z7.x, z6.x) + Math.max(z7.x + z7.width, z6.x + z6.width)) / 2;
      expect(Math.abs(n.x + n.width / 2 - between)).toBeLessThan(4);
      if (side === "you") expect(n.y + n.height).toBeLessThanOrEqual(z7.y + 1);
      else expect(n.y).toBeGreaterThanOrEqual(z7.y + z7.height - 1);
    }
  });
}

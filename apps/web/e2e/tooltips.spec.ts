import { expect, type Page, test } from "@playwright/test";
import { vsBot } from "./helpers";

/**
 * The app's tooltip (M5h): only as tall as its text (Paul, Oct 25, 2026: it used to run to the
 * window's bottom edge), and always inside the window, flipping above its element near the bottom.
 */

test.use({ viewport: { width: 1440, height: 900 } });

async function tipBox(page: Page) {
  const tip = page.getByTestId("tooltip");
  await expect(tip).toBeVisible();
  // Placed once measured (the old tip had no measuring step: settle a frame either way).
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => r(null))),
  );
  const box = await tip.boundingBox();
  if (!box) throw new Error("no tooltip box");
  return box;
}

const inside = async (page: Page) => {
  const box = await tipBox(page);
  const { innerHeight, innerWidth } = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(innerHeight);
  expect(box.x + box.width).toBeLessThanOrEqual(innerWidth);
  return box;
};

for (const theme of ["showa", "dark", "grey", "light"] as const)
  test(`tooltips on a phase step, a log rule number and a pile end where their text ends (${theme})`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t, showRules: true }),
      );
    }, theme);
    await vsBot(page, 2);
    // A one-line phase step tip.
    await page.getByTestId("tracker-step-7.2.2").hover();
    expect((await inside(page)).height).toBeLessThan(200);
    // A rule number in the battle log: a longer, wrapped tip.
    await page.getByTestId("rule-link").first().hover();
    expect((await inside(page)).height).toBeLessThan(200);
    // A pile's "click to view" tip.
    await page.mouse.move(0, 0);
    await page.getByTestId("discard-P1").hover({ position: { x: 4, y: 4 } });
    expect((await inside(page)).height).toBeLessThan(200);
  });

test("a tooltip near the window's bottom flips above its element and stays on screen", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "off", showRules: true }),
    );
  });
  await page.setViewportSize({ width: 1440, height: 700 });
  await vsBot(page, 2);
  // The lowest phase tracker step sits near the bottom of a short window.
  const steps = page.locator('[data-testid^="tracker-step-"]');
  const last = steps.last();
  await last.scrollIntoViewIfNeeded();
  const anchor = await last.boundingBox();
  if (!anchor) throw new Error("no step");
  // Make room below impossible: hover it with the window cut just under it.
  await page.setViewportSize({
    width: 1440,
    height: Math.ceil(anchor.y + anchor.height + 20),
  });
  await last.hover();
  const box = await inside(page);
  await expect(page.getByTestId("tooltip")).toHaveAttribute(
    "data-placement",
    "above",
  );
  expect(box.y + box.height).toBeLessThanOrEqual(anchor.y + 1);
  expect(box.height).toBeLessThan(200);
});

import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { fixture, loadFixture, vsBot } from "./helpers";

/** M5h-3: the fight-card header, board numbers in selection modals, the invasion-win slam. */

test.use({ viewport: { width: 1440, height: 900 } });

async function noScroll(page: Page) {
  expect(
    await page.evaluate(() => ({
      y: document.documentElement.scrollHeight <= window.innerHeight,
      x: document.documentElement.scrollWidth <= window.innerWidth,
    })),
  ).toEqual({ y: true, x: true });
}

test("#18 the fight card names your deck, VS, then the bot's deck in the bundled fonts; it collapses with the log", async ({
  page,
}) => {
  await vsBot(page, 2);
  const card = page.getByTestId("fight-card");
  await expect(page.getByTestId("fight-deck-you")).toHaveText("ESD01 official");
  await expect(page.getByTestId("fight-vs")).toHaveText("VS");
  await expect(page.getByTestId("fight-deck-opp")).toHaveText("ESD02 official");
  await expect(page.getByTestId("fight-bot-opp")).toHaveText("Bot (Medium)");
  await expect(page.getByTestId("fight-bot-you")).toHaveCount(0);
  // Above the battle log, in its column.
  const [header, log] = [
    await card.boundingBox(),
    await page.getByTestId("log-panel").boundingBox(),
  ];
  expect((header?.y ?? 0) + (header?.height ?? 0)).toBeLessThanOrEqual(
    (log?.y ?? 0) + 1,
  );
  // The bundled fonts load, and the names and "VS" use them.
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return [
        document.fonts.check("30px Anton"),
        document.fonts.check("40px Bungee"),
      ];
    }),
  ).toEqual([true, true]);
  const font = (id: string) =>
    page.getByTestId(id).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(await font("fight-deck-you")).toMatch(/^Anton/);
  expect(await font("fight-vs")).toMatch(/^Bungee/);
  expect(
    await page
      .getByTestId("fight-vs")
      .evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe("none");
  await noScroll(page);
  await page.keyboard.press("l");
  await expect(card).toHaveCount(0);
  await page.keyboard.press("l");
  await expect(card).toBeVisible();
});

test("#18 a long deck name shrinks, then is cut with its full name in the tooltip; a record without names reads Mystery Deck", async ({
  page,
}) => {
  const name = "A".repeat(59) + " very long deck name that goes on and on.";
  const list = readFileSync(
    new URL(
      "../../../packages/cards/data/decks/esd01-starter.txt",
      import.meta.url,
    ),
    "utf8",
  );
  await page.goto("/play");
  await page.getByTestId("import-deck").click();
  await page.getByTestId("import-text").fill(list);
  await page.getByTestId("import-name").fill(name);
  await page.getByTestId("import-save").click();
  await page.getByTestId("start-game").click();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  const you = page.getByTestId("fight-deck-you");
  await expect(you).toHaveText(name);
  await expect(you).toHaveAttribute("data-cut", "true");
  expect(
    Number.parseFloat(
      await you.evaluate((el) => getComputedStyle(el).fontSize),
    ),
  ).toBe(16);
  // The short name keeps the full size and no tooltip.
  const opp = page.getByTestId("fight-deck-opp");
  expect(
    Number.parseFloat(
      await opp.evaluate((el) => getComputedStyle(el).fontSize),
    ),
  ).toBe(30);
  await expect(opp).not.toHaveAttribute("data-cut", "true");
  await you.hover();
  await expect(page.getByTestId("tooltip")).toHaveText(name);
  await noScroll(page);

  await loadFixture(page, "hand-five");
  await expect(page.getByTestId("fight-deck-you")).toHaveText("Mystery Deck");
  await expect(page.getByTestId("fight-deck-opp")).toHaveText("Mystery Deck");
});

test("#18 the fight card fits without scrolling at 1920×1080", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await vsBot(page, 2);
  await expect(page.getByTestId("fight-card")).toBeVisible();
  await noScroll(page);
});

for (const theme of ["dark", "grey", "light"] as const)
  test(`#18 the fight card's names pass axe color-contrast in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t }),
      );
    }, theme);
    await vsBot(page, 2);
    const results = await new AxeBuilder({ page })
      .include('[data-testid="fight-card"]')
      .exclude('[data-testid="fight-vs"]')
      .withRules(["color-contrast"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

test("#19 a destroy modal shows a boosted card's modified counter power, matching the board", async ({
  page,
}) => {
  await loadFixture(page, "destroy-boosted");
  const modal = page.getByTestId("choice-modal");
  await expect(modal).toHaveAttribute("data-kind", "target");
  const boosted = modal
    .getByTestId("choice-option")
    .filter({ has: page.getByTestId("counter-power-modifier") })
    .first();
  await expect(boosted).toBeVisible();
  const id = (await boosted.getAttribute("data-option")) ?? "";
  const inModal = await boosted.getByTestId("counter-power-chip").textContent();
  const onBoard = await page
    .locator(
      `[data-testid="card"][data-instance-id="${id}"] [data-testid="counter-power-chip"]`,
    )
    .textContent();
  expect(inModal?.trim()).toBe(onBoard?.trim());
  // The printed value plus a signed modifier, as on the board.
  expect(inModal?.trim()).toMatch(/^\d+ [+-]\d+$/);
});

const next = () =>
  (fixture("invasion-win") as { next: { cardInstanceId: string } }).next;

/** Takes the fixture's winning invade through the UI: the hand card onto the discard pile. */
async function invade(page: Page) {
  await page
    .locator(
      `[data-testid="hand-card"]:has([data-instance-id="${next().cardInstanceId}"])`,
    )
    .click();
  await page.locator('[data-lit][data-target="discard"]').click();
}

async function overOpponentZone8(page: Page) {
  const [card, zone] = [
    await page.getByTestId("slam-card").boundingBox(),
    await page.getByTestId("zone-P2-8").boundingBox(),
  ];
  if (!card || !zone) throw new Error("no box");
  const cx = card.x + card.width / 2;
  const cy = card.y + card.height / 2;
  expect(cx).toBeGreaterThan(zone.x);
  expect(cx).toBeLessThan(zone.x + zone.width);
  expect(cy).toBeGreaterThan(zone.y);
  expect(cy).toBeLessThan(zone.y + zone.height);
}

test.describe("#20 invasion-win slam at Normal", () => {
  // The default settings: animation Normal.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the monster lifts and slams into the opponent's zone 8, the cracks spread, then the game-over modal opens", async ({
    page,
  }) => {
    await loadFixture(page, "invasion-win");
    await invade(page);
    const slam = page.getByTestId("invasion-slam");
    await expect(slam).toHaveAttribute("data-phase", "play");
    // The modal waits for the slam.
    await expect(page.getByTestId("game-over-modal")).toHaveCount(0);
    await expect(page.getByTestId("slam-cracks")).toHaveCount(1);
    await expect(slam).toHaveAttribute("data-phase", "done");
    await overOpponentZone8(page);
    // It stays on top at its angle; the cracks stay.
    expect(
      await page
        .getByTestId("slam-card")
        .evaluate((el) => getComputedStyle(el).transform),
    ).not.toBe("none");
    expect(
      await page.getByTestId("slam-cracks").locator("path").count(),
    ).toBeGreaterThan(5);
    await expect(page.getByTestId("game-over-modal")).toBeVisible();
    await expect(page.getByTestId("game-over-line")).toHaveAttribute(
      "data-outcome",
      /win/,
    );
  });
});

test("#20 with Animation Off, the monster and the cracks are there at once, and the modal opens", async ({
  page,
}) => {
  await loadFixture(page, "invasion-win");
  await invade(page);
  await expect(page.getByTestId("invasion-slam")).toHaveAttribute(
    "data-phase",
    "done",
  );
  await expect(page.getByTestId("slam-cracks")).toHaveCount(1);
  await overOpponentZone8(page);
  await expect(page.getByTestId("game-over-modal")).toBeVisible();
});

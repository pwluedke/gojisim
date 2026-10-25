import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { loadFixture, vsBot } from "./helpers";

/**
 * M5h-1: play-test round 2 (board and game flow). Hotseat's removal (#15) and the End Main
 * confirm (#5) are covered where the older specs used them; this spec covers the rest.
 */

test.use({ viewport: { width: 1440, height: 900 } });

async function noScroll(page: Page) {
  expect(
    await page.evaluate(() => ({
      y: document.documentElement.scrollHeight <= window.innerHeight,
      x: document.documentElement.scrollWidth <= window.innerWidth,
    })),
  ).toEqual({ y: true, x: true });
}

test("#1 zone labels show in the middle of an area only while it is hovered", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const cases = [
    // Clicking a discard pile opens the stack viewer (M5h #9), so its label says so.
    ["discard-P1", "Show discard"],
    ["deck-P1", "Deck"],
    ["monster-deck-P1", "Monster deck"],
    ["strategy-P1-1", "Strategy 1"],
    ["strategy-P2-2", "Strategy 2"],
    ["monster-P1", "Monster"],
    ["monster-P2", "Monster"],
  ] as const;
  for (const [testId, text] of cases) {
    const area = page.getByTestId(testId);
    const label = area.getByTestId("hover-label").first();
    await page.mouse.move(0, 0);
    await expect(label).toBeHidden();
    await area.hover();
    await expect(label).toBeVisible();
    await expect(label).toHaveText(text);
    // Centered on the area, and styled like the zone labels.
    const [a, l] = [await area.boundingBox(), await label.boundingBox()];
    if (!a || !l) throw new Error(`no box for ${testId}`);
    expect(Math.abs(a.x + a.width / 2 - (l.x + l.width / 2))).toBeLessThan(3);
    expect(Math.abs(a.y + a.height / 2 - (l.y + l.height / 2))).toBeLessThan(3);
    const style = (sel: string) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return [s.fontSize, s.fontWeight, s.color].join(" ");
        });
    expect(
      await style(`[data-testid="${testId}"] [data-testid="hover-label"]`),
    ).toBe(await style('[data-testid="zone-label"]'));
  }
  // It never takes the pointer: hand cards still drop on the discard pile (hand.spec covers it).
  expect(
    await page
      .getByTestId("hover-label")
      .first()
      .evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe("none");
});

test("#2 both monsters glow in their colors all the time, whoever's turn it is; Turn glow turns it off", async ({
  page,
}) => {
  await vsBot(page, 2);
  const glows = async (id: string) => {
    const seen = new Set<string>();
    await expect
      .poll(
        async () => {
          const g = await page
            .getByTestId(id)
            .getAttribute("data-monster-glow");
          if (g) seen.add(g);
          return seen.size;
        },
        { timeout: 5000 },
      )
      .toBe(2);
    return [...seen].sort();
  };
  // ESD01 (mine) is red, ESD02 (the bot's) blue: each cycles its color and grey.
  expect(await glows("monster-P1")).toEqual(["Red", "grey"]);
  expect(await glows("monster-P2")).toEqual(["Blue", "grey"]);
  await page.getByTestId("settings").click();
  await page.getByTestId("setting-turn-glow").uncheck();
  await expect(page.getByTestId("monster-P1")).not.toHaveAttribute(
    "data-monster-glow",
    /.*/,
  );
  await expect(page.getByTestId("monster-P2")).not.toHaveAttribute(
    "data-monster-glow",
    /.*/,
  );
});

test("#3 each phase tracker step has a hover with its name and rule number, in the app's tooltip (no browser title)", async ({
  page,
}) => {
  await vsBot(page, 2);
  const steps = page.locator('[data-testid^="tracker-step-"]');
  await expect(steps).toHaveCount(18);
  for (const step of await steps.all())
    await expect(step).not.toHaveAttribute("title", /.*/);
  await page.getByTestId("tracker-step-7.2.2").hover();
  await expect(page.getByTestId("tooltip")).toHaveText(
    "Draw cards equal to the opponent's monster's rank (7.2.2)",
  );
  await page.getByTestId("tracker-step-7.3.2").hover();
  await expect(page.getByTestId("tooltip")).toHaveText(
    "Play timing: main phase actions (7.3.2)",
  );
  await page.mouse.move(0, 0);
  await expect(page.getByTestId("tooltip")).toHaveCount(0);
});

test('#6 the hand label reads "Your Hand (N)"', async ({ page }) => {
  await loadFixture(page, "hand-five");
  await expect(page.getByTestId("hand-label")).toHaveText(/^Your Hand \(9\)/);
});

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
] as const)
  test(`#12 at ${width}x${height} the history view has a full-width Back to live bar, and nothing scrolls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loadFixture(page, "hand-five");
    // A line with no card names: hovering a card name opens the preview over the log.
    await page
      .getByTestId("log-line")
      .filter({ hasNot: page.getByTestId("log-card") })
      .nth(2)
      .click();
    const bar = page.getByTestId("history-banner");
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box?.x).toBeLessThanOrEqual(1);
    expect((box?.width ?? 0) + 2).toBeGreaterThanOrEqual(width);
    const button = page.getByTestId("history-back-to-live");
    const buttonBox = await button.boundingBox();
    expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(40);
    await noScroll(page);
    await button.click();
    await expect(bar).toHaveCount(0);
    await noScroll(page);
  });

test("#13 Show opponent's hand (vs bot): the bot's hand shows face up", async ({
  page,
}) => {
  await page.goto("/play");
  await page.getByTestId("seed-input").fill("2");
  await page.getByTestId("show-opponent-hand").check();
  await page.getByTestId("start-game").click();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  const hand = page.getByTestId("opponent-hand");
  await expect(hand.getByTestId("card").first()).toBeVisible();
  await expect(hand.getByTestId("opponent-card-back")).toHaveCount(0);
  // Off by default: backs only.
  await page.goto("/play");
  await expect(page.getByTestId("show-opponent-hand")).not.toBeChecked();
  // Watching two bots: not offered.
  await page.getByTestId("seat-P1").selectOption("bot");
  await expect(page.getByTestId("show-opponent-hand")).toHaveCount(0);
});

test("#14 the search pick names what is searched for, with no number badges and no repeated location labels; number keys still pick", async ({
  page,
}) => {
  await loadFixture(page, "search");
  const modal = page.getByTestId("choice-modal");
  await expect(page.getByTestId("choice-heading")).toHaveText(
    /^You are searching your deck for .*battle card named Godzilla \(2023\)/,
  );
  await expect(modal).toContainText("Godzilla Emerges [ESD01-014]");
  await expect(modal.locator('[class*="keyBadge"]')).toHaveCount(0);
  await expect(page.getByTestId("choice-location")).toHaveCount(0);
  // The keys are listed under ?, and 1 still picks the first card.
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcut-list")).toContainText(
    "no number badges",
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("1");
  await expect(page.getByTestId("choice-modal")).toHaveCount(0);
});

test("#17 the game-over modal shows the result and a line for it; Space closes it and the board stays", async ({
  page,
}) => {
  await vsBot(page, 2);
  await page.getByTestId("concede").click();
  await page.getByTestId("confirm-yes").click();
  const modal = page.getByTestId("game-over-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByTestId("game-over-heading")).toHaveText(
    "You lose: concession",
  );
  const line = page.getByTestId("game-over-line");
  await expect(line).toHaveAttribute("data-outcome", "lossConcede");
  const lines = JSON.parse(
    readFileSync(
      new URL("../src/play/gameOverLines.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, string[]>;
  expect(lines.lossConcede).toContain(await line.textContent());
  await page.keyboard.press(" ");
  await expect(modal).toHaveCount(0);
  // The board and the log stay viewable.
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("log-panel")).toBeVisible();
  await expect(page.getByTestId("game-over")).toBeVisible();
});

test("#17 the next game never shows the same line twice in a row", async ({
  page,
}) => {
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    await vsBot(page, 2);
    await page.getByTestId("concede").click();
    await page.getByTestId("confirm-yes").click();
    seen.push((await page.getByTestId("game-over-line").textContent()) ?? "");
    await page.getByTestId("game-over-close").click();
    await expect(page.getByTestId("game-over-modal")).toHaveCount(0);
  }
  expect(seen[1]).not.toBe(seen[0]);
  expect(seen[2]).not.toBe(seen[1]);
});

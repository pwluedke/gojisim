import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import type { Action } from "@gojisim/engine";
import { loadFixture } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * M5g: combo callouts. The `combo-you` and `combo-p2` fixtures stop just before an action that
 * completes a combo (their `next`): P1's against the Medium bot, and P2's in hotseat.
 */

const nextOf = (name: string) =>
  (
    JSON.parse(
      readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"),
    ) as { next: Action }
  ).next;

/** Takes a fixture's next action through the board: a hand card and its target, or a choice. */
async function take(page: Page, action: Action) {
  if (action.type === "choose") {
    await page
      .locator(
        `[data-testid="choice-option"][data-option="${action.optionId}"]`,
      )
      .click();
    return;
  }
  if (!("cardInstanceId" in action))
    throw new Error(`can't take ${action.type}`);
  await page
    .getByTestId("hand-card")
    .filter({
      has: page.locator(`[data-instance-id="${action.cardInstanceId}"]`),
    })
    .click();
  const target =
    action.type === "playBattle"
      ? `zone:${action.zone}`
      : action.type === "activateStrategy"
        ? `strategy:${action.strategyZone}`
        : action.type === "playMonster"
          ? "monster"
          : action.type === "gainRage"
            ? "rage"
            : "discard";
  await page.locator(`[data-lit][data-target="${target}"]`).first().click();
}

const comboLines = (page: Page) =>
  page.locator('[data-testid="log-line"][data-combo="true"]');

test("your combo against the bot: a banner with its cards, then a log line", async ({
  page,
}) => {
  await loadFixture(page, "combo-you");
  // The record's earlier combos are history: no callout for them.
  await expect(page.getByTestId("combo-banner")).toHaveCount(0);
  const before = await comboLines(page).count();
  await take(page, nextOf("combo-you"));
  const banner = page.getByTestId("combo-banner");
  await expect(banner).toBeVisible();
  await expect(page.getByTestId("combo-name")).toHaveText("Tokyo Wall");
  await expect(page.getByTestId("combo-who")).toHaveText("Combo · You");
  await expect(banner.getByTestId("combo-card")).toHaveCount(3);
  await expect(comboLines(page)).toHaveCount(before + 1);
  await expect(comboLines(page).last()).toHaveText("Combo: Tokyo Wall (You)");
  // About 2 s, then it goes.
  await expect(banner).toHaveCount(0, { timeout: 4000 });
});

test("the other side's combo (P2 in hotseat) is called out with its seat", async ({
  page,
}) => {
  await loadFixture(page, "combo-p2");
  await expect(page.getByTestId("board")).toHaveAttribute("data-bottom", "P2");
  await take(page, nextOf("combo-p2"));
  await expect(page.getByTestId("combo-name")).toHaveText("Tokyo Wall");
  await expect(page.getByTestId("combo-who")).toHaveText("Combo · P2");
  await expect(comboLines(page).last()).toHaveText("Combo: Tokyo Wall (P2)");
});

test("with Combo callouts off, no banner, but the log line stays", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "off", comboCallouts: false }),
    ),
  );
  await loadFixture(page, "combo-you");
  const before = await comboLines(page).count();
  await take(page, nextOf("combo-you"));
  await expect(comboLines(page)).toHaveCount(before + 1);
  await expect(comboLines(page).last()).toHaveText("Combo: Tokyo Wall (You)");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("combo-banner")).toHaveCount(0);
});

test("with animations on, the banner waits for the cards to land", async ({
  page,
}) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "normal" }),
    ),
  );
  await loadFixture(page, "combo-you");
  await take(page, nextOf("combo-you"));
  // While cards move (the lock is up), no banner; once they land, the banner.
  await expect(page.getByTestId("animation-lock")).toBeVisible();
  await expect(page.getByTestId("combo-banner")).toHaveCount(0);
  await expect(page.getByTestId("animation-lock")).toHaveCount(0);
  await expect(page.getByTestId("combo-banner")).toBeVisible();
});

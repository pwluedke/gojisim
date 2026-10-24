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
  if (action.type === "pass") {
    await page.getByTestId("pass").click();
    const yes = page.getByTestId("confirm-yes");
    if (await yes.isVisible()) await yes.click();
    return;
  }
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

/** The combo's entry in the JSON data (its text matches combos.md, checked by a unit test). */
const tokyoWall = (
  JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/cards/data/combos/ESD01.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { name: string; cards: string[]; text: Record<string, string> }[]
).find((c) => c.name === "Tokyo Wall") as {
  name: string;
  cards: string[];
  text: Record<string, string>;
};

const settingsWith = (page: Page, values: Record<string, unknown>) =>
  page.addInitScript(
    (text) => window.localStorage.setItem("gojisim.settings", text),
    JSON.stringify({ animation: "off", ...values }),
  );

test("your combo against the bot opens the combo modal: name, who, cards, steps and result; Space closes it", async ({
  page,
}) => {
  await loadFixture(page, "combo-you");
  // The record's earlier combos are history: no modal for them.
  await expect(page.getByTestId("combo-modal")).toHaveCount(0);
  const before = await comboLines(page).count();
  await take(page, nextOf("combo-you"));
  const modal = page.getByTestId("combo-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByTestId("combo-name")).toHaveText("Tokyo Wall");
  await expect(page.getByTestId("combo-who")).toHaveText("Combo · You");
  const cards = modal.getByTestId("combo-card");
  await expect(cards).toHaveCount(3);
  for (const [i, number] of tokyoWall.cards.entries())
    await expect(cards.nth(i)).toContainText(`[${number}]`);
  await expect(page.getByTestId("combo-steps")).toHaveText(
    tokyoWall.text["steps"] ?? "",
  );
  await expect(page.getByTestId("combo-result")).toHaveText(
    tokyoWall.text["result"] ?? "",
  );
  await expect(comboLines(page)).toHaveCount(before + 1);
  await expect(comboLines(page).last()).toHaveText("Combo: Tokyo Wall (You)");
  // No auto-dismiss: still open after 2.5 s.
  await page.waitForTimeout(2500);
  await expect(modal).toBeVisible();
  // Hovering a card opens its preview.
  await cards.first().hover();
  await expect(page.getByTestId("card-preview")).toBeVisible();
  await page.keyboard.press(" ");
  await expect(modal).toHaveCount(0);
});

test("the Close button closes the combo modal", async ({ page }) => {
  await loadFixture(page, "combo-you");
  await take(page, nextOf("combo-you"));
  await expect(page.getByTestId("combo-modal")).toBeVisible();
  await page.getByTestId("combo-close").click();
  await expect(page.getByTestId("combo-modal")).toHaveCount(0);
});

test("the bot doesn't move while the combo modal is open", async ({ page }) => {
  await settingsWith(page, { botDelay: 0 });
  await loadFixture(page, "combo-bot-waits");
  const botLines = () =>
    page
      .getByTestId("log-line")
      .filter({ hasText: /^Bot \(Medium\): / })
      .count();
  const before = await botLines();
  await take(page, nextOf("combo-bot-waits"));
  await expect(page.getByTestId("combo-modal")).toBeVisible();
  // The decision is the bot's, with no delay; it waits for the modal.
  await page.waitForTimeout(2500);
  expect(await botLines()).toBe(before);
  await expect(page.getByTestId("bot-thinking")).not.toContainText("thinking");
  await page.getByTestId("combo-close").click();
  await expect.poll(botLines, { timeout: 30_000 }).toBeGreaterThan(before);
});

test("the other side's combo (P2 in hotseat) names its seat", async ({
  page,
}) => {
  await loadFixture(page, "combo-p2");
  await expect(page.getByTestId("board")).toHaveAttribute("data-bottom", "P2");
  await take(page, nextOf("combo-p2"));
  await expect(page.getByTestId("combo-name")).toHaveText("Tokyo Wall");
  await expect(page.getByTestId("combo-who")).toHaveText("Combo · P2");
  await expect(comboLines(page).last()).toHaveText("Combo: Tokyo Wall (P2)");
});

test("with Combo callouts off, no modal, but the log line stays", async ({
  page,
}) => {
  await settingsWith(page, { comboCallouts: false });
  await loadFixture(page, "combo-you");
  const before = await comboLines(page).count();
  await take(page, nextOf("combo-you"));
  await expect(comboLines(page)).toHaveCount(before + 1);
  await expect(comboLines(page).last()).toHaveText("Combo: Tokyo Wall (You)");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("combo-modal")).toHaveCount(0);
});

test("with animations on, the modal opens once the cards land, with a shake; Off skips the shake", async ({
  page,
}) => {
  await settingsWith(page, { animation: "normal" });
  await loadFixture(page, "combo-you");
  await take(page, nextOf("combo-you"));
  // While cards move (the lock is up), no modal; once they land, it opens shaking.
  await expect(page.getByTestId("animation-lock")).toBeVisible();
  await expect(page.getByTestId("combo-modal")).toHaveCount(0);
  await expect(page.getByTestId("animation-lock")).toHaveCount(0);
  await expect(page.getByTestId("combo-modal")).toBeVisible();
  await expect(page.locator('[data-shake="true"]')).toHaveCount(1);
});

test("with animations Off the modal doesn't shake", async ({ page }) => {
  await loadFixture(page, "combo-you");
  await take(page, nextOf("combo-you"));
  await expect(page.getByTestId("combo-modal")).toBeVisible();
  await expect(page.locator("[data-shake]")).toHaveCount(0);
});

/**
 * M5g fix (Paul's bug): a moving card stays above every board card the whole flight and lands
 * on top of its stack; only a move to the deck bottom slides under the pile. Samples every frame:
 * what lies at each moving card's center (`elementFromPoint`).
 */
interface LayerSample {
  id: string;
  cardId: string | null;
  to: number[];
  underPile: boolean;
  /** The element at the card's center is this flight (or inside it). */
  onTop: boolean;
  /** The pile cover lies at its center (a deck-bottom move). */
  coverOnTop: boolean;
  t: number;
}

async function sampleLayers(page: Page) {
  await page.addInitScript(() => {
    const samples: unknown[] = [];
    (window as unknown as { layers: unknown[] }).layers = samples;
    const frame = () => {
      document
        .querySelectorAll<HTMLElement>(
          '[data-testid="flight"]:not([data-stay])',
        )
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          const top = hit?.closest<HTMLElement>(
            '[data-testid="flight"], [data-testid="flight-cover"]',
          );
          samples.push({
            id: el.dataset["flightId"],
            cardId: el.dataset["cardId"] ?? null,
            to: (el.dataset["to"] ?? "").split(",").map(Number),
            underPile: el.dataset["underPile"] === "true",
            onTop: top === el,
            coverOnTop: top?.dataset["testid"] === "flight-cover",
            t: performance.now(),
          });
        });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

const layers = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { layers: LayerSample[] }).layers,
  ) as Promise<LayerSample[]>;

/** Samples of flights landing inside the box of `testId`. */
async function landingIn(page: Page, testId: string, all: LayerSample[]) {
  // A monster can be missing for a moment (countered, before its next monster).
  const box = (await page.getByTestId(testId).count())
    ? await page.getByTestId(testId).first().boundingBox()
    : null;
  if (!box) return [];
  return all.filter((s) => {
    const [x = 0, y = 0, w = 0, h = 0] = s.to;
    const cx = x + w / 2;
    const cy = y + h / 2;
    return (
      cx >= box.x &&
      cx <= box.x + box.width &&
      cy >= box.y &&
      cy <= box.y + box.height
    );
  });
}

const normal = (page: Page, extra: Record<string, unknown> = {}) =>
  page.addInitScript(
    (text) => window.localStorage.setItem("gojisim.settings", text),
    JSON.stringify({ animation: "normal", ...extra }),
  );

const settled = async (page: Page) => {
  await expect(page.getByTestId("flight")).toHaveCount(0);
  await expect(page.getByTestId("animation-lock")).toHaveCount(0);
};

test.describe("moving cards stay on top (M5g fix)", () => {
  test("a hand card onto a non-empty discard pile is on top the whole flight", async ({
    page,
  }) => {
    await normal(page, { hotseatCover: false });
    await sampleLayers(page);
    await page.goto("/play?mode=hotseat");
    await page.getByTestId("seed-input").fill("2");
    const { startGame, passTurn } = await import("./helpers");
    await startGame(page);
    await passTurn(page);
    await settled(page);
    // Gain rage first, so the discard pile has a top card, then invade onto it.
    for (const target of ["rage", "discard"]) {
      for (const card of await page.getByTestId("hand-card").all()) {
        await card.click();
        const dest = page.locator(`[data-lit][data-target="${target}"]`);
        if (await dest.count()) {
          await dest.first().click();
          break;
        }
        await page.keyboard.press("Escape");
      }
      await settled(page);
    }
    const onto = await landingIn(page, "discard-P1", await layers(page));
    expect(onto.length).toBeGreaterThan(10);
    expect(onto.filter((s) => !s.onTop)).toEqual([]);
  });

  test("an evolution onto a Larva is on top the whole flight", async ({
    page,
  }) => {
    await normal(page);
    await sampleLayers(page);
    await loadFixture(page, "confirm");
    await page.getByTestId("choice-yes").click();
    // The search for the evolved card: take the first one.
    await page
      .locator('[data-testid="choice-option"][data-card-id]')
      .first()
      .click();
    await settled(page);
    const evolved = (await layers(page)).filter((s) => s.cardId !== null);
    expect(evolved.length).toBeGreaterThan(10);
    expect(evolved.filter((s) => !s.onTop)).toEqual([]);
  });

  test("a bot's monster play onto its monster stack is on top the whole flight", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await normal(page, { botDelay: 0 });
    await sampleLayers(page);
    await page.goto("/play?mode=bot");
    await page.getByTestId("seed-input").fill("3");
    // The Easy bot plays monsters readily.
    await page.getByTestId("preset-P2-easy").click();
    const { startGame } = await import("./helpers");
    await startGame(page);
    await expect
      .poll(
        async () => {
          const pass = page.getByTestId("pass");
          if (await pass.isVisible()) {
            await pass.click();
            const yes = page.getByTestId("confirm-yes");
            if (await yes.isVisible()) await yes.click();
          }
          return (await landingIn(page, "monster-P2", await layers(page)))
            .length;
        },
        { timeout: 100_000, intervals: [300] },
      )
      .toBeGreaterThan(10);
    await settled(page);
    const onto = await landingIn(page, "monster-P2", await layers(page));
    expect(onto.filter((s) => !s.onTop)).toEqual([]);
  });

  test("a card sent to the deck bottom slides under the pile at the end", async ({
    page,
  }) => {
    await normal(page);
    await sampleLayers(page);
    await loadFixture(page, "deck-bottom");
    await take(page, nextOf("deck-bottom"));
    await settled(page);
    const bottom = (await layers(page)).filter((s) => s.underPile);
    expect(bottom.length).toBeGreaterThan(5);
    // Above the board on its way, and under the pile's top card when it arrives.
    expect(bottom.slice(0, 3).every((s) => s.onTop)).toBe(true);
    expect(bottom.at(-1)?.coverOnTop).toBe(true);
  });
});

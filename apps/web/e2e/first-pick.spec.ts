import { expect, type Page, test } from "@playwright/test";
import { loadFixture, passTurn } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * The First / Second pick as a modal over the board (Monarch, Oct 26, 2026): Start opens the board
 * with both mats and the decks in place (6.3.1.3), and the pick (6.3.1.4) shows over it. In a
 * Casual game, holding Cmd (Ctrl on Windows and Linux) shows both cards face up, and the record
 * notes the peek; in a Tournament game the key does nothing. Two bots skip the pick. Also the bot
 * hand's count badge (Paul): always on the row's rightmost card, 0 included.
 */

/** The peek key for this browser's platform, as the page sees it. */
const peekKey = (page: Page) =>
  page.evaluate(() =>
    /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
      ? "Meta"
      : "Control",
  );

async function start(page: Page, seed: string, mode = "casual") {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill(seed);
  if (mode === "tournament")
    await page.getByTestId("match-mode-tournament").check();
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("first-pick")).toBeVisible();
}

const faces = (page: Page) =>
  Promise.all(
    [0, 1].map((card) =>
      page.getByTestId(`first-pick-card-${card}`).getAttribute("data-face"),
    ),
  );

test("Start opens the board with both mats and the decks in place, the pick over it; no hands, monsters or log yet", async ({
  page,
}) => {
  await start(page, "7");
  // The new-game screen is gone; the board is under the modal.
  await expect(page.getByTestId("start-game")).toHaveCount(0);
  await expect(page.getByTestId("mat-you")).toBeVisible();
  await expect(page.getByTestId("mat-opp")).toBeVisible();
  await expect(page.getByTestId("first-pick-backdrop")).toBeVisible();
  // ESD01 and ESD02 official: 50 main deck cards and 4 monster cards each, all in their decks.
  for (const id of ["P1", "P2"]) {
    await expect(page.getByTestId(`deck-count-${id}`)).toHaveText("50");
    await expect(page.getByTestId(`monster-${id}`)).toHaveCount(0);
  }
  await expect(page.getByTestId("hand-card")).toHaveCount(0);
  await expect(page.getByTestId("opponent-card-back")).toHaveCount(0);
  // Nothing says who goes first yet: no log lines, no phase tracker, a setup prompt.
  await expect(page.getByTestId("log-line")).toHaveCount(0);
  await expect(page.getByTestId("phase-setup")).toBeVisible();
  await expect(page.getByTestId("setup-prompt")).toBeVisible();
  // No choice from the game's opening decision shows before the pick (it would tell who's first).
  await expect(page.getByTestId("choice-modal")).toHaveCount(0);
  // The bot's empty hand shows its count, 0, on an empty slot.
  await expect(page.getByTestId("opponent-hand-empty")).toBeVisible();
  await expect(page.getByTestId("opponent-hand-count")).toHaveText("0");
  // The modal blocks the board: Space doesn't Pass.
  await page.keyboard.press(" ");
  await expect(page.getByTestId("first-pick")).toBeVisible();
  await expect(faces(page)).resolves.toEqual([null, null]);
});

test("Casual: holding the peek key shows both cards face up while held; the record notes the peek", async ({
  page,
}) => {
  await start(page, "7");
  const key = await peekKey(page);
  await expect(page.getByTestId("first-pick-peek-hint")).toBeVisible();
  await page.keyboard.down(key);
  await expect(page.getByTestId("first-pick")).toHaveAttribute(
    "data-peeking",
    "true",
  );
  const seen = await faces(page);
  expect([...seen].sort()).toEqual(["First", "Second"]);
  await page.keyboard.up(key);
  await expect(page.getByTestId("first-pick")).toHaveAttribute(
    "data-peeking",
    "false",
  );
  await expect(faces(page)).resolves.toEqual([null, null]);
  // Pick the card the peek showed as First: you go first.
  const first = seen.indexOf("First");
  await page.getByTestId(`first-pick-card-${first}`).click();
  await expect(page.getByTestId("first-pick")).toContainText("You go first.");
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("log-turn").first()).toHaveText("Turn 1: You");
  await expect(
    page.locator(".gojisim[data-first-pick-peeked]"),
  ).toHaveAttribute("data-first-pick-peeked", "true");
});

test("Casual without a peek: the record has no peek flag", async ({ page }) => {
  await start(page, "7");
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("hand-card").first()).toBeVisible();
  await expect(page.locator(".gojisim[data-first-pick-peeked]")).toHaveCount(0);
});

test("Tournament: the cards stay face down and the key does nothing", async ({
  page,
}) => {
  await start(page, "7", "tournament");
  const key = await peekKey(page);
  await expect(page.getByTestId("first-pick-peek-hint")).toHaveCount(0);
  await page.keyboard.down(key);
  await page.waitForTimeout(200);
  await expect(page.getByTestId("first-pick")).toHaveAttribute(
    "data-peeking",
    "false",
  );
  await expect(faces(page)).resolves.toEqual([null, null]);
  await page.keyboard.up(key);
  await page.getByTestId("first-pick-card-1").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("hand-card").first()).toBeVisible();
  await expect(page.locator(".gojisim[data-first-pick-peeked]")).toHaveCount(0);
});

test("the same seed and the same card give the same result, peek or not", async ({
  page,
}) => {
  const result = async (peek: boolean) => {
    await start(page, "12345");
    if (peek) {
      const key = await peekKey(page);
      await page.keyboard.down(key);
      await page.keyboard.up(key);
    }
    await page.getByTestId("first-pick-card-1").click();
    const text = await page.getByTestId("first-pick").textContent();
    await page.getByTestId("first-pick-continue").click();
    await expect(page.getByTestId("hand-card").first()).toBeVisible();
    const hand = await page
      .getByTestId("hand-card")
      .locator("[data-card-id]")
      .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-card-id")));
    return { text, hand };
  };
  const plain = await result(false);
  expect(await result(false)).toEqual(plain);
  expect(await result(true)).toEqual(plain);
});

test("two bots: no pick modal", async ({ page }) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seat-P1").selectOption("bot");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("mat-you")).toBeVisible();
  await expect(page.getByTestId("first-pick")).toHaveCount(0);
});

/**
 * Passes, then answers any choice the bot's turn asks of you (a next monster after a counter, a
 * discard) with its first option, until it is your play timing again.
 */
async function toMyNextTurn(page: Page) {
  const turn = Number(await page.getByTestId("turn").textContent());
  await passTurn(page);
  await expect
    .poll(
      async () => {
        for (const id of ["choice-yes", "choice-option", "search-confirm"]) {
          const button = page.getByTestId(id).first();
          if (await button.isVisible()) await button.click();
        }
        return (
          Number(await page.getByTestId("turn").textContent()) >= turn + 2 &&
          (await page.getByTestId("pass").isVisible())
        );
      },
      { timeout: 60_000, intervals: [200] },
    )
    .toBe(true);
}

test.describe("the bot hand's count badge", () => {
  test("on the rightmost card of the row, at its top-right corner", async ({
    page,
  }) => {
    // hand-ten: the bot holds 5, a row at 1440×900; the badge rides on the last card.
    await loadFixture(page, "hand-ten");
    const hand = page.getByTestId("opponent-hand");
    await expect(hand).toHaveAttribute("data-mode", "row");
    const badge = page.getByTestId("opponent-hand-count");
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText("5");
    await expect(
      page
        .getByTestId("opponent-hand")
        .locator("[data-hand-slot]")
        .last()
        .getByTestId("opponent-hand-count"),
    ).toHaveCount(1);
    // Its corner is the last card's top-right, like a pile's count.
    const last = await page
      .getByTestId("opponent-card-back")
      .last()
      .boundingBox();
    const box = await badge.boundingBox();
    expect(Math.abs((box?.y ?? 0) - (last?.y ?? 0))).toBeLessThan(6);
    expect(
      Math.abs(
        (box?.x ?? 0) + (box?.width ?? 0) - (last?.x ?? 0) - (last?.width ?? 0),
      ),
    ).toBeLessThan(6);
  });

  test("the badge equals the bot's hand size through a few turns", async ({
    page,
  }) => {
    // hand-count-five: early in the game, so passing a few turns doesn't lose it.
    await loadFixture(page, "hand-count-five");
    const hand = page.getByTestId("opponent-hand");
    const badge = page.getByTestId("opponent-hand-count");
    const size = async () =>
      Number(
        /(\d+) card/.exec((await hand.getAttribute("aria-label")) ?? "")?.[1],
      );
    for (let turn = 0; turn < 3; turn++) {
      await toMyNextTurn(page);
      // Read together: the badge and the hand size agree, with one badge.
      await expect
        .poll(async () => Number(await badge.textContent()) === (await size()))
        .toBe(true);
      await expect(badge).toHaveCount(1);
    }
  });

  test("count mode: the count card's number is the badge, one number", async ({
    page,
  }) => {
    // hand-five: the bot holds 8, past the row's limit at 1440×900.
    await loadFixture(page, "hand-five");
    await expect(page.getByTestId("opponent-hand")).toHaveAttribute(
      "data-mode",
      "count",
    );
    await expect(page.getByTestId("opponent-card-back")).toHaveCount(1);
    await expect(page.getByTestId("opponent-hand-count")).toHaveCount(1);
    await expect(page.getByTestId("opponent-hand-count")).toHaveText("8");
  });

  test("with animations on, the badge changes only once the card has landed", async ({
    page,
  }) => {
    // Record the badge and the hand size at every frame while cards fly.
    await page.addInitScript(() => {
      localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "normal", botDelay: 0 }),
      );
      const samples: { flying: boolean; badge: string; size: string }[] = [];
      (window as unknown as { badges: typeof samples }).badges = samples;
      const frame = () => {
        const badge = document.querySelector(
          '[data-testid="opponent-hand-count"]',
        );
        const hand = document.querySelector('[data-testid="opponent-hand"]');
        if (badge && hand)
          samples.push({
            flying: !!document.querySelector('[data-testid="flight"]'),
            badge: badge.textContent ?? "",
            size:
              /(\d+) card/.exec(hand.getAttribute("aria-label") ?? "")?.[1] ??
              "",
          });
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await loadFixture(page, "hand-ten");
    await passTurn(page);
    await expect(page.getByTestId("animation-lock")).toHaveCount(0, {
      timeout: 30_000,
    });
    const samples = await page.evaluate(
      () =>
        (
          window as unknown as {
            badges: { flying: boolean; badge: string; size: string }[];
          }
        ).badges,
    );
    // While a card flew to or from the bot's hand, the badge still showed the old size.
    expect(samples.some((s) => s.flying && s.badge !== s.size)).toBe(true);
    // With nothing in flight, it always matched.
    const still = samples.filter((s) => !s.flying);
    expect(still.length).toBeGreaterThan(0);
    expect(still.at(-1)?.badge).toBe(still.at(-1)?.size);
  });
});

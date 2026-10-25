import { expect, type Page, test } from "@playwright/test";
import { fixture, loadFixture, passTurn } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * M5e: the First / Second pick, Casual undo and Tournament, the search modal, one-option choice
 * modals and rotated strategy cards. Fixtures are game records in e2e/fixtures (P1 human, P2 the
 * Medium bot); `search-none` and `single-next-monster` record `confirmSingleOption` for P1.
 */

/** Picks `card` on the First / Second screen and returns what it turned out to be. */
async function pick(page: Page, card: 0 | 1): Promise<string> {
  await page.getByTestId(`first-pick-card-${card}`).click();
  const face = page.getByTestId(`first-pick-card-${card}`);
  await expect(face).toHaveAttribute("data-face", /^(First|Second)$/);
  const other = page.getByTestId(`first-pick-card-${1 - card}`);
  const picked = (await face.getAttribute("data-face")) ?? "";
  await expect(other).toHaveAttribute(
    "data-face",
    picked === "First" ? "Second" : "First",
  );
  return picked;
}

test("vs bot: the human picks one of two face-down cards, and First goes first", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("5");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("first-pick")).toHaveAttribute(
    "data-picker",
    "P1",
  );
  await expect(page.getByTestId("first-pick-card-0")).not.toHaveAttribute(
    "data-face",
    /.*/,
  );
  const face = await pick(page, 1);
  await expect(page.getByTestId("first-pick")).toContainText(
    face === "First" ? "You go first." : "You go second.",
  );
  await page.keyboard.press(" ");
  await expect(page.getByTestId("log-turn").first()).toHaveText(
    face === "First" ? "Turn 1: You" : "Turn 1: Bot",
  );
});

test("a record with two human seats (hotseat, removed in M5h) doesn't load in /play; /debug still loads it", async ({
  page,
}) => {
  const record = {
    ...fixture("hand-five"),
    seats: { P1: { kind: "human" }, P2: { kind: "human" } },
  };
  const file = {
    name: "hotseat.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(record)),
  };
  await page.goto("/play");
  await page.getByTestId("load-record").setInputFiles(file);
  await expect(page.getByTestId("load-error")).toContainText("/debug");
  await expect(page.getByTestId("board")).toHaveCount(0);
  await page.goto("/debug");
  await page.getByTestId("import-file").setInputFiles(file);
  await expect(page.getByTestId("status-turn")).toHaveText("13");
});

test.describe("undo", () => {
  // The hand-five fixture: P1's turn 13 against the Medium bot can gain rage and play a battle
  // card. It began with the bot's turn and P1's draw, so there is nothing to undo yet.
  async function handFive(page: Page, mode: "casual" | "tournament") {
    await loadFixture(page, "hand-five", { mode });
    await expect(page.getByTestId("board")).toHaveAttribute(
      "data-bottom",
      "P1",
    );
  }

  /** Takes a hand action by click with the first hand card lit for `target` (prefix). */
  async function act(page: Page, target: string) {
    const cards = page.getByTestId("hand-card");
    for (let i = 0; i < (await cards.count()); i++) {
      await cards.nth(i).click();
      const dest = page.locator(`[data-lit][data-target^="${target}"]`);
      if (await dest.count()) {
        await dest.first().click();
        return;
      }
      await page.keyboard.press("Escape");
    }
    throw new Error(`no hand card can go to ${target}`);
  }
  const gainRage = (page: Page) => act(page, "rage");

  test("Casual: Undo and U take back your own actions, one at a time, but not past the opponent's turn", async ({
    page,
  }) => {
    await handFive(page, "casual");
    const undo = page.getByTestId("undo");
    await expect(undo).toBeDisabled();
    const hand = await page.getByTestId("your-hand-count").textContent();
    const rage = Number(await page.getByTestId("rage-P1").textContent());
    const rageLines = await page
      .getByTestId("log-line")
      .filter({ hasText: /rage/i })
      .count();
    await gainRage(page);
    await expect(page.getByTestId("rage-P1")).toHaveText(String(rage + 1));
    // A battle card play (it may go to an occupied zone, so count the hand, not the zones).
    const handCount = () =>
      page
        .getByTestId("your-hand-count")
        .textContent()
        .then((t) => Number(t));
    const afterRage = await handCount();
    await act(page, "zone:");
    await expect.poll(handCount).toBe(afterRage - 1);
    await undo.click();
    await expect.poll(handCount).toBe(afterRage);
    await expect(page.getByTestId("rage-P1")).toHaveText(String(rage + 1));
    await page.keyboard.press("u");
    await expect(page.getByTestId("rage-P1")).toHaveText(String(rage));
    await expect(page.getByTestId("your-hand-count")).toHaveText(hand ?? "");
    await expect(undo).toBeDisabled();
    // The undone actions are gone from the log too: the record keeps the final line only.
    await expect(
      page.getByTestId("log-line").filter({ hasText: /rage/i }),
    ).toHaveCount(rageLines);
    // After P1 passes, the bot decides: there is no undo for the human until their own action.
    await gainRage(page);
    await passTurn(page);
    await expect(page.getByTestId("undo")).toHaveCount(0);
  });

  test("Tournament: no undo", async ({ page }) => {
    await handFive(page, "tournament");
    const rage = Number(await page.getByTestId("rage-P1").textContent());
    await gainRage(page);
    await expect(page.getByTestId("rage-P1")).toHaveText(String(rage + 1));
    await expect(page.getByTestId("undo")).toHaveCount(0);
    await page.keyboard.press("u");
    await expect(page.getByTestId("rage-P1")).toHaveText(String(rage + 1));
  });
});

test("ESD01-002 invading with nothing to find opens the search modal: source, what it wanted, 0 found", async ({
  page,
}) => {
  await loadFixture(page, "search-none");
  await expect(
    page.getByTestId("monster-P1").getByTestId("card"),
  ).toHaveAttribute("title", /ESD01-002/);
  // Invade: select a hand card that can invade, then the discard pile.
  const cards = page.getByTestId("hand-card");
  for (let i = 0; i < (await cards.count()); i++) {
    await cards.nth(i).click();
    const discard = page.locator('[data-lit][data-target="discard"]');
    if (await discard.count()) {
      await discard.first().click();
      break;
    }
    await page.keyboard.press("Escape");
  }
  const modal = page.getByTestId("search-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByTestId("search-heading")).toHaveText(
    "Deck search: 0 found",
  );
  await expect(page.getByTestId("search-source")).toContainText("ESD01-002");
  await expect(page.getByTestId("search-wanted")).toContainText(
    "up to 1 card named Godzilla (2023) of rank 3 with Burst",
  );
  await expect(page.getByTestId("search-result")).toHaveText("0 found");
  // Confirm [Space]; an icon 2 invasion searches twice (Q4), so confirm each.
  while (await modal.isVisible()) {
    await page.keyboard.press(" ");
    await page.waitForTimeout(100);
  }
  await expect(
    page.getByTestId("log-line").filter({ hasText: "0 found" }).first(),
  ).toBeVisible();
});

test("a single next monster after a counter is still a modal, confirmed by the human", async ({
  page,
}) => {
  await loadFixture(page, "single-next-monster");
  const modal = page.getByTestId("choice-modal");
  await expect(modal).toHaveAttribute("data-kind", "nextMonster");
  await expect(modal.getByTestId("choice-option")).toHaveCount(1);
  await page.keyboard.press("1");
  await expect(page.getByTestId("choice-modal")).toHaveCount(0);
});

test("strategy cards turn 90° in the hand and on the discard pile, not in strategy zones", async ({
  page,
}) => {
  // The zone fixture: P1 holds strategy cards and a strategy card tops their discard pile.
  await loadFixture(page, "zone");
  const rotated = page
    .getByTestId("hand-card")
    .locator('[data-testid="card"][data-rotated="true"]');
  expect(await rotated.count()).toBeGreaterThan(0);
  const image = rotated.first().locator("img");
  const transform = await image.evaluate(
    (el) => getComputedStyle(el).transform,
  );
  // rotate(90deg) is matrix(0, 1, -1, 0, x, y).
  expect(transform).toMatch(/^matrix\(0, 1, -1, 0,/);
  const box = await rotated.first().boundingBox();
  const imageBox = await image.boundingBox();
  // The turned image fills the portrait card.
  expect(Math.abs((imageBox?.height ?? 0) - (box?.height ?? 0))).toBeLessThan(
    2,
  );
  expect(Math.abs((imageBox?.width ?? 0) - (box?.width ?? 0))).toBeLessThan(2);
  await expect(
    page.getByTestId("discard-P1").locator('[data-rotated="true"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid^="strategy-"] [data-rotated]'),
  ).toHaveCount(0);
});

test("a search that finds a card shows it in the search modal after the pick", async ({
  page,
}) => {
  await loadFixture(page, "search");
  const option = page
    .getByTestId("choice-modal")
    .locator('[data-testid="choice-option"][data-card-id]')
    .first();
  const cardId = await option.getAttribute("data-card-id");
  await option.click();
  await expect(page.getByTestId("search-heading")).toHaveText(
    "Deck search: 1 found",
  );
  await expect(
    page.getByTestId("search-result").getByTestId("search-card"),
  ).toHaveAttribute("data-card-id", cardId ?? "");
  await page.getByTestId("search-confirm").click();
  await expect(page.getByTestId("search-modal")).toHaveCount(0);
});

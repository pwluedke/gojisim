import { expect, type Page, test } from "@playwright/test";
import { loadFixture, passTurn, startGame, vsBot } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * M5d: battle log, phase tracker, shortcuts and the expanded hand. Fixtures are the M5c game
 * records in e2e/fixtures (P1 human, P2 the Medium bot).
 */

const logLines = (page: Page) => page.getByTestId("log-line");

test("the log shows turn markers and card names that open the preview", async ({
  page,
}) => {
  // The zone fixture: a zone choice shows a banner, so the log stays usable.
  await loadFixture(page, "zone");
  await expect(page.getByTestId("log-turn").first()).toHaveText(
    /^Turn 1: (You|Bot)$/,
  );
  expect(await page.getByTestId("log-turn").count()).toBeGreaterThan(5);
  const link = page.getByTestId("log-card").last();
  const cardId = await link.getAttribute("data-card-id");
  await link.hover();
  await expect(page.getByTestId("card-preview")).toHaveAttribute(
    "data-card-id",
    cardId ?? "",
  );
  // Rule numbers are off by default; the setting shows them.
  await expect(page.getByTestId("log-rule")).toHaveCount(0);
  await page.getByTestId("settings").click();
  await page.getByTestId("setting-rules").check();
  expect(await page.getByTestId("log-rule").count()).toBeGreaterThan(0);
});

test("hidden draws show only a count, and the bot's private choices only that it chose", async ({
  page,
}) => {
  await loadFixture(page, "search");
  const draws = logLines(page).filter({ hasText: /^Bot draws \d+$/ });
  expect(await draws.count()).toBeGreaterThan(0);
  await expect(draws.getByTestId("log-card")).toHaveCount(0);
  const secret = logLines(page).filter({ hasText: "makes a private choice" });
  await expect(secret.getByTestId("log-card")).toHaveCount(0);
});

test("clicking a log line shows that moment read-only; Back to live returns", async ({
  page,
}) => {
  await loadFixture(page, "zone");
  const liveTurn = await page.getByTestId("turn").textContent();
  await expect(page.getByTestId("choice-banner")).toBeVisible();
  // An early line: the board after it, from the human's side.
  await logLines(page).nth(3).click();
  await expect(page.getByTestId("history-banner")).toBeVisible();
  await expect(page.getByTestId("turn")).not.toHaveText(liveTurn ?? "");
  await expect(page.getByTestId("choice-banner")).toHaveCount(0);
  await expect(page.locator("[data-zone-choice]")).toHaveCount(0);
  await expect(page.getByTestId("your-hand")).toHaveAttribute(
    "data-locked",
    "true",
  );
  await expect(page.getByTestId("board")).toHaveAttribute("data-bottom", "P1");
  await page.getByTestId("back-to-live").click();
  await expect(page.getByTestId("history-banner")).toHaveCount(0);
  await expect(page.getByTestId("turn")).toHaveText(liveTurn ?? "");
  await expect(page.getByTestId("choice-banner")).toBeVisible();
});

test("while viewing history the bot keeps thinking, but nothing is applied until Back to live", async ({
  page,
}) => {
  // After the human's Pass, the bot plays its turn.
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("1");
  await startGame(page);
  await passTurn(page);
  // The first line (the opening draw) is in the past now.
  await logLines(page).first().click();
  await expect(page.getByTestId("history-banner")).toBeVisible();
  const before = await logLines(page).count();
  await page.waitForTimeout(3000);
  expect(await logLines(page).count()).toBe(before);
  await page.getByTestId("back-to-live").click();
  await expect
    .poll(() => logLines(page).count(), { timeout: 30_000 })
    .toBeGreaterThan(before);
});

test("currentStep: a choice from a counter-triggered [enter] shows the counter phase", async ({
  page,
}) => {
  // The target fixture: ESD01-006 entered as the next monster after a counter in the bot's turn
  // (5.15), and its [enter] resolves in the 7.4.4 check timing (state.step is already 7.5.1).
  await loadFixture(page, "target");
  await expect(page.getByTestId("prompt-step")).toContainText("Counter phase");
  await expect(page.getByTestId("tracker-counter")).toHaveAttribute(
    "data-current",
    "true",
  );
  await expect(page.getByTestId("tracker-step-7.4.4")).toHaveAttribute(
    "data-current",
    "true",
  );
  await expect(page.getByTestId("tracker-end")).not.toHaveAttribute(
    "data-current",
    "true",
  );
  await expect(page.getByTestId("tracker-players")).toContainText(
    "Turn player: Bot (P2)",
  );
});

test("H opens and closes the expanded hand; clicking a card there does nothing", async ({
  page,
}) => {
  await vsBot(page, 2);
  const count = Number(await page.getByTestId("your-hand-count").textContent());
  await page.keyboard.press("h");
  const expanded = page.getByTestId("expanded-hand");
  await expect(expanded).toBeVisible();
  await expect(page.getByTestId("expanded-card")).toHaveCount(count);
  await page.getByTestId("expanded-card").first().click();
  await expect(expanded).toBeVisible();
  await expect(page.locator("[data-lit]")).toHaveCount(0);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("h");
  await expect(expanded).toHaveCount(0);
  await page.keyboard.press("h");
  await page.keyboard.press("Escape");
  await expect(expanded).toHaveCount(0);
  // The setting turns H off.
  await page.getByTestId("settings").click();
  await page.getByTestId("setting-expanded-hand").uncheck();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("h");
  await expect(expanded).toHaveCount(0);
});

test("shortcuts: Space passes, L toggles the log, ? lists the shortcuts, Esc closes", async ({
  page,
}) => {
  await vsBot(page, 2);
  await expect(page.getByTestId("log-panel")).toBeVisible();
  await page.keyboard.press("l");
  await expect(page.getByTestId("log-panel")).toHaveCount(0);
  await page.keyboard.press("L");
  await expect(page.getByTestId("log-panel")).toBeVisible();

  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcut-list")).toContainText("Space");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("shortcut-list")).toHaveCount(0);

  // Space is Pass, which always asks first (M5h).
  await page.keyboard.press("Space");
  await expect(page.getByTestId("confirm-dialog")).toContainText(
    "End Main and move to the Counter Phase?",
  );
  await expect(page.getByTestId("confirm-yes")).toHaveText("Confirm [Space]");
  await expect(page.getByTestId("confirm-cancel")).toHaveText("Cancel [Esc]");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("turn")).toHaveText("1");
});

test("End Main confirm (M5h): every Pass asks; Space then Space passes, also after clicking the Pass button", async ({
  page,
}) => {
  await vsBot(page, 2);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  // The bot's turn 2, then mine again: turn 3.
  await expect(page.getByTestId("turn")).toHaveText("3", { timeout: 30_000 });
  await expect(page.getByTestId("pass")).toBeVisible({ timeout: 30_000 });
  // A mouse click on Pass leaves focus on it; the second Space still passes, once.
  await page.getByTestId("pass").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("turn")).toHaveText("4");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
});

test("End Main confirm: Cancel and Esc keep the main phase; the old Pass setting is gone", async ({
  page,
}) => {
  await vsBot(page, 2);
  await page.getByTestId("pass").click();
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await page.getByTestId("pass").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("prompt-step")).toContainText("Main");
  await expect(page.getByTestId("turn")).toHaveText("1");
  await page.getByTestId("settings").click();
  await expect(page.getByTestId("setting-confirm-pass")).toHaveCount(0);
});

test("a single-target destroy is still asked (confirmSingleTarget), with its zone label; hovering it rings the zone", async ({
  page,
}) => {
  await loadFixture(page, "single-target");
  const modal = page.getByTestId("choice-modal");
  await expect(modal).toHaveAttribute("data-kind", "target");
  const option = page.getByTestId("choice-option");
  await expect(option).toHaveCount(1);
  const label = page.getByTestId("choice-location");
  await expect(label).toHaveText(/^Z[1-8]( \(opponent\))?$/);
  const [, zone, theirs] =
    /^Z(\d)( \(opponent\))?$/.exec((await label.textContent()) ?? "") ?? [];
  const cell = `zone-${theirs ? "P2" : "P1"}-${zone}`;
  await option.hover();
  const ring = page.getByTestId("target-ring");
  await expect(ring).toHaveAttribute("data-for", cell);
  const [a, b] = [
    await ring.boundingBox(),
    await page.getByTestId(cell).boundingBox(),
  ];
  expect(Math.abs((a?.x ?? 0) - (b?.x ?? 99))).toBeLessThanOrEqual(1);
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 99))).toBeLessThanOrEqual(1);
  // Confirming it destroys the card: the modal closes and the game goes on.
  const discards = Number(
    await page
      .getByTestId(`discard-count-${theirs ? "P2" : "P1"}`)
      .textContent(),
  );
  await option.click();
  await expect(page.getByTestId("choice-modal")).toHaveCount(0);
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId(`discard-count-${theirs ? "P2" : "P1"}`)
          .textContent(),
      ),
    )
    .toBeGreaterThan(discards);
});

test("shortcuts never fire while focus is in an input", async ({ page }) => {
  await vsBot(page, 2);
  await page.getByTestId("settings").click();
  await page.getByTestId("setting-bot-delay").focus();
  for (const key of ["h", "l", "?", "Space"]) await page.keyboard.press(key);
  await expect(page.getByTestId("expanded-hand")).toHaveCount(0);
  await expect(page.getByTestId("shortcut-list")).toHaveCount(0);
  await expect(page.getByTestId("log-panel")).toBeVisible();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("turn")).toHaveText("1");
});

test('a strategy card placed this turn has the "New" corner mark', async ({
  page,
}) => {
  // The hand-five fixture can activate a strategy card.
  await loadFixture(page, "hand-five");
  const cards = page.getByTestId("hand-card");
  let zone = "";
  for (let i = 0; i < (await cards.count()); i++) {
    await cards.nth(i).click();
    const dest = page.locator('[data-lit][data-target^="strategy:"]').first();
    if (await dest.count()) {
      zone = ((await dest.getAttribute("data-target")) ?? "").slice(9);
      await dest.click();
      break;
    }
    await page.keyboard.press("Escape");
  }
  const mark = page
    .getByTestId(`strategy-P1-${zone}`)
    .getByTestId("strategy-mark");
  await expect(mark).toHaveText("New");
  await expect(mark).toHaveAttribute("data-this-turn", "true");
});

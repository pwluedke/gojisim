import { expect, type Page, test } from "@playwright/test";
import { loadFixture, startGame } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * M5c prompts and choices. Choice fixtures are game records in e2e/fixtures (made by
 * generate.ts, which notes each one), loaded with "Load a game record": P1 is human, P2 the
 * Medium bot, and the record stops at P1's pending choice.
 */
const KINDS = [
  { fixture: "target", kind: "target", heading: /^You are choosing a target/ },
  {
    fixture: "search",
    kind: "target",
    heading: /^You are searching your deck/,
  },
  {
    fixture: "discard-bot-turn",
    kind: "target",
    heading: /^You are choosing .*discard.* during Bot's turn$/,
  },
  {
    fixture: "confirm",
    kind: "confirm",
    heading: /^You are deciding whether to use/,
  },
  {
    fixture: "standby-order",
    kind: "standbyOrder",
    heading: /^You are choosing which ability resolves first/,
  },
  {
    fixture: "next-monster",
    kind: "nextMonster",
    heading: /^You are choosing your next monster/,
  },
  {
    fixture: "manual",
    kind: "manual",
    heading: /^You are resolving a card by hand/,
  },
] as const;

for (const { fixture, kind, heading } of KINDS)
  test(`choice modal: ${kind} (${fixture}) with its heading and source`, async ({
    page,
  }) => {
    await loadFixture(page, fixture);
    const modal = page.getByTestId("choice-modal");
    await expect(modal).toHaveAttribute("data-kind", kind);
    await expect(page.getByTestId("choice-heading")).toHaveText(heading);
    await expect(page.getByTestId("choice-source")).toContainText("From ");
    if (kind === "confirm") {
      await expect(page.getByTestId("choice-yes")).toBeVisible();
      await expect(page.getByTestId("choice-no")).toBeVisible();
    } else if (kind === "manual") {
      await expect(modal.getByTestId("manual-panel")).toBeVisible();
      await expect(page.getByTestId("choice-done")).toBeVisible();
    } else {
      // Card options are large card images, numbered for the keys 1 to 9.
      const options = page.getByTestId("choice-option");
      expect(await options.count()).toBeGreaterThan(0);
      await expect(options.first().locator("img")).toHaveAttribute(
        "src",
        /\/cards\/\d+-thumb\.webp$/,
      );
    }
    if (kind === "nextMonster")
      await expect(page.getByTestId("choice-option")).toHaveCount(2);
  });

test("choice: zone options light the zones on the mat, with a banner in the Prompt panel instead of a modal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadFixture(page, "zone");
  await expect(page.getByTestId("choice-modal")).toHaveCount(0);
  const banner = page.getByTestId("prompt").getByTestId("choice-banner");
  await expect(banner).toHaveAttribute("data-kind", "zone");
  await expect(banner.getByTestId("choice-heading")).toHaveText(
    /^You are choosing a zone for /,
  );
  await expect(banner.getByTestId("choice-source")).toHaveText(
    /^From .+ \[[A-Z0-9]+-\d+\]$/,
  );
  await expect(banner).toContainText("Click a lit zone, or press its number");
  // Buttons name the zone's side as target locations do: "Your zone 1", "Bot's zone 3".
  for (const text of await banner
    .getByTestId("choice-option")
    .allTextContents())
    expect(text).toMatch(/^\d (Your|Bot's) zone \d$/);
  // The battle log stays fully visible: the banner doesn't overlap it.
  const box = await banner.boundingBox();
  const log = await page.getByTestId("battle-log").boundingBox();
  expect(box && log).toBeTruthy();
  if (box && log)
    expect(
      box.x + box.width <= log.x ||
        log.x + log.width <= box.x ||
        box.y + box.height <= log.y ||
        log.y + log.height <= box.y,
    ).toBe(true);
  const zones = page.locator("[data-zone-choice]");
  const options = page
    .getByTestId("choice-banner")
    .getByTestId("choice-option");
  expect(await zones.count()).toBeGreaterThan(0);
  expect(await zones.count()).toBe(await options.count());
  // Clicking a lit zone answers the choice: that zone is no longer offered.
  const key = await zones.first().getAttribute("data-zone-choice");
  await zones.first().click();
  await expect(page.locator(`[data-zone-choice="${key}"]`)).toHaveCount(0);
});

test("Tester fixes 1: discarding down selects cards (number keys or clicks), deselects, then Confirm sends them in order", async ({
  page,
}) => {
  await loadFixture(page, "discard-bot-turn");
  await expect(page.getByTestId("choice-source")).toContainText("ESD01-0");
  // The phase tracker still shows the bot (P2) as the turn player.
  await expect(page.getByTestId("phase-tracker")).toContainText("P2");
  await expect(page.getByTestId("phase-tracker")).not.toContainText("(you)");
  // The heading names the whole discard, not "N more".
  const heading = page.getByTestId("choice-heading");
  await expect(heading).toContainText(/discard \d+ cards?, down to \d+/);
  const n = Number(
    /discard (\d+) card/.exec((await heading.textContent()) ?? "")?.[1],
  );
  expect(n).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("choice-multi-hint")).toContainText(
    `Select ${n} cards, then Confirm.`,
  );
  const options = page.getByTestId("choice-option");
  const count = await options.count();
  const confirm = page.getByTestId("choice-confirm");
  await expect(confirm).toBeDisabled();
  // Key 1 selects the first card, a second press deselects it.
  await page.keyboard.press("1");
  await expect(options.nth(0)).toHaveAttribute("data-selected-order", "1");
  await page.keyboard.press("1");
  await expect(options.nth(0)).not.toHaveAttribute("data-selected-order");
  // Clicks select in order; the order shows on the cards.
  const picked: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    await options.nth(i).click();
    picked.push((await options.nth(i).getAttribute("data-option")) as string);
    await expect(options.nth(i)).toHaveAttribute(
      "data-selected-order",
      String(picked.length),
    );
  }
  // Exactly n: Confirm is on, and another card isn't added.
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText(`Confirm (${n}) [Enter]`);
  if (count > n) {
    await options.nth(n).click();
    await expect(options.nth(n)).not.toHaveAttribute("data-selected-order");
  }
  // Esc clears the selection; select again and confirm with Enter.
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-selected-order]")).toHaveCount(0);
  await expect(page.getByTestId("choice-modal")).toBeVisible();
  for (let i = n - 1; i >= 0; i--) await options.nth(i).click();
  await page.keyboard.press("Enter");
  // The n picks went in together: no discard choice is left open.
  await expect
    .poll(async () =>
      (await page.getByTestId("choice-modal").count())
        ? ((await page.getByTestId("choice-heading").textContent()) ?? "")
        : "",
    )
    .not.toMatch(/discard \d+ cards?, down to/);
});

test("searches show a Done button (find nothing), and it ends the search", async ({
  page,
}) => {
  await loadFixture(page, "search");
  const done = page.getByTestId("choice-done");
  await expect(done).toHaveText("Find nothing");
  await done.click();
  await expect
    .poll(async () =>
      (await page.getByTestId("choice-heading").count())
        ? page.getByTestId("choice-heading").textContent()
        : "",
    )
    .not.toMatch(/searching your deck/);
});

test("holding the eye button hides the modal", async ({ page }) => {
  await loadFixture(page, "target");
  const modal = page.getByTestId("choice-modal");
  const eye = await page.getByTestId("choice-eye").boundingBox();
  if (!eye) throw new Error("no eye button");
  await page.mouse.move(eye.x + eye.width / 2, eye.y + eye.height / 2);
  await page.mouse.down();
  await expect(modal).toHaveAttribute("data-hidden", "true");
  await expect(page.getByTestId("choice-heading")).toBeHidden();
  await page.mouse.up();
  await expect(modal).not.toHaveAttribute("data-hidden", "true");
  await expect(page.getByTestId("choice-heading")).toBeVisible();
});

test("End Main asks first with lit hand cards too; Cancel keeps the turn", async ({
  page,
}) => {
  // The hand-five fixture: several hand cards are lit.
  await loadFixture(page, "hand-five");
  await expect(page.locator('[data-hand-lit="true"]').first()).toBeVisible();
  await page.getByTestId("pass").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText(
    "End Main and move to the Counter Phase?",
  );
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("turn")).toHaveText("13");
  // Space is the main button too.
  await page.keyboard.press("Space");
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-yes").click();
  await expect(page.getByTestId("turn")).toHaveText("14");
});

test("Concede is shown for human seats only, with a confirm step", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seat-P1").selectOption("bot");
  await startGame(page);
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("concede")).toHaveCount(0);

  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("1");
  await startGame(page);
  await page.getByTestId("concede").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText(
    "Concede the game?",
  );
  await page.getByTestId("confirm-yes").click();
  await expect(page.getByTestId("game-over")).toContainText("Bot");
  await expect(page.getByTestId("game-over")).toContainText("concession");
});

test("bot moves: a toast names the action and the destination lights up", async ({
  page,
}) => {
  // Seed 2: the bot (P2) starts. Its search is timed (decision 183), so on a slow runner it may
  // invade and gain rage without playing a card: those toasts have no "→", but they light the
  // discard pile and rage zone. A Pass lights nothing.
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("2");
  await startGame(page);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const toast = document.querySelector('[data-testid="bot-toast"]');
          const lit = document.querySelectorAll("[data-highlight]").length;
          return /^Bot \(Medium\): /.test(toast?.textContent ?? "") && lit > 0;
        }),
      { timeout: 60_000, intervals: [50] },
    )
    .toBe(true);
});

/** Whether two boxes overlap. */
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/**
 * Checks each option's key badge (and selection number) sits in the middle of the card: its
 * center within 10% of the card's, clear of the top-left rank corner and the bottom text box.
 */
async function badgesCentered(page: Page) {
  const options = page.getByTestId("choice-option");
  const count = await options.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const card = await options.nth(i).boundingBox();
    const badges = options
      .nth(i)
      .locator(
        '[data-testid="choice-key"], [data-testid="choice-select-order"]',
      );
    expect(await badges.count()).toBeGreaterThan(0);
    for (let b = 0; b < (await badges.count()); b++) {
      const box = await badges.nth(b).boundingBox();
      if (!card || !box) throw new Error("no box");
      const rank = {
        x: card.x,
        y: card.y,
        width: card.width * 0.25,
        height: card.height * 0.15,
      };
      const text = {
        x: card.x,
        y: card.y + card.height * 0.7,
        width: card.width,
        height: card.height * 0.3,
      };
      expect(overlaps(box, rank), `card ${i} badge ${b} over the rank`).toBe(
        false,
      );
      expect(
        overlaps(box, text),
        `card ${i} badge ${b} over the text box`,
      ).toBe(false);
      if (b === 0) {
        expect(
          Math.abs(box.x + box.width / 2 - (card.x + card.width / 2)),
        ).toBeLessThanOrEqual(card.width * 0.1);
        expect(
          Math.abs(box.y + box.height / 2 - (card.y + card.height / 2)),
        ).toBeLessThanOrEqual(card.height * 0.1);
      }
    }
  }
}

test("key number badges sit in the middle of the card, clear of the rank and the text box (target pick, discard multi-pick)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadFixture(page, "target");
  await expect(page.getByTestId("choice-modal")).toBeVisible();
  await badgesCentered(page);
  await loadFixture(page, "discard-bot-turn");
  await expect(page.getByTestId("choice-modal")).toBeVisible();
  // With a card selected, its selection number sits with the key number.
  await page.getByTestId("choice-option").first().click();
  await expect(page.getByTestId("choice-select-order")).toHaveText("1");
  await badgesCentered(page);
});

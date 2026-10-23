import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * Hotseat with a fixed seed. Seed 2: P2 starts; after one Pass, P1's turn 2 offers all five hand
 * actions (8.2 to 8.6). Seed 1, both only passing: P1 holds 10 cards on turn 9.
 */
async function hotseat(page: Page, seed: number, passes: number) {
  await page.goto("/play?mode=hotseat");
  await page.getByTestId("seed-input").fill(String(seed));
  await page.getByTestId("start-game").click();
  for (let i = 0; i < passes; i++) {
    const turn = Number(await page.getByTestId("turn").textContent());
    await page.getByTestId("pass").click();
    await expect(page.getByTestId("turn")).toHaveText(String(turn + 1));
  }
  await expect(page.getByTestId("board")).toHaveAttribute("data-bottom", "P1");
}

const lit = (page: Page) => page.locator("[data-lit]");
const handCards = (page: Page) => page.getByTestId("hand-card");

/** The first playable hand card whose lit destinations include `prefix`, and that destination. */
async function cardFor(
  page: Page,
  prefix: string,
): Promise<{ card: Locator; dest: string; cardId: string }> {
  const cards = handCards(page);
  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i);
    if ((await card.getAttribute("data-playable")) !== "true") continue;
    await card.click();
    const target = page.locator(`[data-lit][data-target^="${prefix}"]`).first();
    const dest = (await target.count())
      ? await target.getAttribute("data-target")
      : null;
    await page.keyboard.press("Escape");
    await expect(lit(page)).toHaveCount(0);
    if (dest) {
      const cardId =
        (await card.getByTestId("card").getAttribute("data-card-id")) ?? "";
      return { card, dest, cardId };
    }
  }
  throw new Error(`no hand card can go to ${prefix}`);
}

async function drag(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("no box");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 - 12, {
    steps: 4,
  });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

const count = async (locator: Locator) => Number(await locator.textContent());
const inHand = (page: Page, cardId: string) =>
  page.getByTestId("your-hand").locator(`[data-card-id="${cardId}"]`).count();
const monsterZone = (page: Page) =>
  page
    .getByTestId("monster-P1")
    .evaluate((el) =>
      el.closest("[data-target^='zone']")?.getAttribute("data-target"),
    );

const CASES = [
  { action: "playBattle", prefix: "zone:" },
  { action: "activateStrategy", prefix: "strategy:" },
  { action: "playMonster", prefix: "monster" },
  { action: "gainRage", prefix: "rage" },
  { action: "invade", prefix: "discard" },
] as const;

for (const how of ["click", "drag"] as const)
  for (const { action, prefix } of CASES)
    test(`${action} by ${how}`, async ({ page }) => {
      await hotseat(page, 2, 1);
      const { card, dest, cardId } = await cardFor(page, prefix);
      const target = page.locator(`[data-target="${dest}"]`).first();
      const before = {
        inHand: await inHand(page, cardId),
        rage: await count(page.getByTestId("rage-P1")),
        discard: await count(page.getByTestId("discard-count-P1")),
        zone: await monsterZone(page),
      };
      if (how === "click") {
        await card.click();
        await expect(target).toHaveAttribute("data-lit", "true");
        await target.click();
      } else await drag(page, card, target);

      // The card left the hand, and nothing stays lit.
      await expect.poll(() => inHand(page, cardId)).toBe(before.inHand - 1);
      await expect(lit(page)).toHaveCount(0);
      if (action === "playBattle")
        await expect(
          page
            .getByTestId(`zone-P1-${dest.slice(5)}`)
            .locator(`[data-card-id="${cardId}"]`),
        ).toHaveCount(1);
      if (action === "activateStrategy")
        await expect(
          page
            .getByTestId(`strategy-P1-${dest.slice(9)}`)
            .locator(`[data-card-id="${cardId}"]`),
        ).toHaveCount(1);
      if (action === "playMonster")
        await expect(
          page.getByTestId("monster-P1").getByTestId("card"),
        ).toHaveAttribute("data-card-id", cardId);
      if (action === "gainRage") {
        await expect(page.getByTestId("rage-P1")).toHaveText(
          String(before.rage + 1),
        );
        await expect(page.getByTestId("discard-count-P1")).toHaveText(
          String(before.discard + 1),
        );
      }
      if (action === "invade") {
        await expect(page.getByTestId("discard-count-P1")).toHaveText(
          String(before.discard + 1),
        );
        await expect.poll(() => monsterZone(page)).not.toBe(before.zone);
      }
    });

test("Esc cancels a selection; clicking the card again cancels too", async ({
  page,
}) => {
  await hotseat(page, 2, 1);
  const card = handCards(page)
    .and(page.locator('[data-playable="true"]'))
    .first();
  await card.click();
  await expect(card).toHaveAttribute("data-selected", "true");
  expect(await lit(page).count()).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(lit(page)).toHaveCount(0);
  await expect(card).not.toHaveAttribute("data-selected", "true");
  await card.click();
  await expect(card).toHaveAttribute("data-selected", "true");
  await card.click();
  await expect(lit(page)).toHaveCount(0);
});

test("an illegal drop does nothing: the card returns to the hand", async ({
  page,
}) => {
  await hotseat(page, 2, 1);
  const { card, cardId } = await cardFor(page, "zone:");
  const handBefore = await count(page.getByTestId("your-hand-count"));
  const inHandBefore = await inHand(page, cardId);
  // The opponent's zone and an unlit zone of your own are not destinations.
  await drag(page, card, page.getByTestId("zone-P2-3"));
  await expect(lit(page)).toHaveCount(0);
  await drag(page, card, page.getByTestId("sidebar"));
  await expect(lit(page)).toHaveCount(0);
  expect(await count(page.getByTestId("your-hand-count"))).toBe(handBefore);
  expect(await inHand(page, cardId)).toBe(inHandBefore);
  await expect(page.getByTestId("turn")).toHaveText("2");
});

test("a hand of 10: every card's name is visible and the strip doesn't scroll", async ({
  page,
}) => {
  await hotseat(page, 1, 8);
  await expect(page.getByTestId("your-hand-count")).toHaveText("10");
  const names = page.getByTestId("hand-strip").getByTestId("card-name");
  await expect(names).toHaveCount(10);
  const cards = handCards(page);
  for (let i = 0; i < 10; i++) {
    await expect(names.nth(i)).toBeVisible();
    const name = await names.nth(i).boundingBox();
    const next = i < 9 ? await cards.nth(i + 1).boundingBox() : null;
    // No later card covers this name.
    if (name && next)
      expect(name.x + name.width).toBeLessThanOrEqual(next.x + 0.5);
  }
  const strip = await page
    .getByTestId("hand-strip")
    .evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(strip[0]).toBeLessThanOrEqual(strip[1] as number);
  const doc = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(doc[0]).toBeLessThanOrEqual(doc[1] as number);
});

test("preview: hovering a card shows it; hovering an opponent card back shows nothing", async ({
  page,
}) => {
  await hotseat(page, 2, 1);
  const first = handCards(page).first().getByTestId("card");
  await first.hover();
  await expect(page.getByTestId("card-preview")).toHaveAttribute(
    "data-card-id",
    (await first.getAttribute("data-card-id")) ?? "",
  );
  await page.getByTestId("monster-P1").getByTestId("card").hover();
  await expect(page.getByTestId("card-preview")).toBeVisible();
  await expect(page.getByTestId("preview-values")).toContainText("threat");
  await page.getByTestId("opponent-card-back").first().hover();
  await expect(page.getByTestId("card-preview")).toHaveCount(0);
});

test("while the bot decides, the hand is locked: dimmed, no selection", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("2");
  await page.getByTestId("start-game").click();
  // Seed 2: the bot (P2) starts.
  await expect(page.getByTestId("your-hand")).toHaveAttribute(
    "data-locked",
    "true",
  );
  await expect(
    page.locator('[data-testid="hand-card"][data-playable="true"]'),
  ).toHaveCount(0);
  await handCards(page).first().click({ force: true });
  await expect(lit(page)).toHaveCount(0);
  await expect(page.getByTestId("your-hand")).toHaveAttribute(
    "data-locked",
    "false",
    { timeout: 60_000 },
  );
  expect(
    await page
      .locator('[data-testid="hand-card"][data-playable="true"]')
      .count(),
  ).toBeGreaterThan(0);
});

test("a card that can only invade or gain rage is not lit, but selecting it still lights the discard pile", async ({
  page,
}) => {
  await hotseat(page, 2, 1);
  // Seed 2, turn 2: Godzilla (2023) R5 battle cards are above the rank limit (8.2.1).
  const unlit = handCards(page).and(
    page.locator('[data-playable="true"][data-hand-lit="false"]'),
  );
  expect(await unlit.count()).toBeGreaterThan(0);
  expect(
    await handCards(page).and(page.locator('[data-hand-lit="true"]')).count(),
  ).toBeGreaterThan(0);
  await unlit.first().click();
  await expect(unlit.first()).toHaveAttribute("data-selected", "true");
  const targets = await lit(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-target")),
  );
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) expect(["discard", "rage"]).toContain(target);
});

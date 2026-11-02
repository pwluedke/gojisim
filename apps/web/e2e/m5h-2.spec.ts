import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { loadFixture, visibleCenter, importInDeckbuilder } from "./helpers";

/** M5h-2: the battle log, rules, undo history, stack viewer, invade arrow, prompts and fixes. */

test.use({ viewport: { width: 1440, height: 900 } });

test('public stacks say "click to view" in the app\'s tooltip; the discard top card still previews; decks have no tip', async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const tooltip = page.getByTestId("tooltip");
  const cases: [string, string][] = [
    ["discard-P1", "Discard pile: click to view"],
    ["discard-P2", "Discard pile: click to view"],
    ["monster-P1", "Monster stack: click to view"],
    ["monster-P2", "Monster stack: click to view"],
  ];
  // A battle card stack in a zone (either side) names its zone.
  const zone = page.locator('[data-view-tip^="Zone "]').first();
  const zoneId = (await zone.getAttribute("data-testid")) ?? "";
  const zoneNumber = zoneId.split("-").at(-1);
  cases.push([zoneId, `Zone ${zoneNumber} stack: click to view`]);
  for (const [id, text] of cases) {
    await page.mouse.move(0, 0);
    await expect(tooltip, id).toHaveCount(0);
    // Hover a corner of the area clear of any monster card in the same zone.
    const target = page.getByTestId(id);
    await target.hover({ position: { x: 4, y: 4 } });
    await expect(tooltip, id).toHaveText(text);
  }
  // The deck, the monster deck and empty strategy zones open nothing, so they have no tip.
  for (const id of ["deck-P1", "monster-deck-P1", "strategy-P1-1"]) {
    await page.mouse.move(0, 0);
    await page.getByTestId(id).hover();
    await expect(tooltip, id).toHaveCount(0);
  }
  // The discard pile's top card previews on hover again, beside the tip.
  await page.getByTestId("discard-P1").getByTestId("card").hover();
  await expect(page.getByTestId("card-preview")).toBeVisible();
  await expect(tooltip).toHaveText("Discard pile: click to view");
});

for (const width of [1280, 1440, 1920])
  test(`the new-game seats stay inside the screen with a 100-character deck name at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const name = "A".repeat(59) + " very long deck name that goes on and on.";
    expect(name).toHaveLength(100);
    const list = readFileSync(
      new URL(
        "../../../packages/cards/data/decks/esd01-starter.txt",
        import.meta.url,
      ),
      "utf8",
    );
    await importInDeckbuilder(page, list, name);
    await page.goto("/play");
    // The saved deck in both seats.
    await page
      .getByTestId("deck-P1")
      .selectOption(
        (await page
          .getByTestId("deck-P1")
          .locator("option", { hasText: "AAAA" })
          .getAttribute("value")) ?? "",
      );
    const option = page
      .getByTestId("deck-P2")
      .locator("option", { hasText: "AAAA" });
    await page
      .getByTestId("deck-P2")
      .selectOption((await option.getAttribute("value")) ?? "");
    const form = await page.locator("form").first().boundingBox();
    for (const id of ["seat-panel-P1", "seat-panel-P2", "deck-P1", "deck-P2"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box?.x ?? -1, id).toBeGreaterThanOrEqual((form?.x ?? 0) - 1);
      expect((box?.x ?? 0) + (box?.width ?? 0), id).toBeLessThanOrEqual(
        (form?.x ?? 0) + (form?.width ?? 0) + 1,
      );
    }
    // The option is cut to 40 characters plus "…", with the full name in its title and under the
    // select once picked.
    expect((await option.textContent())?.trim()).toBe(
      `${name.slice(0, 40).trimEnd()}…`,
    );
    await expect(option).toHaveAttribute("title", name);
    await expect(page.getByTestId("deck-name-P2")).toHaveText(name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

test("#4 log lines carry the acting player's color and an event tag; turn markers are bold dividers", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const mine = page.locator('[data-testid="log-line"][data-side="you"]');
  const theirs = page.locator('[data-testid="log-line"][data-side="opp"]');
  expect(await mine.count()).toBeGreaterThan(0);
  expect(await theirs.count()).toBeGreaterThan(0);
  const border = (l: typeof mine) =>
    l.first().evaluate((el) => getComputedStyle(el).borderLeftColor);
  expect(await border(mine)).not.toBe(await border(theirs));
  for (const tag of ["draw", "play", "rage", "invade"])
    expect(
      await page.locator(`[data-testid="log-line"][data-tag="${tag}"]`).count(),
      tag,
    ).toBeGreaterThan(0);
  const tag = page.getByTestId("log-tag").first();
  expect(
    await tag.evaluate((el) => getComputedStyle(el, "::before").content),
  ).toMatch(/^"[A-Z][a-z]+"$/);
  const turn = page.getByTestId("log-turn").first();
  expect(
    Number(await turn.evaluate((el) => getComputedStyle(el).fontWeight)),
  ).toBeGreaterThanOrEqual(700);
  expect(await turn.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe(
    "3px",
  );
});

test("#7 dragging a card over your discard pile draws the invade arrow, one arc per zone; the setting turns it off", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const drag = async () => {
    const card = page.getByTestId("hand-card").first();
    const discard = page.getByTestId("discard-P1");
    const a = await visibleCenter(page, card);
    const b = await visibleCenter(page, discard);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 20, a.y - 10, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 10 });
  };
  await drag();
  const arcs = page.getByTestId("invade-arc");
  expect(await arcs.count()).toBeGreaterThanOrEqual(1);
  // The first hop starts at my monster's zone (zone 4 here) and lands on the next one.
  await expect(arcs.first()).toHaveAttribute("data-to", "5");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("invade-arrow")).toHaveCount(0);
  await page.getByTestId("settings").click();
  await page.getByTestId("setting-invade-arrow").uncheck();
  await page.getByTestId("settings").click();
  await drag();
  await expect(page.getByTestId("invade-arc")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

test("#9 clicking a public stack opens the read-only stack viewer; Esc or Space closes it; decks stay hidden", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const count = Number(
    await page.getByTestId("discard-count-P1").textContent(),
  );
  await page.getByTestId("discard-P1").click();
  const viewer = page.getByTestId("stack-viewer");
  await expect(viewer).toHaveAttribute("data-area", "discard");
  await expect(page.getByTestId("stack-heading")).toHaveText(
    `Your discard pile (${count})`,
  );
  await expect(page.getByTestId("stack-card")).toHaveCount(count);
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  // The bot's discard pile and the monster stack too; Space closes and doesn't Pass.
  await page.getByTestId("discard-P2").click();
  await expect(page.getByTestId("stack-heading")).toContainText(
    "Bot's discard pile",
  );
  await page.keyboard.press(" ");
  await expect(viewer).toHaveCount(0);
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await page.getByTestId("monster-P1").click();
  await expect(viewer).toHaveAttribute("data-area", "monster");
  await expect(page.getByTestId("stack-position").first()).toHaveText("Top");
  await page.getByTestId("stack-close").click();
  // A deck never opens.
  await page.getByTestId("deck-P1").click();
  await expect(viewer).toHaveCount(0);
});

test('#10 an undo is listed as a dimmed "Undone" line with Show undone actions on', async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const cards = page.getByTestId("hand-card");
  for (let i = 0; i < (await cards.count()); i++) {
    await cards.nth(i).click();
    const rage = page.locator('[data-lit][data-target="rage"]');
    if (await rage.count()) {
      await rage.first().click();
      break;
    }
    await page.keyboard.press("Escape");
  }
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("log-undone")).toHaveCount(0);
  await page.getByTestId("settings").click();
  await page.getByTestId("setting-show-undone").check();
  const undone = page.getByTestId("log-undone");
  await expect(undone).toHaveCount(1);
  await expect(undone).toHaveText(/^Undone: You: /);
  expect(await undone.evaluate((el) => getComputedStyle(el).fontStyle)).toBe(
    "italic",
  );
});

test("#11 a rule number in the log shows the rule's text and opens the rules panel at it", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.getByTestId("settings").click();
  await page.getByTestId("setting-rules").check();
  await page.getByTestId("settings").click();
  const link = page
    .locator('[data-testid="rule-link"][data-rule="7.2.2"]')
    .last();
  await link.hover();
  await expect(page.getByTestId("tooltip")).toContainText(
    "7.2.2 The turn player draws a number of cards",
  );
  await link.click();
  await expect(page.getByTestId("rules-panel")).toBeVisible();
  const at = page.getByTestId("rule-at");
  await expect(at).toHaveAttribute("data-rule", "7.2.2");
  await expect(at).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rules-panel")).toHaveCount(0);
});

test("#16 a yes/no prompt says what Yes does in plain words, then the printed text", async ({
  page,
}) => {
  await loadFixture(page, "confirm");
  await expect(page.getByTestId("confirm-sentence")).toHaveText(
    /^Yes: Evolve this card: search your deck for a rank 5 or lower \[Mothra\] battle card and play it on top of this card\.$/,
  );
  await expect(page.getByTestId("confirm-text")).toContainText("[evolution");
});

test("#16 an [invading] prompt names its step; with no words from the data, the printed text shows alone", async ({
  page,
}) => {
  await loadFixture(page, "confirm-invading");
  await expect(page.getByTestId("confirm-step")).toHaveText(
    /^Invading step \d of \d$/,
  );
  await expect(page.getByTestId("confirm-sentence")).toHaveCount(0);
  await expect(page.getByTestId("confirm-text")).toContainText("[invading]");
});

import { expect, test } from "@playwright/test";

test("debug viewer: 3 pass-only turns, step back, export and import", async ({
  page,
}) => {
  await page.goto("/debug");
  await expect(page.getByTestId("debug-banner")).toHaveText(
    "Debug: hidden info visible",
  );

  await page.getByTestId("seed-input").fill("20261021");
  await page.getByTestId("deck-P1").selectOption({ label: "ESD01 official" });
  await page.getByTestId("deck-P2").selectOption({ label: "ESD02 official" });
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("status-turn")).toHaveText("1");
  await expect(page.getByTestId("status-step")).toHaveText("7.3.2");

  for (let turn = 1; turn <= 3; turn++) {
    await page.getByRole("button", { name: "Pass", exact: true }).click();
    await expect(page.getByTestId("status-turn")).toHaveText(String(turn + 1));
  }

  // Turn 4 main phase: the turn player started with 5 and drew 1 in each of their 2 start phases
  // (7.2.2, the opponent's monster is rank I); 7.5.4 never draws with 5 or more cards in hand.
  const turnPlayer =
    (await page.getByTestId("status-turn-player").textContent()) ?? "";
  await expect(page.getByTestId(`hand-count-${turnPlayer}`)).toHaveText("7");
  await expect(page.getByTestId("position")).toHaveText("3");

  await page.getByTestId("step-back").click();
  await expect(page.getByTestId("status-turn")).toHaveText("3");
  await expect(page.getByTestId("position")).toHaveText("2");
  const status = await page.getByTestId("status").textContent();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export").click(),
  ]);
  const file = await download.path();

  // Start a different game so the import has something to replace.
  await page.getByTestId("seed-input").fill("1");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("status-turn")).toHaveText("1");

  await page.getByTestId("import-file").setInputFiles(file);
  await expect(page.getByTestId("status")).toHaveText(status ?? "");
  await expect(page.getByTestId("position")).toHaveText("2");
});

test("debug viewer: the card detail drawer leaves the step controls and log usable; Esc closes it", async ({
  page,
}) => {
  await page.goto("/debug");
  await page.getByTestId("seed-input").fill("20261021");
  await page.getByTestId("start-game").click();
  await page.getByRole("button", { name: "Pass", exact: true }).click();
  await expect(page.getByTestId("status-turn")).toHaveText("2");

  // Open a card from a hand.
  await page.locator("[data-testid=player-P1] button").first().click();
  const drawer = page.getByTestId("card-detail");
  await expect(drawer).toBeVisible();
  // Each card shows its ability status (format.md): implemented, partial or manual.
  await expect(page.getByTestId("card-ability-status")).toHaveText(
    /^Abilities: (implemented|partial|manual)/,
  );

  // Nothing is covered: the drawer and the step controls / log do not overlap, and Step back
  // can be clicked while the drawer is open (Playwright refuses to click a covered element).
  const drawerBox = await drawer.boundingBox();
  for (const id of ["step-back", "log"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box && drawerBox && box.x + box.width <= drawerBox.x).toBe(true);
  }
  await page.getByTestId("step-back").click();
  await expect(page.getByTestId("status-turn")).toHaveText("1");
  await expect(drawer).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

const SAMPLE_DECKS = `# Made-up decks for the e2e test
[deck] Sample/Legal Red
[monster deck]
1 ESD01-001
1 ESD01-002
1 ESD01-003
1 ESD01-004
[main deck]
2 ESD01-002
4 ESD01-005
2 ESD01-003
4 ESD01-006
2 ESD01-004
4 ESD01-007
4 ESD01-008
4 ESD01-009
4 ESD01-011
4 ESD01-010
4 ESD01-012
2 ESD01-016
4 ESD01-013
2 ESD01-014
4 ESD01-015

[deck] Sample/Too Small
[monster deck]
1 ESD02-001
1 ESD02-002
1 ESD02-003
1 ESD02-004
[main deck]
4 ESD02-007
4 ESD02-008
`;

test("debug viewer: import deck lists, legality shown, illegal deck warning, remembered, export", async ({
  page,
}) => {
  await page.goto("/debug");
  // The official starters come first and are legal.
  await expect(page.getByTestId("deck-legality").first()).toHaveText("Legal");

  await page.getByTestId("import-deck-list").setInputFiles({
    name: "sample-decks.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(SAMPLE_DECKS),
  });
  const p1 = page.getByTestId("deck-P1");
  await expect(
    p1.locator("option", { hasText: "Sample/Legal Red ✓ legal" }),
  ).toHaveCount(1);
  await expect(
    p1.locator("option", { hasText: "Sample/Too Small ✗ 6.1.1.2" }),
  ).toHaveCount(1);

  await p1.selectOption({ label: "Sample/Too Small ✗ 6.1.1.2" });
  await expect(page.getByTestId("deck-legality").first()).toContainText(
    "Illegal: 6.1.1.2",
  );
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("illegal-deck-banner")).toContainText(
    "P1: 6.1.1.2",
  );
  await expect(page.getByTestId("status-step")).toHaveText("7.3.2");

  // Remembered in this browser.
  await page.reload();
  await expect(
    page
      .getByTestId("deck-P2")
      .locator("option", { hasText: "Sample/Legal Red" }),
  ).toHaveCount(1);

  await page
    .getByTestId("deck-P1")
    .selectOption({ label: "Sample/Legal Red ✓ legal" });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-deck-list").click(),
  ]);
  const text = await (
    await import("node:fs/promises")
  ).readFile((await download.path()) as string, "utf8");
  expect(text).toContain("[deck] Sample/Legal Red");
  expect(text).toContain("[deck] Starter Deck - Heisei Series Godzilla");
});

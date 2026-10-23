import { expect, type Page, test } from "@playwright/test";
import { passTurn, startGame } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/** The areas of one mat row (0 = top of that mat on screen), left to right on screen. */
async function matRow(page: Page, side: "opp" | "you", row: number) {
  const cells = page.getByTestId(`mat-${side}`).getByTestId("mat-cell");
  const items: { area: string; x: number }[] = [];
  for (let i = 0; i < (await cells.count()); i++) {
    const cell = cells.nth(i);
    const top = Number(await cell.getAttribute("data-row"));
    const rows = Number(await cell.getAttribute("data-rows"));
    if (row < top || row >= top + rows) continue;
    items.push({
      area: (await cell.getAttribute("data-area")) ?? "",
      x: (await cell.boundingBox())?.x ?? 0,
    });
  }
  return items.sort((a, b) => a.x - b.x).map((item) => item.area);
}

async function startFromMenu(
  page: Page,
  entry: "menu-play-bot" | "menu-hotseat",
) {
  await page.goto("/");
  await page.getByTestId(entry).click();
  await page.getByTestId("seed-input").fill("20261022");
  await startGame(page);
  await expect(page.getByTestId("board")).toBeVisible();
}

test("the / menu reaches Play vs bot, Hotseat and Debug", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("menu-play-bot").click();
  await expect(
    page.getByRole("heading", { name: "Play vs bot" }),
  ).toBeVisible();
  await expect(page.getByTestId("seat-P1")).toHaveValue("human");
  await expect(page.getByTestId("seat-P2")).toHaveValue("bot");
  await expect(page.getByTestId("difficulty-value-P2")).toHaveText(
    "55 (Medium)",
  );

  await page.goto("/");
  await page.getByTestId("menu-hotseat").click();
  await expect(page.getByRole("heading", { name: "Hotseat" })).toBeVisible();
  await expect(page.getByTestId("seat-P1")).toHaveValue("human");
  await expect(page.getByTestId("seat-P2")).toHaveValue("human");

  await page.goto("/");
  await page.getByTestId("menu-debug").click();
  await expect(page.getByTestId("debug-banner")).toBeVisible();
});

test("Play vs bot: both mats copy the official playmat, the opponent's rotated 180°", async ({
  page,
}) => {
  await startFromMenu(page, "menu-play-bot");
  // The opponent's mat, from the top of the screen.
  expect(await matRow(page, "opp", 0)).toEqual([
    "discard",
    "Z5",
    "Z4",
    "Z3",
    "Z2",
    "Z1",
    "monsterDeck",
  ]);
  expect(await matRow(page, "opp", 1)).toEqual([
    "deck",
    "Z6",
    "Z7",
    "rage",
    "Strategy 2",
  ]);
  expect(await matRow(page, "opp", 2)).toEqual(["Z8", "rage", "Strategy 1"]);
  // Your mat, from the center line down.
  expect(await matRow(page, "you", 0)).toEqual(["Strategy 1", "rage", "Z8"]);
  expect(await matRow(page, "you", 1)).toEqual([
    "Strategy 2",
    "rage",
    "Z7",
    "Z6",
    "deck",
  ]);
  expect(await matRow(page, "you", 2)).toEqual([
    "monsterDeck",
    "Z1",
    "Z2",
    "Z3",
    "Z4",
    "Z5",
    "discard",
  ]);
  const box = async (id: string) => {
    const b = await page.getByTestId(id).boundingBox();
    if (!b) throw new Error(`no box for ${id}`);
    return b;
  };
  const col = async (id: string) => {
    const b = await box(id);
    return [Math.round(b.x), Math.round(b.width)];
  };
  // The two zone 8s face each other across the center line, in column 3.
  expect(await col("zone-P2-8")).toEqual(await col("zone-P1-8"));
  expect((await box("zone-P2-8")).y).toBeLessThan((await box("zone-P1-8")).y);
  // Same column (4.4.5.4): your Z1 sits under their Z5 and Z6 (column 1).
  expect(await col("zone-P2-5")).toEqual(await col("zone-P1-1"));
  expect(await col("zone-P2-6")).toEqual(await col("zone-P1-1"));
  expect(await col("zone-P2-3")).toEqual(await col("zone-P1-3"));
  // The Rage zone spans two columns and two rows.
  const rage = await box("rage-zone-P1");
  const z8 = await box("zone-P1-8");
  expect(rage.width).toBeGreaterThan(z8.width * 2);
  expect(rage.height).toBeGreaterThan(z8.height * 2);
  // Deck, discard pile and monster deck are mat cells with their counts.
  await expect(page.getByTestId("deck-count-P1")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("discard-count-P1")).toHaveText("0");
  await expect(page.getByTestId("monster-deck-count-P2")).toHaveText(/^\d+$/);
  // The bottom side is the human's, and the board fits the window.
  await expect(page.getByTestId("board")).toHaveAttribute("data-bottom", "P1");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
});

test("the opponent's hand shows as card backs, as many as its count", async ({
  page,
}) => {
  await startFromMenu(page, "menu-play-bot");
  const count = Number(
    await page.getByTestId("opponent-hand-count").textContent(),
  );
  expect(count).toBeGreaterThan(0);
  await expect(page.getByTestId("opponent-card-back")).toHaveCount(count);
  await expect(
    page.getByTestId("opponent-hand").getByTestId("card"),
  ).toHaveCount(0);
});

test("hotseat: after Pass, the board flips to the next decider", async ({
  page,
}) => {
  await startFromMenu(page, "menu-hotseat");
  const board = page.getByTestId("board");
  const first = await board.getAttribute("data-bottom");
  const turnPlayer = first === "P1" ? "P2" : "P1";
  await passTurn(page);
  await expect(board).toHaveAttribute("data-bottom", turnPlayer);
  await expect(page.getByTestId("turn")).toHaveText("2");
});

test("bot vs bot on /play plays by itself, and Pause stops it", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seat-P1").selectOption("bot");
  await page.getByTestId("preset-P1-easy").click();
  await page.getByTestId("preset-P2-easy").click();
  await page.getByTestId("seed-input").fill("20261022");
  await startGame(page);
  await expect
    .poll(async () => Number(await page.getByTestId("turn").textContent()), {
      timeout: 60_000,
    })
    .toBeGreaterThanOrEqual(3);
  await page.getByTestId("bot-pause").click();
  await expect(page.getByTestId("bot-thinking")).toContainText("Paused");
  const turn = await page.getByTestId("turn").textContent();
  const step = await page.getByTestId("phase-tracker").textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("turn")).toHaveText(turn ?? "");
  await expect(page.getByTestId("phase-tracker")).toHaveText(step ?? "");
  await page.getByTestId("bot-play").click();
  await expect(page.getByTestId("bot-pause")).toBeVisible();
});

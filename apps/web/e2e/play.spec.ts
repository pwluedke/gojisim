import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

/** Zone labels of a board row, left to right on screen. */
async function rowLabels(page: Page, row: string): Promise<string[]> {
  const labels = page.getByTestId(row).getByTestId("zone-label");
  const items: { text: string; x: number }[] = [];
  for (let i = 0; i < (await labels.count()); i++) {
    const label = labels.nth(i);
    const box = await label.boundingBox();
    items.push({ text: (await label.textContent()) ?? "", x: box?.x ?? 0 });
  }
  return items.sort((a, b) => a.x - b.x).map((item) => item.text);
}

async function startFromMenu(
  page: Page,
  entry: "menu-play-bot" | "menu-hotseat",
) {
  await page.goto("/");
  await page.getByTestId(entry).click();
  await page.getByTestId("seed-input").fill("20261022");
  await page.getByTestId("start-game").click();
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

test("Play vs bot: 8 zones per side in spec geometry, the zone 8s facing each other", async ({
  page,
}) => {
  await startFromMenu(page, "menu-play-bot");
  expect(await rowLabels(page, "row-opp-back")).toEqual([
    "Z5",
    "Z4",
    "Z3",
    "Z2",
    "Z1",
  ]);
  expect(await rowLabels(page, "row-opp-front")).toEqual(["Z6", "Z7", "Z8"]);
  expect(await rowLabels(page, "row-you-near")).toEqual(["Z8", "Z7", "Z6"]);
  expect(await rowLabels(page, "row-you-far")).toEqual([
    "Z1",
    "Z2",
    "Z3",
    "Z4",
    "Z5",
  ]);
  // Same column (4.4.5.4): the zone 8s line up, and so do the zone 3s.
  const x = async (id: string) => (await page.getByTestId(id).boundingBox())?.x;
  expect(await x("zone-P2-8")).toBe(await x("zone-P1-8"));
  expect(await x("zone-P2-3")).toBe(await x("zone-P1-3"));
  expect(await x("zone-P2-5")).toBe(await x("zone-P1-1"));
  // The bottom side is the human's.
  await expect(page.getByTestId("board")).toHaveAttribute("data-bottom", "P1");
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
  await page.getByTestId("pass").click();
  await expect(board).toHaveAttribute("data-bottom", turnPlayer);
  await expect(page.getByTestId("turn")).toHaveText("2");
});

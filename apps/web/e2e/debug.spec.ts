import { expect, test } from "@playwright/test";

test("debug viewer: 3 pass-only turns, step back, export and import", async ({
  page,
}) => {
  await page.goto("/debug");
  await expect(page.getByTestId("debug-banner")).toHaveText(
    "Debug: hidden info visible",
  );

  await page.getByTestId("seed-input").fill("20261021");
  await page.getByTestId("deck-P1").selectOption("ESD01");
  await page.getByTestId("deck-P2").selectOption("ESD02");
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

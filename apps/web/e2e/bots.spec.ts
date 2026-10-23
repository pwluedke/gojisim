import { expect, type Page, test } from "@playwright/test";

/** Starts a game with the given seats ("human", or a bot preset), then sets the bot delay. */
async function start(
  page: Page,
  seats: { P1: string; P2: string },
  delay = "0",
) {
  await page.goto("/debug");
  await page.getByTestId("seed-input").fill("20261022");
  for (const id of ["P1", "P2"] as const) {
    if (seats[id] === "human") continue;
    await page.getByTestId(`seat-${id}`).selectOption("bot");
    await page.getByTestId(`preset-${id}-${seats[id]}`).click();
  }
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("status-turn")).toHaveText(/\d+/);
  await page.getByTestId("bot-delay").fill(delay);
  await expect(page.getByTestId("bot-delay-value")).toHaveText(delay);
}

const turn = async (page: Page) =>
  Number(await page.getByTestId("status-turn").textContent());

/** Takes P1's decisions (Pass when it can, else its first action) until it has passed `passes` times. */
async function humanPasses(page: Page, passes: number) {
  let passed = 0;
  const deadline = Date.now() + 90_000;
  while (passed < passes) {
    if (Date.now() > deadline) throw new Error(`only ${passed} passes`);
    const pass = page.getByRole("button", { name: "Pass", exact: true });
    if (await pass.isVisible()) {
      await pass.click();
      passed++;
      continue;
    }
    const actions = page.getByTestId("action");
    if ((await actions.count()) > 0) {
      await actions.first().click();
      continue;
    }
    await page.waitForTimeout(100);
  }
}

test("human vs Easy: the bot takes its turns, and its hidden cards show as card backs", async ({
  page,
}) => {
  await start(page, { P1: "human", P2: "easy" });
  await expect(page.getByTestId("hide-hidden")).toBeChecked();
  await expect(page.getByTestId("debug-banner")).toHaveText(
    "Hiding the bot's hidden cards: you see only P1's view",
  );
  await humanPasses(page, 3);
  await expect
    .poll(() => turn(page), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(4);
  // The bot played its own turns (each of its actions has a log label).
  await expect(page.getByTestId("bot-label").first()).toBeVisible();
  expect(await page.getByTestId("bot-label").count()).toBeGreaterThan(0);
  // Its hand is face down: one card back per card, plus the 3 other backs on its side. The bot
  // may still be playing, so read the count and the backs together until they agree.
  expect(
    Number(await page.getByTestId("hand-count-P2").textContent()),
  ).toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const hand = Number(
        await page.getByTestId("hand-count-P2").textContent(),
      );
      const backs = await page
        .getByTestId("player-P2")
        .getByTestId("card-back")
        .count();
      return backs - hand;
    })
    .toBe(3);
  // Unhiding shows its cards.
  await page.getByTestId("hide-hidden").uncheck();
  await expect(
    page.getByTestId("player-P2").getByTestId("card-back"),
  ).toHaveCount(0);
  await expect(page.getByTestId("debug-banner")).toHaveText(
    "Debug: hidden info visible",
  );
});

test("bot vs bot (Easy vs Easy, delay 0): Play runs the game to its end", async ({
  page,
}) => {
  await start(page, { P1: "easy", P2: "easy" });
  await page.getByTestId("bot-play").click();
  await expect(page.getByTestId("status-result")).not.toHaveText(
    "in progress",
    {
      timeout: 120_000,
    },
  );
});

test("Pause stops new bot actions", async ({ page }) => {
  await start(page, { P1: "easy", P2: "easy" }, "200");
  await page.getByTestId("bot-play").click();
  await expect
    .poll(
      async () => Number(await page.getByTestId("position").textContent()),
      {
        timeout: 60_000,
      },
    )
    .toBeGreaterThanOrEqual(3);
  await page.getByTestId("bot-pause").click();
  const paused = await page.getByTestId("position").textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("position")).toHaveText(paused ?? "");
  // Step plays exactly one bot action.
  await page.getByTestId("bot-step").click();
  await expect(page.getByTestId("position")).toHaveText(
    String(Number(paused) + 1),
  );
});

test("export, then import, of a human vs bot game restores the same state", async ({
  page,
}) => {
  await start(page, { P1: "human", P2: "easy" });
  await humanPasses(page, 2);
  // Wait for P1's next decision, so the bot isn't mid-thought.
  await expect(
    page.getByRole("button", { name: "Pass", exact: true }),
  ).toBeVisible({
    timeout: 60_000,
  });
  const status = await page.getByTestId("status").textContent();
  const position = await page.getByTestId("position").textContent();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export").click(),
  ]);
  const file = await download.path();
  await page.getByTestId("seed-input").fill("1");
  await page.getByTestId("seat-P2").selectOption("human");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("position")).toHaveText("0");
  await page.getByTestId("import-file").setInputFiles(file);
  await expect(page.getByTestId("status")).toHaveText(status ?? "");
  await expect(page.getByTestId("position")).toHaveText(position ?? "");
  // The seats came back: P2 is the Easy bot again.
  await expect(page.getByTestId("bot-controls")).toContainText("P2 Easy (20)");
});

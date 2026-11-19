import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * #478 (Bot Advisor, phase 2a): in a Kaiju Classroom game, at the player's own decision, the
 * Advisor panel shows the move the bot would make in the player's seat, the moves it weighed and
 * the rules behind it; Agree or Disagree (a reason from the list, "Other" with the player's words)
 * is kept, and the turn's answers are summed up. Nothing is played for the player. The seed gives
 * the player the first turn, so the advice comes at once. Explicit timeouts: a Level 100 search
 * can be slow while other work shares the machine.
 */

const ADVICE = 60_000;

async function classroomFirstTurn(page: Page) {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("478");
  await page.getByTestId("preset-P2-easy").click();
  await page.getByTestId("game-mode").selectOption("classroom");
  await page.getByTestId("start-game").click();
  // With this seed the second card is the first turn.
  await page.getByTestId("first-pick-card-1").click();
  await expect(page.getByTestId("first-pick-card-1")).toHaveAttribute(
    "data-face",
    "First",
  );
  await page.getByTestId("first-pick-continue").click();
  await expect(page.locator(".gojisim[data-classroom='true']")).toHaveCount(1);
  const panel = page.getByTestId("advisor");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("advisor-pick")).toContainText(
    "The bot would:",
    { timeout: ADVICE },
  );
  return panel;
}

test("Classroom advisor: the bot's move in your seat, with Agree kept in the turn's summary", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const panel = await classroomFirstTurn(page);
  await expect(page.getByTestId("advisor-turn-plan")).toContainText(
    "Turn plan",
  );
  await expect(page.getByTestId("advisor-why")).not.toBeEmpty();
  await page.getByTestId("advisor-win-tip").first().hover();
  await expect(page.getByTestId("advisor-win-tip").first()).toBeVisible();
  // Nov 19: "Copy text" puts the whole panel on the clipboard as plain text.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("advisor-copy").click();
  await expect(page.getByTestId("advisor-copy")).toHaveText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Turn plan");
  expect(copied).toContain("The bot would:");
  // Nothing has been played for the player: it's still their decision.
  await expect(page.getByTestId("prompt-step")).toContainText("your turn");
  await page.getByTestId("advisor-agree").click();
  await expect(page.getByTestId("advisor-answered")).toHaveText("You agreed.");
  await expect(page.getByTestId("advisor-agree")).toHaveCount(0);
  const summary = panel.getByTestId("advisor-summary");
  await expect(summary).toContainText(
    "This turn: 1 answered (1 agreed, 0 disagreed)",
  );
});

test("Classroom advisor: Disagree takes a reason; Other needs your words", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await classroomFirstTurn(page);
  await page.getByTestId("advisor-disagree").click();
  const reason = page.getByTestId("advisor-reason");
  await expect(reason.locator("option")).toHaveText([
    "Wrong card",
    "Wrong zone",
    "Wrong timing",
    "Other",
  ]);
  // Each reason has its own text box; it's needed only for Other.
  const send = page.getByTestId("advisor-send");
  await expect(page.getByTestId("advisor-note")).toBeVisible();
  await expect(send).toBeEnabled();
  await reason.selectOption("other");
  await expect(send).toBeDisabled();
  await page.getByTestId("advisor-note").fill("hold it for the counter");
  await send.click();
  await expect(page.getByTestId("advisor-answered")).toHaveText(
    "You disagreed (other: hold it for the counter).",
  );
  await expect(page.getByTestId("advisor-summary")).toContainText(
    "1 answered (0 agreed, 1 disagreed)",
  );
});

test("a normal game has no advisor", async ({ page }) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("478");
  await page.getByTestId("start-game").click();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("advisor")).toHaveCount(0);
  // Nov 19: the Test Site starts folded, like Settings; its title opens it.
  await expect(page.getByTestId("test-site")).toHaveAttribute(
    "data-open",
    "false",
  );
  await expect(page.getByTestId("report-bug")).toBeHidden();
  await page.getByTestId("test-site-toggle").click();
  await expect(page.getByTestId("report-bug")).toBeVisible();
});

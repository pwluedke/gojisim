import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * #365 Kaiju Classroom: picked next to the bot level; one bot turn played in the sandbox from the
 * bot's seat, submitted, played by the bot from the unchanged position, compared and rated Worse,
 * which files a Bad Bot! report with the record. One turn only, with explicit timeouts: a bot
 * turn can be slow while other work shares the machine.
 */

const BOT_TURN = 60_000;

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/**
 * The XILIEN CONTROL banner (Paul, Nov 15): it overlaps the player's mat and runs past its right
 * edge, and it covers none of the mat's areas (the counter power, the zones, the deck).
 */
async function expectBannerPlaced(page: Page) {
  const mat = await page.getByTestId("mat-you").boundingBox();
  const banner = await page.getByTestId("xilien-banner").boundingBox();
  if (!mat || !banner) throw new Error("no box");
  expect(intersects(banner, mat)).toBe(true);
  expect(banner.x + banner.width).toBeGreaterThan(mat.x + mat.width);
  const cells = page.getByTestId("mat-you").getByTestId("mat-cell");
  const areas = await cells.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        area: el.getAttribute("data-area"),
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      };
    }),
  );
  expect(areas.map((a) => a.area)).toContain("counter");
  for (const cell of areas)
    expect(intersects(banner, cell), `the banner covers ${cell.area}`).toBe(
      false,
    );
}

test("the mode picker sits with the bot level; a normal game stays a normal game", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  const mode = page.getByTestId("game-mode");
  await expect(mode).toHaveValue("game");
  await expect(mode.locator("option")).toHaveText([
    "Normal game",
    "Kaiju Classroom",
  ]);
  // Beside the bot level, in the bot's seat panel.
  await expect(
    page.getByTestId("seat-panel-P2").getByTestId("game-mode"),
  ).toBeVisible();
  // Started as it is, the game is a normal one: no Classroom flag, no sandbox.
  await page.getByTestId("start-game").click();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.locator(".gojisim[data-classroom]")).toHaveCount(0);
  await expect(page.getByTestId("classroom-banner")).toHaveCount(0);
  // Paul, Nov 16: the same game, the player's own view (P1's cards on the bottom mat): no banner.
  await expect(page.getByTestId("xilien-banner")).toHaveCount(0);
});

test("one Classroom bot turn: played in the sandbox, submitted, compared and rated Worse with a Bad Bot! report", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("365");
  await page.getByTestId("preset-P2-easy").click();
  await page.getByTestId("game-mode").selectOption("classroom");
  await page.getByTestId("start-game").click();
  // The human goes second, so the bot's first turn opens at once.
  await page.getByTestId("first-pick-card-0").click();
  const face = await page
    .getByTestId("first-pick-card-0")
    .getAttribute("data-face");
  await page.getByTestId("first-pick-continue").click();
  const root = page.locator(".gojisim[data-classroom='true']");
  await expect(root).toHaveCount(1);
  if (face === "First") {
    await page.getByTestId("pass").click();
    await page.getByTestId("confirm-yes").click();
  }

  // The sandbox: the bot's seat at the bottom, the player's own hand hidden (card backs).
  await expect(root).toHaveAttribute("data-classroom-stage", "sandbox", {
    timeout: BOT_TURN,
  });
  await expect(page.getByTestId("classroom-banner")).toContainText(
    "Nothing here changes the game",
  );
  await expect(page.getByTestId("prompt-step")).toContainText("your turn");
  await expect(page.getByTestId("opponent-hand-count")).toBeVisible();
  await expect(page.getByTestId("concede")).toHaveCount(0);
  // Paul, Nov 15: "XILIEN CONTROL" over the mat for the whole bot turn; it takes no pointer
  // events, so the cards under it can be hovered and clicked.
  const xilien = page.getByTestId("xilien-banner");
  await expect(xilien).toContainText("XILIEN CONTROL");
  await expect(xilien).toContainText("You are playing as the bot");
  await expect(xilien).toHaveCSS("pointer-events", "none");
  // Paul, Nov 15: on the mat the player plays on (the bottom one), in the open strip at its top
  // right of the counter power, running past the mat's right edge; at both window sizes.
  await expect(
    page.getByTestId("mat-you").getByTestId("xilien-banner"),
  ).toHaveCount(1);
  await expectBannerPlaced(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expectBannerPlaced(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Submit: end the bot's main phase without a play (the bot's own turn makes some).
  await page.getByTestId("pass").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText(
    "submit your turn",
  );
  await page.getByTestId("confirm-yes").click();
  await expect(page.getByTestId("classroom-banner")).toHaveCount(0);

  // The bot plays its own turn from the position, then the two are compared.
  const compare = page.getByTestId("classroom-compare");
  await expect(compare).toBeVisible({ timeout: BOT_TURN });
  await expect(root).toHaveAttribute("data-classroom-stage", "compare");
  await expect(page.getByTestId("classroom-player-moves")).toContainText(
    "Pass",
  );
  await expect(
    page.getByTestId("classroom-bot-moves").locator("li").first(),
  ).toBeVisible();
  await expect(page.getByTestId("classroom-differences")).toContainText(
    "Bot's",
  );

  // Paul, Nov 15: Hide folds the comparison to a bar; the board can be looked at (a hovered card
  // shows its preview) while the game still waits; Show brings it back as it was.
  await page.getByTestId("classroom-hide").click();
  await expect(compare).toHaveCount(0);
  await expect(page.getByTestId("classroom-bar")).toContainText(
    "Kaiju Classroom: rate the bot's turn",
  );
  // Paul, Nov 16: back on the player's own view (their cards on the bottom mat), no banner.
  await expect(xilien).toHaveCount(0);
  await expect(root).toHaveAttribute("data-classroom-stage", "compare");
  await page.locator('[data-testid="hand-card"]').first().hover();
  await expect(page.getByTestId("card-preview")).toBeVisible();
  await page.getByTestId("classroom-show").click();
  await expect(compare).toBeVisible();
  await expect(page.getByTestId("classroom-bar")).toHaveCount(0);

  // Worse asks why and files a Bad Bot! report with the record, like the in-game button.
  await page.getByTestId("classroom-rate-worse").click();
  const modal = page.getByTestId("badBot-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByTestId("bad-bot-move")).toContainText(/Turn \d+, /);
  await page.getByTestId("report-name").fill("Dr. Serizawa");
  await page.getByTestId("report-text").fill("It should have passed.");
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().endsWith("/api/games") && r.method() === "POST",
    ),
    page.getByTestId("report-submit").click(),
  ]);
  await expect(page.getByTestId("test-site-note")).toHaveText("Thanks, sent.");
  await expect(compare).toHaveCount(0);
  const record = JSON.parse(request.postData() ?? "{}") as {
    classroom?: boolean;
    excludedFromAchievements?: boolean;
    actions: { type: string; player: string }[];
    classroomTurns: {
      actionIndex: number;
      playerActions: { type: string }[];
      botEndIndex: number;
      same: boolean;
      rating: string;
      reason: string;
    }[];
    botFeedback: {
      kind: string;
      actionIndex: number;
      classroomTurn: number;
    }[];
  };
  expect(record.classroom).toBe(true);
  expect(record.excludedFromAchievements).toBe(true);
  const [turn] = record.classroomTurns;
  expect(turn).toMatchObject({
    same: false,
    rating: "worse",
    reason: "It should have passed.",
    playerActions: [{ type: "pass" }],
  });
  // The real game holds the bot's own turn from the position, never the player's sandbox pass.
  const own = record.actions.slice(
    turn?.actionIndex,
    (turn?.botEndIndex ?? 0) + 1,
  );
  expect(own.some((a) => a.type !== "pass")).toBe(true);
  expect(record.botFeedback[0]).toMatchObject({
    kind: "bad",
    actionIndex: turn?.actionIndex,
    classroomTurn: 0,
  });
  // Then the game goes on: the bot's turn ends and the player plays their own.
  await expect(page.getByTestId("prompt-step")).toContainText("your turn", {
    timeout: BOT_TURN,
  });
  await expect(root).not.toHaveAttribute("data-classroom-stage", /.+/);
  // The player's own turn: no banner.
  await expect(xilien).toHaveCount(0);

  // Paul, Nov 15: the same play opens the same window. The record again, with the turn unrated
  // and the player's sandbox moves set to the bot's own, so the two end positions match.
  const sameRecord = JSON.parse(request.postData() ?? "{}") as Record<
    string,
    unknown
  >;
  const {
    rating: _r,
    reason: _w,
    botEndIndex: _b,
    same: _s,
    ...open
  } = turn as NonNullable<typeof turn>;
  sameRecord["classroomTurns"] = [{ ...open, playerActions: own as unknown[] }];
  sameRecord["botFeedback"] = [];
  const loadSame = async () => {
    await page.goto("/play?mode=bot");
    await page.getByTestId("load-record").setInputFiles({
      name: "classroom-same.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(sameRecord)),
    });
  };
  await loadSame();
  const same = page.getByTestId("classroom-same");
  await expect(same).toBeVisible({ timeout: BOT_TURN });
  await expect(page.getByTestId("classroom-same-text")).toHaveText(
    "The bot made the same play you did.",
  );
  await expect(same).toContainText("Press Space to continue.");
  await expect(page.getByTestId("classroom-compare")).toHaveCount(0);
  await expect(xilien).toHaveCount(0);
  // Hide works as on the difference window; the game waits.
  await page.getByTestId("classroom-hide").click();
  await expect(same).toHaveCount(0);
  await expect(page.getByTestId("classroom-bar")).toContainText(
    "the bot made the same play you did",
  );
  await expect(root).toHaveAttribute("data-classroom-stage", "compare");
  await expect(xilien).toHaveCount(0);
  await page.getByTestId("classroom-show").click();
  await expect(same).toBeVisible();
  // Space continues (as Continue does): the turn is rated "same" and the game goes on.
  await page.keyboard.press("Space");
  await expect(same).toHaveCount(0);
  await expect(page.getByTestId("prompt-step")).toContainText("your turn", {
    timeout: BOT_TURN,
  });
  await expect(root).not.toHaveAttribute("data-classroom-stage", /.+/);
  await expect(xilien).toHaveCount(0);

  // The Continue button does the same.
  await loadSame();
  await expect(same).toBeVisible({ timeout: BOT_TURN });
  await page.getByTestId("classroom-continue").click();
  await expect(same).toHaveCount(0);
  await expect(page.getByTestId("prompt-step")).toContainText("your turn", {
    timeout: BOT_TURN,
  });
});

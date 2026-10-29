import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loadFixture } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * M13b: the Test Site panel (Bad Bot!, Report bug, Test settings), the record upload at game end
 * and with Bad Bot!, Show opponent's hand mid-game, and the server's Test Site switch. The dev
 * server stores uploads in `apps/web/e2e-records/` (playwright.config.ts).
 */

const RECORDS = new URL("../e2e-records/", import.meta.url).pathname;

/** Every uploaded record's text. */
function uploads(): string[] {
  if (!existsSync(RECORDS)) return [];
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory()
        ? walk(path)
        : [readFileSync(path, "utf8")];
    });
  return walk(RECORDS);
}

/** The uploaded records whose text holds `marker`, parsed. */
const uploadsWith = (marker: string) =>
  uploads()
    .filter((text) => text.includes(marker))
    .map((text) => JSON.parse(text) as Record<string, unknown>);

/** A text no other test or run uses, to find this test's upload. */
const marker = (name: string) =>
  `${name} ${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Fills a Bad Bot! or Report bug popup. */
async function fill(page: Page, name: string, text: string) {
  await page.getByTestId("report-name").fill(name);
  await page.getByTestId("report-text").fill(text);
}

/** Report bug's Send: the record it uploads, parsed. */
async function reportBug(page: Page, text = "the board froze") {
  await page.getByTestId("report-bug").click();
  await fill(page, "Dr. Serizawa", text);
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().endsWith("/api/games") && r.method() === "POST",
    ),
    page.getByTestId("report-submit").click(),
  ]);
  await expect(page.getByTestId("test-site-note")).toHaveText("Thanks, sent.");
  return JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
}

async function concede(page: Page) {
  await page.getByTestId("concede").click();
  await page.getByTestId("confirm-yes").click();
  await expect(page.getByTestId("game-over-modal")).toBeVisible();
}

test("the panel: Bad Bot! and Report bug show with Test settings folded; open and closed is saved", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const panel = page.getByTestId("test-site");
  await expect(panel).toContainText("Test Site");
  await expect(panel.getByTestId("trefoil")).toHaveCount(2);
  await expect(panel.getByTestId("bad-bot")).toHaveText("Bad Bot!");
  await expect(panel.getByTestId("report-bug")).toHaveText("Report bug");
  // Folded by default: the settings and the help are out of sight.
  await expect(page.getByTestId("setting-share-games")).toBeHidden();
  await page.getByTestId("test-settings").click();
  await expect(page.getByTestId("setting-share-games")).toBeChecked();
  await expect(panel).toContainText(
    "Sends the game record, including both decks, to the GojiSim server.",
  );
  await expect(page.getByTestId("show-opponent-hand")).toBeVisible();
  // The help opens to its two paragraphs.
  await expect(page.getByTestId("which-button-bad-bot")).toBeHidden();
  await page.getByTestId("which-button").click();
  await expect(page.getByTestId("which-button-bad-bot")).toContainText(
    "Bad Bot! The bot made a bad move.",
  );
  await expect(page.getByTestId("which-button-report-bug")).toContainText(
    "Report bug: something in the game itself is wrong",
  );
  // Both stay open after a reload, and fold again.
  await loadFixture(page, "hand-five");
  await expect(page.getByTestId("setting-share-games")).toBeVisible();
  await expect(page.getByTestId("which-button-bad-bot")).toBeVisible();
  await page.getByTestId("test-settings").click();
  await loadFixture(page, "hand-five");
  await expect(page.getByTestId("setting-share-games")).toBeHidden();
  // Share finished games and Show opponent's hand left Settings and the new-game screen.
  await page.getByTestId("settings").click();
  await expect(
    page.locator("details").filter({ hasText: "Bot delay" }),
  ).not.toContainText("Share finished games");
  await page.goto("/play");
  await expect(page.getByTestId("show-opponent-hand")).toHaveCount(0);
});

test("Report bug: a popup needs a name and a text, Esc cancels, and Send uploads the record with the report; the name is pre-filled next time", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.getByTestId("report-bug").click();
  const modal = page.getByTestId("bug-modal");
  await expect(modal).toContainText("What went wrong?");
  await expect(modal).toContainText("What happened, and what did you expect?");
  await expect(page.getByTestId("report-name")).toHaveAttribute(
    "placeholder",
    "Dr. Serizawa? Put your name here",
  );
  const submit = page.getByTestId("report-submit");
  await expect(submit).toHaveText("Send");
  await expect(submit).toBeDisabled();
  await page.getByTestId("report-text").fill("cards vanished");
  await expect(submit).toBeDisabled();
  await page.getByTestId("report-name").fill("Dr. Serizawa");
  await expect(submit).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  // Esc closed only the popup: the game is still on.
  await expect(page.getByTestId("board")).toBeVisible();

  const text = marker("the zone stayed lit");
  const record = await reportBug(page, text);
  const reports = record["bugReports"] as Record<string, unknown>[];
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({
    text,
    reporter: "Dr. Serizawa",
    actionIndex: record["position"],
  });
  // Stored on the server as sent.
  await expect.poll(() => uploadsWith(text).length).toBe(1);
  // The name comes back filled in, in Bad Bot! too.
  await page.getByTestId("report-bug").click();
  await expect(page.getByTestId("report-name")).toHaveValue("Dr. Serizawa");
  await page.getByTestId("report-cancel").click();
  await page.getByTestId("bad-bot").click();
  await expect(page.getByTestId("report-name")).toHaveValue("Dr. Serizawa");
});

test("Report bug and Bad Bot! wait during the First / Second pick", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("2");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("first-pick")).toBeVisible();
  await expect(page.getByTestId("report-bug")).toBeDisabled();
  await expect(page.getByTestId("bad-bot")).toBeDisabled();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("report-bug")).toBeEnabled();
  // Bad Bot! before the bot's first move: `latestBotMove` in collection.test.ts.
});

test("Bad Bot!: the popup names the bot's last move, needs a name and a text, Esc cancels; Send uploads the record with the report", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.getByTestId("bad-bot").click();
  const modal = page.getByTestId("badBot-modal");
  await expect(modal).toContainText("What did the bot do wrong?");
  await expect(modal).toContainText(
    "Why was this a bad move? What would you have done?",
  );
  await expect(page.getByTestId("bad-bot-move")).toContainText("Bot (");
  await expect(page.getByTestId("bad-bot-move")).toContainText(/Turn \d+, /);
  await expect(page.getByTestId("report-submit")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  const text = marker("it wasted its best card");
  await page.getByTestId("bad-bot").click();
  await fill(page, "Dr. Serizawa", text);
  await page.getByTestId("report-submit").click();
  await expect(page.getByTestId("test-site-note")).toHaveText("Thanks, sent.");
  await expect.poll(() => uploadsWith(text).length).toBe(1);
  const [sent] = uploadsWith(text);
  const feedback = sent?.["botFeedback"] as Record<string, unknown>[];
  expect(feedback[0]).toMatchObject({ text, reporter: "Dr. Serizawa" });
  expect(String(feedback[0]?.["label"])).toMatch(/^Bot \(.*\(Turn \d+, /);
  // The game goes on; the finished game's upload carries the report again.
  await concede(page);
  await expect.poll(() => uploadsWith(text).length).toBe(2);
  // And Report bug's upload has it too.
  const record = await reportBug(page);
  expect(record["botFeedback"]).toEqual(feedback);
});

test("a failed Bad Bot! send says so, and the report goes with the finished game", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.route("/api/games", (route) => route.abort(), { times: 1 });
  const text = marker("it never blocked");
  await page.getByTestId("bad-bot").click();
  await fill(page, "Dr. Serizawa", text);
  await page.getByTestId("report-submit").click();
  await expect(page.getByTestId("test-site-note")).toHaveText(
    "Couldn't send. It will be sent with the finished game, and Report bug includes it.",
  );
  expect(uploadsWith(text)).toHaveLength(0);
  await concede(page);
  await expect.poll(() => uploadsWith(text).length).toBe(1);
});

test("with sharing off nothing is sent: Bad Bot! points to Report bug, which downloads the file", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  await page.getByTestId("test-settings").click();
  await page.getByTestId("setting-share-games").uncheck();
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/games") && r.method() === "POST") posts++;
  });
  await page.getByTestId("bad-bot").click();
  await expect(page.getByTestId("bad-bot-sharing-off")).toBeVisible();
  await expect(page.getByTestId("report-submit")).toHaveCount(0);
  await page.getByTestId("bad-bot-report-bug").click();
  await expect(page.getByTestId("bug-modal")).toBeVisible();
  await expect(page.getByTestId("report-bug-sharing-off")).toContainText(
    "the game file downloads instead",
  );
  await expect(page.getByTestId("report-submit")).toHaveText("Download");
  await fill(page, "Dr. Serizawa", "the board froze");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("report-submit").click(),
  ]);
  const record = JSON.parse(
    readFileSync(await download.path(), "utf8"),
  ) as Record<string, unknown>;
  expect(record["bugReports"]).toMatchObject([{ text: "the board froze" }]);
  await expect(page.getByTestId("test-site-note")).toContainText(
    "Send the file to Paul",
  );
  await concede(page);
  // The game-over upload would have gone out by now.
  await page.waitForTimeout(500);
  expect(posts).toBe(0);
});

test("a game that ends here uploads once; a finished game loaded from a file doesn't", async ({
  page,
}) => {
  // This page's uploads only: other workers upload their own games to the same folder.
  let posts = 0;
  // A response, not "requestfinished": the page never reads the upload's answer body.
  page.on("response", (r) => {
    if (r.url().endsWith("/api/games") && r.request().method() === "POST")
      posts++;
  });
  await loadFixture(page, "hand-five");
  await concede(page);
  await expect.poll(() => posts).toBe(1);
  // Report bug sends it once more (its own upload).
  const record = await reportBug(page);
  await expect.poll(() => posts).toBe(2);
  // Loading the finished record shows the end without sending it again.
  await page.goto("/play?mode=bot");
  await page.getByTestId("load-record").setInputFiles({
    name: "finished.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(record)),
  });
  await expect(page.getByTestId("game-over-modal")).toBeVisible();
  await page.waitForTimeout(500);
  expect(posts).toBe(2);
});

test("Show opponent's hand mid-game: it asks first, Cancel leaves it off, and the record keeps the flag and where it was turned on, even after turning it off", async ({
  page,
}) => {
  await loadFixture(page, "hand-five");
  const backs = page
    .getByTestId("opponent-hand")
    .getByTestId("opponent-card-back");
  await expect(backs.first()).toBeVisible();
  await page.getByTestId("test-settings").click();
  const toggle = page.getByTestId("show-opponent-hand");
  // It stays unchecked until the warning is confirmed, so click rather than check().
  await toggle.click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toContainText("Show the bot's hand?");
  await expect(page.getByTestId("show-hand-warning")).toHaveText(
    "This game will be left out of your statistics, and achievement progress won't count for it.",
  );
  await page.getByTestId("confirm-cancel").click();
  await expect(toggle).not.toBeChecked();
  await expect(backs.first()).toBeVisible();
  expect((await reportBug(page))["showOpponentHand"]).toBeUndefined();

  await toggle.click();
  await expect(page.getByTestId("confirm-yes")).toHaveText("Show hand");
  await page.getByTestId("confirm-yes").click();
  await expect(toggle).toBeChecked();
  await expect(backs).toHaveCount(0);
  const record = await reportBug(page);
  expect(record).toMatchObject({
    showOpponentHand: true,
    showOpponentHandAt: (record["actions"] as unknown[]).length,
    excludedFromAchievements: true,
  });
  await toggle.uncheck();
  await expect(backs.first()).toBeVisible();
  expect(await reportBug(page)).toMatchObject({
    showOpponentHand: true,
    excludedFromAchievements: true,
  });
});

test("turned on during the First / Second pick, the game is flagged from action 0", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("2");
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("first-pick")).toBeVisible();
  await page.getByTestId("test-settings").click();
  await page.getByTestId("show-opponent-hand").click();
  await page.getByTestId("confirm-yes").click();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await expect(
    page.getByTestId("opponent-hand").getByTestId("card").first(),
  ).toBeVisible();
  expect(await reportBug(page)).toMatchObject({
    showOpponentHand: true,
    showOpponentHandAt: 0,
    excludedFromAchievements: true,
  });
});

test("with the Test Site off (the server's switch), the panel and the opponent's hand are gone and nothing uploads", async ({
  page,
}) => {
  await page.route("/api/config", (route) =>
    route.fulfill({ json: { testSite: false } }),
  );
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/games") && r.method() === "POST") posts++;
  });
  // A record flagged to show the hand still loads and replays, with backs only.
  await loadFixture(page, "hand-five", { showOpponentHand: true });
  await expect(page.getByTestId("test-site")).toHaveCount(0);
  await expect(page.getByTestId("bad-bot")).toHaveCount(0);
  await expect(
    page.getByTestId("opponent-hand").getByTestId("opponent-card-back").first(),
  ).toBeVisible();
  await concede(page);
  await page.waitForTimeout(500);
  expect(posts).toBe(0);
});

for (const theme of ["showa", "dark", "grey", "light"] as const)
  test(`the Test Site panel and popups meet WCAG AA contrast in the ${theme} theme (axe)`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({
          animation: "off",
          theme: t,
          testSettingsOpen: true,
          whichButtonOpen: true,
        }),
      );
    }, theme);
    await loadFixture(page, "hand-five");
    const check = async () => {
      const results = await new AxeBuilder({ page })
        .include('[data-testid="test-site"]')
        .withRules(["color-contrast"])
        .analyze();
      return results.violations.flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary ?? ""}`),
      );
    };
    await expect(page.getByTestId("which-button-bad-bot")).toBeVisible();
    expect(await check()).toEqual([]);
    await page.getByTestId("bad-bot").click();
    const popup = await new AxeBuilder({ page })
      .include('[data-testid="badBot-modal"]')
      .withRules(["color-contrast"])
      .analyze();
    expect(
      popup.violations.flatMap((v) => v.nodes.map((n) => n.target)),
    ).toEqual([]);
  });

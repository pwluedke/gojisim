import { type Browser, expect, type Page, test } from "@playwright/test";

/*
 * Play online (M9b): two browsers signed in as two players (the dev sign-in's `?as=`), on the dev
 * server's head to head rooms. Each player sees only their own board; the server checks every
 * move.
 */

test.use({ viewport: { width: 1440, height: 900 } });

async function signedIn(browser: Browser, name: string, next: string) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(
    `/auth/dev?as=${encodeURIComponent(name)}&next=${encodeURIComponent(next)}`,
  );
  return page;
}

/** Ann creates a game from the menu, Bo opens her link and joins; the picker picks card 1. */
async function startOnline(
  browser: Browser,
  mode: "casual" | "tournament" = "casual",
) {
  // Names of their own per test run: creating games is limited per player per minute.
  const run = Math.floor(Math.random() * 1e6);
  const names = { ann: `Ann ${run}`, bo: `Bo ${run}` };
  const ann = await signedIn(browser, names.ann, "/");
  await ann.getByTestId("menu-play-online").click();
  await expect(ann.getByTestId("online-deck")).toHaveValue("official:ESD01");
  await ann.getByTestId("online-mode").selectOption(mode);
  await ann.getByTestId("online-create").click();
  await expect(ann).toHaveURL(/\/online\/[0-9a-f-]{36}$/);
  const link = await ann.getByTestId("online-link").inputValue();
  expect(link).toBe(ann.url());

  const bo = await signedIn(browser, names.bo, new URL(link).pathname);
  await expect(bo.getByTestId("online-invited")).toHaveText(
    `${names.ann} invited you`,
  );
  await bo.getByTestId("online-deck").selectOption("official:ESD02");
  await bo.getByTestId("online-join").click();

  // One of them picks First / Second; the other waits for it.
  const picker = await Promise.race([
    ann
      .getByTestId("online-pick-0")
      .waitFor()
      .then(() => ann),
    bo
      .getByTestId("online-pick-0")
      .waitFor()
      .then(() => bo),
  ]);
  const waiter = picker === ann ? bo : ann;
  await expect(waiter.getByTestId("online-other-picks")).toBeVisible();
  await picker.getByTestId("online-pick-1").click();
  await expect(ann.getByTestId("board")).toBeVisible();
  await expect(bo.getByTestId("board")).toBeVisible();
  return { ann, bo, names };
}

/**
 * The page whose player decides now (their Pass button shows), once both boards show the same
 * turn: right after a turn ends, the old turn player's board may not have caught up yet.
 */
async function decider(ann: Page, bo: Page): Promise<Page> {
  const turn = (page: Page) => page.getByTestId("turn").textContent();
  await expect
    .poll(async () => (await turn(ann)) === (await turn(bo)), {
      timeout: 30_000,
    })
    .toBe(true);
  const ready = async (page: Page) => {
    await expect(page.getByTestId("pass")).toBeVisible({ timeout: 30_000 });
    return page;
  };
  return Promise.any([ready(ann), ready(bo)]);
}

test("Play online: create, send the link, join, pick; each player sees their own board; a concede ends it for both", async ({
  browser,
}) => {
  const { ann, bo } = await startOnline(browser);
  // Each bottom mat is the player's own, and the other's name is on the board, not "Bot".
  const turnPlayer = await decider(ann, bo);
  const other = turnPlayer === ann ? bo : ann;
  await expect(other.getByTestId("pass")).toHaveCount(0);
  await expect(turnPlayer.getByTestId("prompt-step")).toBeVisible();

  // The turn player ends their main phase; the other player's board follows.
  const turn = Number(await other.getByTestId("turn").textContent());
  await turnPlayer.getByTestId("pass").click();
  await turnPlayer.getByTestId("confirm-yes").click();
  await expect
    .poll(async () => Number(await other.getByTestId("turn").textContent()), {
      timeout: 30_000,
    })
    .toBeGreaterThan(turn);

  // Either player may concede at any time (1.2.3).
  await bo.getByTestId("concede").click();
  await bo.getByTestId("confirm-yes").click();
  await expect(ann.getByTestId("game-over-line")).toHaveAttribute(
    "data-outcome",
    /^win/,
  );
  await expect(bo.getByTestId("game-over-line")).toHaveAttribute(
    "data-outcome",
    /^loss/,
  );
});

test("Play online: a refresh rejoins the same seat; the other player sees the wait, then the game goes on", async ({
  browser,
}) => {
  const { ann, bo, names } = await startOnline(browser);
  const turn = await bo.getByTestId("turn").textContent();
  await bo.reload();
  await expect(bo.getByTestId("board")).toBeVisible();
  await expect(bo.getByTestId("turn")).toHaveText(turn ?? "");
  await expect(ann.getByTestId("online-waiting")).toHaveCount(0);
  // Bo leaves: Ann sees she is waiting, with the claim still locked.
  await bo.context().close();
  await expect(ann.getByTestId("online-waiting")).toContainText(
    `Waiting for ${names.bo}`,
  );
  await expect(ann.getByTestId("online-claim")).toHaveCount(0);
});

test("Play online needs a signed-in player; a game link nobody made says so", async ({
  page,
  browser,
}) => {
  await page.goto("/online");
  await expect(page.getByTestId("online-sign-in")).toBeVisible();
  const ann = await signedIn(
    browser,
    "Ann",
    "/online/00000000-0000-4000-8000-000000000000",
  );
  await expect(ann.getByTestId("online-missing")).toBeVisible();
});

/** Puts a hand card into the rage zone (a gain rage action), as `m5e.spec.ts` does. */
async function gainRage(page: Page) {
  const cards = page.getByTestId("hand-card");
  for (let i = 0; i < (await cards.count()); i++) {
    await cards.nth(i).click();
    const dest = page.locator(`[data-lit][data-target^="rage"]`);
    if (await dest.count()) {
      await dest.first().click();
      return;
    }
    await page.keyboard.press("Escape");
  }
  throw new Error("no hand card can gain rage");
}

test("Play online, Casual: Undo asks the other player; Allow takes the action back, Decline keeps it", async ({
  browser,
}) => {
  const { ann, bo } = await startOnline(browser, "casual");
  const me = await decider(ann, bo);
  const other = me === ann ? bo : ann;
  const seat = await me.getByTestId("board").getAttribute("data-bottom");
  const rage = me.getByTestId(`rage-${seat}`);
  const before = Number(await rage.textContent());
  await gainRage(me);
  await expect(rage).toHaveText(String(before + 1));

  await me.getByTestId("undo").click();
  await expect(me.getByTestId("online-undo-asked")).toBeVisible();
  await expect(other.getByTestId("online-undo-request")).toContainText(
    "asks to undo their last action",
  );
  await other.getByTestId("online-undo-decline").click();
  await expect(other.getByTestId("online-undo-request")).toHaveCount(0);
  await expect(rage).toHaveText(String(before + 1));

  await me.getByTestId("undo").click();
  await other.getByTestId("online-undo-allow").click();
  await expect(rage).toHaveText(String(before));
  await expect(me.getByTestId("online-undo-asked")).toHaveCount(0);
});

test("Play online, Tournament: no Undo", async ({ browser }) => {
  const { ann, bo } = await startOnline(browser, "tournament");
  const me = await decider(ann, bo);
  await gainRage(me);
  await expect(me.getByTestId("undo")).toHaveCount(0);
});

test("Play online: after a refresh, the history view shows earlier boards from the server", async ({
  browser,
}) => {
  const { ann, bo } = await startOnline(browser);
  // A few turns, then Ann refreshes: her browser has only the latest board.
  for (let i = 0; i < 3; i++) {
    const turnPlayer = await decider(ann, bo);
    const turn = Number(await turnPlayer.getByTestId("turn").textContent());
    await turnPlayer.getByTestId("pass").click();
    await turnPlayer.getByTestId("confirm-yes").click();
    for (const page of [ann, bo])
      await expect
        .poll(async () => Number(await page.getByTestId("turn").textContent()))
        .toBeGreaterThan(turn);
  }
  await ann.reload();
  await expect(ann.getByTestId("board")).toBeVisible();
  const now = Number(await ann.getByTestId("turn").textContent());
  await ann.getByTestId("log-line").first().click();
  await expect(ann.getByTestId("back-to-live")).toBeVisible();
  await expect
    .poll(async () => Number(await ann.getByTestId("turn").textContent()))
    .toBeLessThan(now);
  await ann.getByTestId("back-to-live").click();
  await expect(ann.getByTestId("turn")).toHaveText(String(now));
});

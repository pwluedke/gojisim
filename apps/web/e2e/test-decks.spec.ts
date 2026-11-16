import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { myDeckNames, startGame } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * #359: the test decks next to the starter decks, on made-up decks: the public starter lists
 * under sample names (the real test decks live on the server, behind the sign-in; the e2e dev
 * server has none, so `/api/test-decks` is routed here). "Sample A" holds the ESD02 list and
 * "Sample B" the ESD01 list, so a game shows which list each seat got.
 */
const ESD02 = "esd02-starter.txt";
const ESD01 = "esd01-starter.txt";
const starter = (file: string) =>
  readFileSync(
    new URL(`../../../packages/cards/data/decks/${file}`, import.meta.url),
    "utf8",
  );
const sample = JSON.stringify({
  decks: [
    { name: "Sample A", list: starter(ESD02) },
    { name: "Sample B", list: starter(ESD01) },
  ],
});

async function serveTestDecks(page: Page, body = sample, status = 200) {
  await page.route("**/api/test-decks", (route) =>
    route.fulfill({ status, contentType: "application/json", body }),
  );
}

/** A seat's picker groups and their options, as shown. */
const groupsOf = (page: Page, seat: "P1" | "P2") =>
  page
    .getByTestId(`deck-${seat}`)
    .locator("optgroup")
    .evaluateAll((groups) =>
      groups.map((g) => ({
        label: g.getAttribute("label"),
        options: [...g.querySelectorAll("option")].map((o) => o.textContent),
      })),
    );

/** The card numbers in a starter list. */
const numbersIn = (file: string) =>
  [...starter(file).matchAll(/^\d+\s+(\S+)$/gm)].map((m) => m[1] ?? "");

/** A starter list's main deck, one card number per copy. */
const mainDeckOf = (file: string) =>
  [
    ...(starter(file).split("[main deck]")[1] ?? "").matchAll(
      /^(\d+)\s+(\S+)$/gm,
    ),
  ].flatMap((m) => Array<string>(Number(m[1])).fill(m[2] ?? ""));

/**
 * The visible cards a seat owns (its hand, its invading monster, what it played; tokens left
 * out) whose number isn't in `file`'s list, or "none shown" when no card shows yet.
 */
const outsideList = (page: Page, owner: "P1" | "P2", file: string) =>
  page
    .locator(
      `[data-testid="card"][data-owner="${owner}"]:not([data-token="true"])`,
    )
    .evaluateAll((cards, allowed) => {
      const numbers = cards.map(
        (c) => /\[([^\]]+)\]$/.exec(c.getAttribute("title") ?? "")?.[1],
      );
      if (numbers.length === 0) return ["none shown"];
      return numbers.filter((n) => !n || !allowed.includes(n));
    }, numbersIn(file));

test("both seats list the Starter decks, then the Test decks", async ({
  page,
}) => {
  await serveTestDecks(page);
  await page.goto("/play?mode=bot");
  for (const seat of ["P1", "P2"] as const) {
    await expect
      .poll(() => groupsOf(page, seat))
      .toEqual([
        {
          label: "Starter decks",
          options: ["ESD01 official", "ESD02 official"],
        },
        { label: "Test decks", options: ["Sample A", "Sample B"] },
      ]);
  }
});

test("a test deck on each side starts a game with its list: the player's and the bot's", async ({
  page,
}) => {
  await serveTestDecks(page);
  await page.goto("/play?mode=bot");
  await page.getByTestId("deck-P1").selectOption("test:Sample A");
  await page.getByTestId("deck-P2").selectOption("test:Sample B");
  await expect(
    page.getByTestId("seat-panel-P1").getByTestId("legality"),
  ).toHaveText("Legal");
  await startGame(page);
  await expect(page.getByTestId("fight-deck-you")).toHaveText("Sample A");
  await expect(page.getByTestId("fight-deck-opp")).toHaveText("Sample B");
  // Sample A is the ESD02 list, Sample B the ESD01 list.
  await expect.poll(() => outsideList(page, "P1", ESD02)).toEqual([]);
  await expect.poll(() => outsideList(page, "P2", ESD01)).toEqual([]);
});

test("with no test decks (signed out, or none uploaded), the group doesn't show", async ({
  page,
}) => {
  await serveTestDecks(page, "{}", 401);
  await page.goto("/play?mode=bot");
  await expect(page.getByTestId("deck-P1").locator("optgroup")).toHaveCount(1);
  await expect(
    page.getByTestId("deck-P1").locator("optgroup").first(),
  ).toHaveAttribute("label", "Starter decks");
});

test("Deckbuilder: a test deck shows after the starters, opens with its list, and an edit saves as your own deck", async ({
  page,
}) => {
  await serveTestDecks(page);
  await page.goto("/decks");
  await page.getByTestId("db-my-decks").click();
  const win = page.getByTestId("db-decks-window");
  await expect(win.getByTestId("db-starter")).toHaveCount(2);
  const tests = win.getByTestId("db-test-deck");
  await expect(tests).toHaveText([/^Sample A\s*Legal/, /^Sample B\s*Legal/]);
  await tests.nth(0).getByTestId("db-load").click();
  await expect(win).toHaveCount(0);
  // Its full list: the ESD02 starter's 4 monsters and 50 main deck cards.
  await expect(page.getByTestId("db-deck-name")).toHaveValue("Sample A");
  await expect(page.getByTestId("db-count-monster")).toHaveText("4/4");
  await expect(page.getByTestId("db-count-main")).toHaveText("50/50");
  const slots = page.getByTestId("db-panel").getByTestId("db-main-slot");
  await expect(slots).toHaveCount(50);
  const shown = await slots.evaluateAll((all) =>
    all.map((e) => e.getAttribute("data-card-number") ?? ""),
  );
  expect(shown.sort()).toEqual(mainDeckOf(ESD02).sort());

  // An edit (one card out), saved: a deck of your own; the test deck stays as it was.
  await slots.first().click();
  await page.getByTestId("db-card-panel-minus").click();
  await expect(page.getByTestId("db-count-main")).toHaveText("49/50");
  await page.getByTestId("db-deck-name").fill("My Sample A");
  await page.getByTestId("db-save").click();
  await expect(page.getByTestId("db-panel-note")).toHaveText(
    "Saved My Sample A.",
  );
  await expect(page.getByTestId("db-my-decks")).toHaveText("My decks (1)");
  expect(await myDeckNames(page)).toEqual(["My Sample A"]);
  await expect(win.getByTestId("db-test-deck")).toHaveCount(2);
  await win.getByTestId("db-test-deck").nth(0).getByTestId("db-load").click();
  await expect(page.getByTestId("db-count-main")).toHaveText("50/50");
});

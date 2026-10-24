import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { startGame } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/** Decklog import: the `/api/decklog/<code>` route is mocked, so no test reaches Decklog. */

const raw = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/cards/test/fixtures/decklog-1STAP.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
/** The route's answer for 1STAP: the recorded Decklog deck, trimmed as the server trims it. */
const despangler = {
  code: raw.deck_id,
  title: raw.title,
  list: raw.list.map((e: { card_number: string; num: number }) => ({
    card_number: e.card_number,
    num: e.num,
  })),
  p_list: raw.p_list.map((e: { card_number: string; num: number }) => ({
    card_number: e.card_number,
    num: e.num,
  })),
  sub_list: [],
};

async function mockRoute(page: Page, status: number, body: unknown) {
  const codes: string[] = [];
  await page.route("**/api/decklog/*", (route) => {
    codes.push(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return codes;
}

async function fetchDeck(page: Page, input: string) {
  await page.goto("/play?mode=bot");
  await page.getByTestId("import-deck").click();
  await page.getByTestId("decklog-input").fill(input);
  await page.getByTestId("decklog-fetch").click();
}

test("paste a Decklog URL: the deck is fetched, previewed, saved and played", async ({
  page,
}) => {
  const codes = await mockRoute(page, 200, despangler);
  await fetchDeck(page, "https://decklog-en.bushiroad.com/view/1STAP");
  await expect(page.getByTestId("decklog-note")).toHaveText(
    "Fetched 1STAP from Decklog.",
  );
  expect(codes).toEqual(["1STAP"]);
  await expect(page.getByTestId("import-text")).toHaveValue(
    /^\[deck\] The Despangler\n\[monster deck\]\n1 EBP01-001\+\n/,
  );
  await expect(page.getByTestId("import-counts")).toHaveText(
    "Monster deck 4 · Main deck 50",
  );
  await expect(page.getByTestId("import-cards")).toContainText(
    "4 × Godzilla Landing [EBP01-030++]",
  );
  await expect(page.getByTestId("import-errors")).toHaveCount(0);
  await expect(page.getByTestId("import-warnings")).toHaveCount(0);
  await expect(page.getByTestId("import-name")).toHaveValue("The Despangler");
  await page.getByTestId("import-save").click();
  await expect(page.getByTestId("my-deck-name")).toHaveText(["The Despangler"]);
  await expect(
    page.getByTestId("seat-panel-P1").getByTestId("legality"),
  ).toHaveText("Legal");
  await startGame(page);
  await expect(page.getByTestId("board")).toBeVisible();
});

test("a bare deck code works too, and Enter fetches without starting a game", async ({
  page,
}) => {
  const codes = await mockRoute(page, 200, despangler);
  await page.goto("/play?mode=bot");
  await page.getByTestId("import-deck").click();
  await page.getByTestId("decklog-input").fill("1STAP");
  await page.getByTestId("decklog-input").press("Enter");
  await expect(page.getByTestId("import-counts")).toHaveText(
    "Monster deck 4 · Main deck 50",
  );
  expect(codes).toEqual(["1STAP"]);
  await expect(page.getByTestId("board")).toHaveCount(0);
});

test("deck not found", async ({ page }) => {
  await mockRoute(page, 404, {
    error: "not-found",
    message: "Decklog has no deck ZZZZZ9",
  });
  await fetchDeck(page, "ZZZZZ9");
  await expect(page.getByTestId("decklog-error")).toHaveText(
    "Decklog has no deck ZZZZZ9.",
  );
  await expect(page.getByTestId("import-save")).toBeDisabled();
});

test("Decklog unreachable", async ({ page }) => {
  await mockRoute(page, 502, { error: "unreachable", message: "x" });
  await fetchDeck(page, "1STAP");
  await expect(page.getByTestId("decklog-error")).toHaveText(
    "Decklog can't be reached right now. Try again later.",
  );
});

test("unknown card numbers are named and block saving", async ({ page }) => {
  await mockRoute(page, 200, {
    ...despangler,
    list: [...despangler.list.slice(1), { card_number: "EPR-999", num: 4 }],
  });
  await fetchDeck(page, "1STAP");
  await expect(page.getByTestId("decklog-error")).toContainText(
    "GojiSim doesn't know this card number yet: EPR-999",
  );
  await expect(page.getByTestId("import-errors")).toContainText(
    "Unknown card number EPR-999",
  );
  await expect(page.getByTestId("import-save")).toBeDisabled();
});

test("text that isn't a Decklog URL or code is refused without a request", async ({
  page,
}) => {
  const codes = await mockRoute(page, 200, despangler);
  await fetchDeck(page, "https://example.com/view/1STAP");
  await expect(page.getByTestId("decklog-error")).toContainText(
    "Paste a Decklog URL",
  );
  expect(codes).toEqual([]);
});

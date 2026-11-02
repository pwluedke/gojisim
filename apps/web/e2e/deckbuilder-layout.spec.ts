import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * #165, the final Deckbuilder layout (mockup F): the card detail panel over the card list, the
 * image deck panel with dashed empty slots, and the Slots / Rank columns toggle.
 */

const THEMES = ["showa", "light", "grey", "dark"] as const;
const cardPanel = (page: Page) => page.getByTestId("db-card-panel");
const gridCard = (page: Page, n: number) => page.getByTestId("db-card").nth(n);

async function loadStarter(page: Page) {
  await page.getByTestId("db-my-decks").click();
  await page.getByTestId("db-starter").first().getByTestId("db-load").click();
  await expect(page.getByTestId("db-decks-window")).toHaveCount(0);
}

test("the card detail opens from a card, shows it, adds copies to the limit (6.1.1.4), moves with the arrow keys and closes with Esc or ×", async ({
  page,
}) => {
  await page.goto("/decks?set=ESD01");
  const first = gridCard(page, 0);
  const firstNumber = await first.getAttribute("data-card-number");
  const secondNumber = await gridCard(page, 1).getAttribute("data-card-number");
  await first.getByTestId("db-card-image").click();
  await expect(cardPanel(page)).toHaveAttribute(
    "data-card-number",
    firstNumber ?? "",
  );
  // The selected card gets the gold outline.
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect(cardPanel(page)).toContainText("Type");
  await expect(cardPanel(page)).toContainText("Set");
  await expect(page.getByTestId("db-card-panel-copies")).toHaveText(
    "In deck: 0 / 4",
  );
  await expect(page.getByTestId("db-card-panel-minus")).toBeDisabled();
  await page.getByTestId("db-card-panel-plus").click();
  await expect(page.getByTestId("db-card-panel-copies")).toHaveText(
    "In deck: 1 / 4",
  );
  await expect(first.getByTestId("db-card-copies")).toHaveText("1 / 4");
  // Add 4 fills to the limit, never past it.
  await page.getByTestId("db-card-panel-fill").click();
  await expect(page.getByTestId("db-card-panel-copies")).toHaveText(
    "In deck: 4 / 4",
  );
  await expect(page.getByTestId("db-card-panel-fill")).toBeDisabled();
  await page.getByTestId("db-card-panel-minus").click();
  await expect(first.getByTestId("db-card-copies")).toHaveText("3 / 4");

  // The arrow keys move through the filtered list.
  await page.keyboard.press("ArrowRight");
  await expect(cardPanel(page)).toHaveAttribute(
    "data-card-number",
    secondNumber ?? "",
  );
  await page.keyboard.press("ArrowLeft");
  await expect(cardPanel(page)).toHaveAttribute(
    "data-card-number",
    firstNumber ?? "",
  );
  // The deck panel stays visible while the detail is open.
  await expect(page.getByTestId("db-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cardPanel(page)).toHaveCount(0);
  await gridCard(page, 1).getByTestId("db-card-image").click();
  await page.getByTestId("db-card-panel-close").click();
  await expect(cardPanel(page)).toHaveCount(0);
});

test("an empty deck shows dashed empty slots; a filled slot opens its card; the banner counts the empty main deck slots (6.1.1.2)", async ({
  page,
}) => {
  await page.goto("/decks?set=ESD01");
  await expect(page.getByTestId("db-monster-slot-empty")).toHaveCount(4);
  await expect(page.getByTestId("db-main-slot-empty")).toHaveCount(50);
  await expect(page.getByTestId("db-reason")).toContainText([
    "50 main deck slots are empty",
  ]);
  // A battle card goes to the main deck: one slot fills.
  await page.goto("/decks?set=ESD01&type=Battle");
  const battle = gridCard(page, 0);
  const number = await battle.getAttribute("data-card-number");
  await battle.getByTestId("db-card-plus").click();
  await expect(page.getByTestId("db-main-slot-empty")).toHaveCount(49);
  await expect(page.getByTestId("db-reason")).toContainText([
    "49 main deck slots are empty",
  ]);
  await page.getByTestId("db-main-slot").first().click();
  await expect(cardPanel(page)).toHaveAttribute(
    "data-card-number",
    number ?? "",
  );
});

test("Slots / Rank columns: the toggle switches the main deck's view, and the browser remembers it", async ({
  page,
}) => {
  await page.goto("/decks");
  await loadStarter(page);
  await expect(page.getByTestId("db-main-slot")).toHaveCount(50);
  await expect(page.getByTestId("db-view-slots")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("db-view-ranks").click();
  const columns = page.getByTestId("db-rank-column");
  await expect(columns).toHaveCount(8);
  // Each column heads "R<n> · <count>", and the counts add up to the main deck.
  const counts = await columns.evaluateAll((cols) =>
    cols.map((c) => c.querySelector("div")?.textContent ?? ""),
  );
  expect(counts[0]).toMatch(/^R1 · \d+$/);
  expect(counts.reduce((sum, c) => sum + Number(c.split(" · ")[1]), 0)).toBe(
    50,
  );
  // Copies of a print stack into one entry with its count.
  const stacked = page.getByTestId("db-rank-card").first();
  await expect(stacked).toHaveText(/^\d× /);
  await page.reload();
  await loadStarter(page);
  await expect(page.getByTestId("db-rank-column")).toHaveCount(8);
  await page.getByTestId("db-view-slots").click();
  await page.reload();
  await loadStarter(page);
  await expect(page.getByTestId("db-main-slot")).toHaveCount(50);
});

for (const theme of THEMES)
  test(`a full 54-card deck shows without scrolling the deck panel at 1440×900, and 1280×800 has no page scroll (${theme})`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t }),
      );
    }, theme);
    await page.goto("/decks");
    await loadStarter(page);
    const panelScrolls = () =>
      page
        .getByTestId("db-panel")
        .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(await panelScrolls()).toBe(false);
    await expect(page.getByTestId("db-save")).toBeInViewport();
    await page.setViewportSize({ width: 1280, height: 800 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth > window.innerWidth ||
          document.documentElement.scrollHeight > window.innerHeight,
      ),
    ).toBe(false);
    await expect(page.getByTestId("db-grid")).toHaveAttribute(
      "data-columns",
      /^[56]$/,
    );
  });

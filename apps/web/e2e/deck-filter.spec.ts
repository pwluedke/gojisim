import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startGame } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/** #179: a filter above each /play deck dropdown narrows it by deck or folder name. */

const starter = readFileSync(
  new URL(
    "../../../packages/cards/data/decks/esd01-starter.txt",
    import.meta.url,
  ),
  "utf8",
);
const named = (name: string) =>
  starter.replace(/^\[deck\].*$/m, `[deck] ${name}`);

test("filter by a folder name, pick a deck and start a game; clearing the box shows every deck again", async ({
  page,
}) => {
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await page
    .getByTestId("import-text")
    .fill(
      [named("Club/Red Rage"), named("Club/Blue Hoard"), named("Rager")].join(
        "\n\n",
      ),
    );
  await page.getByTestId("import-all").click();
  await expect(page.getByTestId("import-all-result")).toContainText(
    "Saved 3 of 3 decks",
  );
  await page.getByTestId("import-cancel").click();
  // Storage has caught up before leaving the Deckbuilder (decision 295).
  await page.getByTestId("db-my-decks").click();
  await expect(page.getByTestId("db-decks-window")).toHaveAttribute(
    "data-decks-stored",
    "true",
  );
  await page.goto("/play?mode=bot");
  const options = () =>
    page
      .getByTestId("deck-P1")
      .locator("option")
      .evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  await expect.poll(options).toHaveLength(5);
  await page.getByTestId("deck-filter-P1").fill("CLUB");
  // The two Club decks, plus ESD01, which stays because it's the current choice.
  await expect
    .poll(options)
    .toEqual(["ESD01 official", "Club/Red Rage", "Club/Blue Hoard"]);
  // P2's dropdown has its own filter.
  expect(await page.getByTestId("deck-P2").locator("option").count()).toBe(5);
  await page.getByTestId("deck-P1").selectOption({ label: "Club/Blue Hoard" });
  await page.getByTestId("deck-filter-P1").fill("");
  await expect.poll(options).toHaveLength(5);
  await expect(page.getByTestId("deck-P1")).toHaveValue(/^mine:/);
  await startGame(page);
  await expect(page.getByTestId("board")).toBeVisible();
});

test("Paul, Nov 9: each seat's tag buttons narrow its dropdown to decks with all the chosen tags", async ({
  page,
}) => {
  const tagged = (name: string, tags: string) =>
    starter.replace(/^\[deck\].*$/m, `[deck] ${name}\ntags: ${tags}`);
  await page.goto("/decks");
  await page.getByTestId("db-import").click();
  await page
    .getByTestId("import-text")
    .fill(
      [
        tagged("Red Rage", "Meta, Bot training"),
        tagged("Blue Hoard", "Meta"),
        tagged("Rager", "Mine"),
      ].join("\n\n"),
    );
  await page.getByTestId("import-all").click();
  await expect(page.getByTestId("import-all-result")).toContainText(
    "Saved 3 of 3 decks",
  );
  await page.getByTestId("import-cancel").click();
  await page.getByTestId("db-my-decks").click();
  await expect(page.getByTestId("db-decks-window")).toHaveAttribute(
    "data-decks-stored",
    "true",
  );
  await page.goto("/play?mode=bot");
  const options = (id: string) =>
    page
      .getByTestId(`deck-${id}`)
      .locator("option")
      .evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  await expect.poll(() => options("P1")).toHaveLength(5);
  const tagButton = (id: string, tag: string) =>
    page.locator(`[data-testid="deck-tag-${id}"][data-tag="${tag}"]`);
  await expect(page.getByTestId("deck-tag-P1")).toHaveText([
    "Meta",
    "Bot training",
    "Mine",
  ]);
  await tagButton("P1", "Meta").click();
  await expect(tagButton("P1", "Meta")).toHaveAttribute("aria-pressed", "true");
  // The current choice (ESD01) stays; the two Meta decks follow.
  await expect
    .poll(() => options("P1"))
    .toEqual(["ESD01 official", "Red Rage", "Blue Hoard"]);
  await tagButton("P1", "Bot training").click();
  await expect
    .poll(() => options("P1"))
    .toEqual(["ESD01 official", "Red Rage"]);
  // P2's dropdown has its own tags.
  expect(await page.getByTestId("deck-P2").locator("option").count()).toBe(5);
  // The text filter matches tags too.
  await tagButton("P1", "Bot training").click();
  await tagButton("P1", "Meta").click();
  await page.getByTestId("deck-filter-P1").fill("mine");
  await expect.poll(() => options("P1")).toEqual(["ESD01 official", "Rager"]);
});

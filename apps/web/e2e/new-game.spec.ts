import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * The new-game screen (Monarch, Oct 26, 2026): it fits on one screen in every theme, each seat
 * has Randomize, a match type switch resets both seats to the starters, and My decks is a
 * collapsed section whose rows each have one "⋯" menu.
 */

const THEMES = ["showa", "dark", "grey", "light"] as const;
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
] as const;

const starter = readFileSync(
  new URL(
    "../../../packages/cards/data/decks/esd01-starter.txt",
    import.meta.url,
  ),
  "utf8",
);

/** Restores `decks` with Import backup in the Deckbuilder's My decks window (#161), then comes back. */
async function restore(page: Page, decks: { name: string; list: string }[]) {
  const back = page.url();
  await page.goto("/decks");
  await page.getByTestId("db-my-decks").click();
  await page.getByTestId("db-backup-file").setInputFiles({
    name: "decks.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ app: "gojisim", kind: "decks", version: 1, decks }),
    ),
  });
  await expect(page.getByTestId("db-decks-note")).toContainText("Restored");
  // Storage has caught up before leaving (decision 295).
  await expect(page.getByTestId("db-decks-window")).toHaveAttribute(
    "data-decks-stored",
    "true",
  );
  await page.goto(back);
}

/** Six saved decks, the quickest way to fill My decks. */
async function sixDecks(page: Page) {
  await restore(
    page,
    Array.from({ length: 6 }, (_, i) => ({
      name: `Saved deck ${i + 1}`,
      list: starter,
    })),
  );
  await expect(
    page.getByTestId("deck-P1").locator('optgroup[label="My decks"] option'),
  ).toHaveCount(6);
}

async function open(page: Page, theme: string) {
  await page.addInitScript((theme) => {
    localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "off", theme }),
    );
  }, theme);
  await page.goto("/play?mode=bot");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

const pageScrolls = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollHeight > window.innerHeight ||
      document.documentElement.scrollWidth > window.innerWidth,
  );

for (const size of SIZES)
  for (const theme of THEMES)
    test(`no page scroll at ${size.width}×${size.height} in ${theme}, with 6 saved decks`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await open(page, theme);
      await sixDecks(page);
      expect(await pageScrolls(page)).toBe(false);
      // Two bots (the tallest seats: both show their level) still fit.
      await page.getByTestId("seat-P1").selectOption("bot");
      expect(await pageScrolls(page)).toBe(false);
      if (process.env["NEW_GAME_SHOTS"])
        await page.screenshot({
          path: `${process.env["NEW_GAME_SHOTS"]}/new-game-${theme}-${size.width}.png`,
        });
    });

test.describe("compact controls", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("controls on the new-game screen are 36 px tall with 14 px text; Start stays marigold in Showa", async ({
    page,
  }) => {
    await open(page, "showa");
    for (const id of ["deck-P1", "seed-input", "randomize-P1"]) {
      const control = page.getByTestId(id);
      expect((await control.boundingBox())?.height).toBeCloseTo(36, 0);
      await expect(control).toHaveCSS("font-size", "14px");
    }
    await expect(page.getByTestId("start-game")).toHaveCSS(
      "background-color",
      await page
        .evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--color-marigold")
            .trim(),
        )
        .then(hexToRgb),
    );
    // P1 and P2 sit side by side.
    const p1 = await page.getByTestId("seat-panel-P1").boundingBox();
    const p2 = await page.getByTestId("seat-panel-P2").boundingBox();
    expect(p1?.y).toBe(p2?.y);
    expect((p1?.x ?? 0) + (p1?.width ?? 0)).toBeLessThan(p2?.x ?? 0);
  });

  test("on the board, Showa's controls take the other themes' height, not the 44 px minimum (#108, amends decision 453)", async ({
    page,
  }) => {
    await open(page, "showa");
    await page.getByTestId("seat-P1").selectOption("bot");
    await page.getByTestId("start-game").click();
    await page.getByTestId("settings").click();
    const select = page.getByTestId("setting-theme");
    expect((await select.boundingBox())?.height).toBeLessThan(30);
  });
});

function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

test.describe("bottom block", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Load a game record is a button; the file's name shows only after a pick", async ({
    page,
  }) => {
    await open(page, "showa");
    await expect(page.getByTestId("load-record-button")).toHaveText(
      "Load a game record",
    );
    await expect(page.getByTestId("load-record")).toBeHidden();
    await expect(page.getByTestId("load-record-name")).toHaveCount(0);
    await expect(page.getByText("No file chosen")).toHaveCount(0);
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("load-record-button").click();
    await (
      await chooser
    ).setFiles({
      name: "not-a-record.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });
    await expect(page.getByTestId("load-record-name")).toHaveText(
      "not-a-record.json",
    );
    await expect(page.getByTestId("load-error")).toBeVisible();
  });

  test("Show opponent's hand left the new-game screen (M13b: the Test Site panel)", async ({
    page,
  }) => {
    await open(page, "showa");
    await expect(page.getByTestId("show-opponent-hand")).toHaveCount(0);
  });
});

test.describe("Randomize", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("each seat's Randomize picks another deck from its list", async ({
    page,
  }) => {
    await open(page, "showa");
    for (const id of ["P1", "P2"]) {
      const select = page.getByTestId(`deck-${id}`);
      const before = await select.inputValue();
      await page.getByTestId(`randomize-${id}`).click();
      await expect(select).not.toHaveValue(before);
      const picked = await select.inputValue();
      // The pick is one of the listed options.
      expect(
        await select
          .locator("option")
          .evaluateAll((options) =>
            options.map((o) => (o as HTMLOptionElement).value),
          ),
      ).toContain(picked);
    }
  });

  test("Tournament: Randomize picks legal decks only", async ({ page }) => {
    await open(page, "showa");
    await sixDecks(page);
    // Make every saved deck illegal: the starter list with a card missing.
    const short = starter.replace(/^4 (ESD01-\d+)$/m, "3 $1");
    await restore(page, [{ name: "Short deck", list: short }]);
    await page.getByTestId("match-mode-tournament").check();
    const illegal = await page
      .getByTestId("deck-P1")
      .locator("option[disabled]")
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      );
    expect(illegal.length).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) {
      await page.getByTestId("randomize-P1").click();
      expect(illegal).not.toContain(
        await page.getByTestId("deck-P1").inputValue(),
      );
      await expect(page.getByTestId("start-game")).toBeEnabled();
    }
  });

  test("a match type switch resets P1 to ESD01 and P2 to ESD02", async ({
    page,
  }) => {
    await open(page, "showa");
    await page.getByTestId("randomize-P1").click();
    await page.getByTestId("randomize-P2").click();
    await expect(page.getByTestId("deck-P1")).not.toHaveValue("official:ESD01");
    await page.getByTestId("match-mode-tournament").check();
    await expect(page.getByTestId("deck-P1")).toHaveValue("official:ESD01");
    await expect(page.getByTestId("deck-P2")).toHaveValue("official:ESD02");
    await page.getByTestId("randomize-P1").click();
    await page.getByTestId("match-mode-casual").check();
    await expect(page.getByTestId("deck-P1")).toHaveValue("official:ESD01");
    await expect(page.getByTestId("deck-P2")).toHaveValue("official:ESD02");
  });
});

test.describe("one simple picker (#161)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the picker lists Starter decks and My decks only; deck tools live in the Deckbuilder", async ({
    page,
  }) => {
    await open(page, "showa");
    await sixDecks(page);
    expect(
      await page
        .getByTestId("deck-P1")
        .locator("optgroup")
        .evaluateAll((groups) => groups.map((g) => g.getAttribute("label"))),
    ).toEqual(["Starter decks", "My decks"]);
    for (const id of [
      "import-deck",
      "my-decks",
      "export-decks",
      "dev-deck-filter",
    ])
      await expect(page.getByTestId(id)).toHaveCount(0);
    await page.getByTestId("build-decks").click();
    await expect(page).toHaveURL(/\/decks/);
  });
});

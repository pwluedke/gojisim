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

/** Six saved decks through Import backup, the quickest way to fill My decks. */
async function sixDecks(page: Page) {
  const backup = {
    app: "gojisim",
    kind: "decks",
    version: 1,
    decks: Array.from({ length: 6 }, (_, i) => ({
      name: `Saved deck ${i + 1}`,
      list: starter,
    })),
  };
  await page.getByTestId("import-backup").setInputFiles({
    name: "decks.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByTestId("my-deck")).toHaveCount(6);
  // Storage has caught up (decision 295).
  await expect(page.getByTestId("my-decks")).toHaveAttribute(
    "data-decks-stored",
    "true",
  );
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
    test(`no page scroll at ${size.width}×${size.height} in ${theme}, with 6 saved decks and the list open`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await open(page, theme);
      await sixDecks(page);
      await expect(page.getByTestId("my-decks")).toHaveAttribute(
        "data-open",
        "true",
      );
      expect(await pageScrolls(page)).toBe(false);
      // Two bots (the tallest seats: both show their level) still fit.
      await page.getByTestId("seat-P1").selectOption("bot");
      expect(await pageScrolls(page)).toBe(false);
      // The list scrolls inside its box: 4 rows tall at most.
      const list = page.getByTestId("my-decks-list");
      const box = await list.evaluate((el) => ({
        client: el.clientHeight,
        scroll: el.scrollHeight,
        row: el.querySelector("li")?.getBoundingClientRect().height ?? 0,
      }));
      expect(box.client).toBeLessThanOrEqual(4 * box.row + 1);
      expect(box.scroll).toBeGreaterThan(box.client);
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
    for (const id of ["deck-P1", "seed-input", "randomize-P1", "import-deck"]) {
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
    const backup = {
      app: "gojisim",
      kind: "decks",
      version: 1,
      decks: [{ name: "Short deck", list: short }],
    };
    await page.getByTestId("import-backup").setInputFiles({
      name: "short.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
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

test.describe("My decks", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("closed by default with its count; each row has one ⋯ menu with Rename, Copy and Delete", async ({
    page,
  }) => {
    await open(page, "showa");
    await sixDecks(page);
    await page.reload();
    const section = page.getByTestId("my-decks");
    await expect(section).toHaveAttribute("data-decks-stored", "true");
    await expect(section).toHaveAttribute("data-open", "false");
    await expect(page.getByTestId("my-decks-toggle")).toHaveText(
      /My decks \(6\)/,
    );
    await expect(page.getByTestId("my-deck")).toHaveCount(0);
    // Import deck, Export all and Import backup sit on one line.
    const tops = await Promise.all(
      ["import-deck", "export-decks", "import-backup-button"].map(
        async (id) => (await page.getByTestId(id).boundingBox())?.y,
      ),
    );
    expect(new Set(tops).size).toBe(1);
    await page.getByTestId("my-decks-toggle").click();
    const row = page.getByTestId("my-deck").first();
    await expect(row.getByTestId("deck-menu")).toHaveCount(1);
    await expect(row.getByRole("button")).toHaveCount(1);
    await row.getByTestId("deck-menu").click();
    await expect(
      page.getByTestId("deck-menu-list").getByRole("menuitem"),
    ).toHaveText(["Rename", "Copy", "Delete"]);
    // Esc closes it.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("deck-menu-list")).toHaveCount(0);
  });
});

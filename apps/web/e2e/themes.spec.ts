import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loadFixture, startGame, vsBot } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/** M5g: the theme setting (Showa Poster / Dark / Grey / Light), built from theme.css variables. */

const THEMES = ["showa", "dark", "grey", "light"] as const;

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** A board on the human's turn 1 against the bot (M5h: no hotseat). */
const humanBoard = (page: Page) => vsBot(page, 2);

test("each theme changes the page background and survives a reload; Showa Poster is the default", async ({
  page,
}) => {
  await humanBoard(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "showa");
  const seen = new Set<string>();
  for (const theme of THEMES) {
    await page.getByTestId("settings").click();
    await page.getByTestId("setting-theme").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    seen.add(await background(page));
    const bg = await background(page);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(await background(page)).toBe(bg);
    await startGame(page);
  }
  // Four different backgrounds.
  expect(seen.size).toBe(4);
});

test("the saved theme is on the page before its scripts run (no flash of another theme)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "off", theme: "dark" }),
    );
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { themeAtLoad: string }).themeAtLoad =
        document.documentElement.dataset["theme"] ?? "";
    });
  });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => (window as unknown as { themeAtLoad: string }).themeAtLoad,
    ),
  ).toBe("dark");
});

test("the menu and /debug restyle with the theme", async ({ page }) => {
  const backgrounds: Record<string, string[]> = {};
  for (const theme of THEMES) {
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t }),
      );
    }, theme);
    for (const path of ["/", "/debug"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      (backgrounds[path] ??= []).push(await background(page));
    }
  }
  for (const path of ["/", "/debug"])
    expect(new Set(backgrounds[path]).size, path).toBe(4);
});

for (const theme of THEMES)
  test(`/play text meets WCAG AA contrast in the ${theme} theme (axe)`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t }),
      );
    }, theme);
    await humanBoard(page);
    // Open Settings too, so its controls are checked.
    await page.getByTestId("settings").click();
    const results = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .analyze();
    const problems = results.violations.flatMap((v) =>
      v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary ?? ""}`),
    );
    expect(problems).toEqual([]);
  });

/** Axe's contrast problems on the page now. */
async function contrastProblems(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .analyze();
  return results.violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary ?? ""}`),
  );
}

for (const theme of THEMES)
  test(`mid-game in the ${theme} theme: lit zones, chips, the zone banner, the log and a choice modal meet AA`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t }),
      );
    }, theme);
    // Turn 10: a zone choice (lit zones and the banner), change chips, a long battle log.
    await loadFixture(page, "zone");
    await expect(page.getByTestId("choice-banner")).toBeVisible();
    expect(await contrastProblems(page)).toEqual([]);
    // A search choice: the choice modal with its cards and Find nothing.
    await loadFixture(page, "search");
    await expect(page.getByTestId("choice-modal")).toBeVisible();
    expect(await contrastProblems(page)).toEqual([]);
  });

for (const theme of THEMES)
  test(`the new-game screen, My decks and the import modal meet AA in the ${theme} theme`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t }),
      );
    }, theme);
    await page.goto("/play?mode=bot");
    await page.getByTestId("import-deck").click();
    // A deck with an error, warnings and a card list.
    await page
      .getByTestId("import-text")
      .fill(
        "[deck] Mixed\n[monster deck]\n1 ESD01-001\n[main deck]\n4 ESD01-005\n1 ZZZ99-999\n",
      );
    await expect(page.getByTestId("import-errors")).toBeVisible();
    expect(await contrastProblems(page)).toEqual([]);
    await page
      .getByTestId("import-text")
      .fill(
        "[deck] Small\n[monster deck]\n1 ESD01-001\n[main deck]\n4 ESD01-005\n",
      );
    await page.getByTestId("import-save").click();
    await expect(page.getByTestId("my-deck")).toHaveCount(1);
    expect(await contrastProblems(page)).toEqual([]);
  });

test("with nothing saved, Showa Poster is on the page before its scripts run; a saved theme still wins", async ({
  page,
}) => {
  // The e2e default storage only turns animations off: no theme is saved.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { themeAtLoad: string }).themeAtLoad =
        document.documentElement.dataset["theme"] ?? "";
    });
  });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => (window as unknown as { themeAtLoad: string }).themeAtLoad,
    ),
  ).toBe("showa");
  await expect(page.getByTestId("theme-header")).toBeVisible();
  // The header's katakana wordmark, in Dela Gothic One (bundled, never a system font).
  const ja = page.getByTestId("theme-header").locator('[lang="ja"]');
  await expect(ja).toHaveText("ゴジシム！");
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('26px "Dela Gothic One"', "ゴジシム！");
    }),
  ).toBe(true);
  // A saved theme wins, and the header is Showa Poster's only.
  await page.evaluate(() =>
    window.localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "off", theme: "grey" }),
    ),
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "grey");
  await expect(page.getByTestId("theme-header")).toBeHidden();
});

for (const theme of THEMES)
  test(`/debug and the rules panel meet AA in the ${theme} theme`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t, showRules: true }),
      );
    }, theme);
    await page.goto("/debug");
    await expect(page.getByTestId("start-game")).toBeVisible();
    expect(await contrastProblems(page)).toEqual([]);
    await humanBoard(page);
    await page.getByTestId("rule-link").first().click();
    await expect(page.getByTestId("rules-panel")).toBeVisible();
    expect(await contrastProblems(page)).toEqual([]);
  });

test("Showa Poster themes the form controls: 2 px ink borders, Zen Kaku Gothic New, 44 px buttons and selects, marigold primary actions, a red accent; Grey keeps the browser's", async ({
  page,
}) => {
  await page.goto("/play");
  const css = (id: string, prop: string) =>
    page
      .getByTestId(id)
      .first()
      .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
  const height = async (id: string) =>
    (await page.getByTestId(id).first().boundingBox())?.height ?? 0;
  await expect(page.getByTestId("deck-P1")).toBeVisible();
  for (const id of ["deck-P1", "seed-input", "dev-deck-filter"]) {
    expect(await css(id, "border-top-width"), id).toBe("2px");
    expect(await css(id, "border-top-color"), id).toBe("rgb(26, 20, 16)");
    expect(await css(id, "font-family"), id).toMatch(/^"?Zen Kaku Gothic New/);
    expect(await height(id), id).toBeGreaterThanOrEqual(44);
  }
  // The seat presets (Easy / Medium / Hard), Export all, and the primary actions.
  expect(await height("export-decks")).toBeGreaterThanOrEqual(44);
  for (const id of ["start-game", "import-deck"])
    expect(await css(id, "background-color"), id).toBe("rgb(244, 179, 35)");
  expect(
    await page
      .locator('input[type="radio"]')
      .first()
      .evaluate((el) => getComputedStyle(el).accentColor),
  ).toBe("rgb(215, 38, 30)");
  // The board's own controls keep their look: the log's card links stay one line tall.
  await page.getByTestId("start-game").click();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  const line = page.getByTestId("log-line").first();
  expect((await line.boundingBox())?.height ?? 99).toBeLessThan(30);

  // Grey keeps the browser's controls.
  await page.evaluate(() =>
    window.localStorage.setItem(
      "gojisim.settings",
      JSON.stringify({ animation: "off", theme: "grey" }),
    ),
  );
  await page.goto("/play");
  await expect(page.getByTestId("deck-P1")).toBeVisible();
  expect(await css("seed-input", "font-family")).not.toMatch(/Zen Kaku/);
  expect(await css("seed-input", "border-top-color")).not.toBe(
    "rgb(26, 20, 16)",
  );
  expect(await css("import-deck", "background-color")).not.toBe(
    "rgb(244, 179, 35)",
  );
});

for (const theme of THEMES)
  test(`a yes/no prompt's card text uses the prompt's width, not a card's (${theme})`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ animation: "off", theme: t }),
      );
    }, theme);
    await loadFixture(page, "confirm");
    const text = await page.getByTestId("confirm-text").boundingBox();
    const words = await page.getByTestId("confirm-words").boundingBox();
    if (!text || !words) throw new Error("no prompt");
    // It was capped at two card widths (about 120 px) and wrapped in a narrow column.
    expect(text.width).toBeGreaterThan(300);
    expect(Math.abs(text.width - words.width)).toBeLessThan(2);
  });

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { loadFixture, startGame, vsBot } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/** M5g: the theme setting (Dark / Grey / Light), built from theme.css variables. */

const THEMES = ["dark", "grey", "light"] as const;

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** A board on the human's turn 1 against the bot (M5h: no hotseat). */
const humanBoard = (page: Page) => vsBot(page, 2);

test("each theme changes the page background and survives a reload; Grey is the default", async ({
  page,
}) => {
  await humanBoard(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "grey");
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
  // Three different backgrounds.
  expect(seen.size).toBe(3);
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
    expect(new Set(backgrounds[path]).size, path).toBe(3);
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

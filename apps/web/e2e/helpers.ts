import { expect, type Page } from "@playwright/test";

/** The turn number, or -1 while the hotseat cover hides the board. */
export async function turnNumber(page: Page): Promise<number> {
  const turn = page.getByTestId("turn");
  return (await turn.count()) ? Number(await turn.textContent()) : -1;
}

/**
 * Passes and waits for the next turn: confirms "Pass with playable cards left?" and clears the
 * hotseat privacy cover when they appear (M5c).
 */
export async function passTurn(page: Page): Promise<void> {
  const turn = await turnNumber(page);
  await page.getByTestId("pass").click();
  await expect
    .poll(
      async () => {
        for (const id of ["confirm-yes", "privacy-cover"]) {
          const button = page.getByTestId(id);
          if (await button.count()) await button.click();
        }
        return turnNumber(page);
      },
      { intervals: [100] },
    )
    .toBe(turn + 1);
}

/** Opens `/play` and loads a choice fixture record (e2e/fixtures, made by generate.ts). */
export async function loadFixture(page: Page, name: string): Promise<void> {
  await page.goto("/play?mode=bot");
  await page
    .getByTestId("load-record")
    .setInputFiles(
      new URL(`./fixtures/${name}.json`, import.meta.url).pathname,
    );
  await expect(page.getByTestId("board")).toBeVisible();
}

/**
 * Starts the game set up on the new-game screen. The First / Second pick (M5e) picks the card
 * with the picker's own seat index unless `card` is given, which keeps the first player each seed
 * had before M5e. Two bot seats skip the pick.
 */
export async function startGame(page: Page, card?: 0 | 1): Promise<void> {
  await page.getByTestId("start-game").click();
  const pick = page.getByTestId("first-pick");
  await expect(pick.or(page.getByTestId("board"))).toBeVisible();
  if (!(await pick.isVisible())) return;
  const picker = await pick.getAttribute("data-picker");
  await page
    .getByTestId(`first-pick-card-${card ?? (picker === "P2" ? 1 : 0)}`)
    .click();
  await page.getByTestId("first-pick-continue").click();
  await expect(page.getByTestId("board")).toBeVisible();
}

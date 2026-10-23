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

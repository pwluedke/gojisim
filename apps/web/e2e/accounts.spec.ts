import { expect, test } from "@playwright/test";
import { vsBot } from "./helpers";

/**
 * Player accounts (#150) in the dev server: no player without signing in (the password gate and
 * no gate show none); the dev sign-in shows "Dev Tester" on the menu and in /play's Settings, and
 * Sign out ends it. The deployed server has no dev sign-in (`e2e-prod/accounts.spec.ts`).
 */

test("#150: no player badge until signed in; the dev sign-in shows it on the menu and in Settings; Sign out ends it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GojiSim" })).toBeVisible();
  await expect(page.getByTestId("player-badge")).toHaveCount(0);

  await page.goto("/auth/dev?next=/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("player-name").first()).toHaveText(
    "Dev Tester",
  );
  // #153: the beta season's tag, with its note.
  await expect(page.getByTestId("beta-tag").first()).toHaveAttribute(
    "title",
    "Beta games don't count toward your record.",
  );

  await vsBot(page, 1);
  await page.getByTestId("settings").click();
  await expect(
    page.getByTestId("settings").locator("..").getByTestId("player-name"),
  ).toHaveText("Dev Tester");

  await page.goto("/");
  await page.getByTestId("sign-out").first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("player-badge")).toHaveCount(0);
});

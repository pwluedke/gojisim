import { expect, test } from "@playwright/test";

test("shows the GojiSim heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GojiSim" })).toBeVisible();
});

// TEMPORARY (CI speed PR): checks that a failing shard fails the ci job and uploads one merged
// report. Reverted in the next commit.
test("temporary failure for the CI report check", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Not GojiSim" })).toBeVisible({
    timeout: 1000,
  });
});

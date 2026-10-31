import { expect, type Page, test } from "@playwright/test";
import { vsBot } from "./helpers";

const API = "**/__e2e/releases/latest";
const latest = (page: Page, tag: string) =>
  page.route(API, (route) =>
    route.fulfill({ json: { tag_name: tag, name: "Release" } }),
  );

test("#134: the menu's What's new link opens the latest release in a new tab, with a New dot until it's opened", async ({
  page,
}) => {
  await latest(page, "release-2026-10-30-1");
  await page.goto("/");
  const link = page.getByTestId("whats-new");
  await expect(link).toHaveAttribute(
    "href",
    "https://github.com/pwluedke/gojisim/releases/latest",
  );
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("whats-new-dot")).toBeVisible();
  // Opening it remembers the tag (the new tab itself is blocked, so no test reaches GitHub).
  await page.context().route("https://github.com/**", (route) => route.abort());
  const popup = page.waitForEvent("popup");
  await link.click();
  await (await popup).close();
  await expect(page.getByTestId("whats-new-dot")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("whats-new")).toBeVisible();
  await expect(page.getByTestId("whats-new-dot")).toHaveCount(0);
  // A newer release brings the dot back.
  await page.unroute(API);
  await latest(page, "release-2026-10-31-1");
  await page.reload();
  await expect(page.getByTestId("whats-new-dot")).toBeVisible();
});

test("#134: when the tag can't be read, the link shows with no dot; /play's Settings bar has the link too", async ({
  page,
}) => {
  await page.route(API, (route) => route.fulfill({ status: 403, json: {} }));
  await page.goto("/");
  await expect(page.getByTestId("whats-new")).toBeVisible();
  await expect(page.getByTestId("whats-new-dot")).toHaveCount(0);
  await page.unroute(API);
  await latest(page, "release-2026-10-30-1");
  await vsBot(page, 1);
  // On the Settings bar: visible with Settings closed.
  const link = page.getByTestId("settings").getByTestId("whats-new");
  await expect(link).toBeVisible();
  await expect(page.getByTestId("whats-new-dot")).toBeVisible();
  // Opening it doesn't toggle Settings.
  await page.context().route("https://github.com/**", (route) => route.abort());
  const popup = page.waitForEvent("popup");
  await link.click();
  await (await popup).close();
  await expect(page.getByTestId("whats-new-dot")).toHaveCount(0);
  await expect(page.getByTestId("setting-bot-delay")).toBeHidden();
});

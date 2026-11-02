import { expect, test } from "@playwright/test";

/**
 * #150: the built server has no dev sign-in. `/auth/dev` lives only in the Vite dev server's
 * middleware; here it is just another path behind the gate: no cookie is set, and no player
 * appears, before or after the testers' password.
 */
const PASSWORD = "e2e testers only";

test("#150: /auth/dev on the production build signs no one in, with or without the password", async ({
  page,
  request,
}) => {
  const before = await request.get("/auth/dev?next=%2F", { maxRedirects: 0 });
  expect(before.status()).toBe(303);
  expect(before.headers()["location"]).toMatch(/^\/login\?next=/);
  expect(before.headers()["set-cookie"] ?? "").not.toContain(
    "gojisim_dev_player",
  );
  expect((await request.get("/api/me", { maxRedirects: 0 })).status()).toBe(
    401,
  );

  await page.goto("/login?next=%2Fplay");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByTestId("start-game")).toBeVisible();
  const after = await page.request.get("/auth/dev?next=%2F", {
    maxRedirects: 0,
  });
  expect(after.headers()["set-cookie"] ?? "").not.toContain(
    "gojisim_dev_player",
  );
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(404);
  expect(await me.json()).toEqual({ error: "no-accounts" });
  await page.goto("/");
  await expect(page.getByTestId("player-badge")).toHaveCount(0);
});

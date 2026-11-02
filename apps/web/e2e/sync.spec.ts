import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { importInDeckbuilder } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * #152: My decks and Settings follow the player. The dev server signs in "Dev Tester"
 * (`/auth/dev`); this test plays the account server (`/api/me/decks`, `/api/me/settings`) with an
 * in-memory copy, so it sees exactly what the app sends.
 */
const list = readFileSync(
  new URL(
    "../../../packages/cards/test/fixtures/godzillatcgdb-print-tabs.txt",
    import.meta.url,
  ),
  "utf8",
);

interface Deck {
  id: string;
  name: string;
  list: string;
  updatedAt: string;
  deleted: boolean;
}

/** The fake account: its decks and settings, and every write the app sent. */
async function fakeAccount(
  page: Page,
  decks: Deck[],
  settings: Record<string, unknown> | null,
) {
  const store = {
    decks: [...decks],
    settings,
    settingsAt: settings ? "2026-11-01T20:00:00.000Z" : null,
  };
  const writes: string[] = [];
  await page.route("**/api/me/decks", (route) =>
    route.fulfill({ json: { decks: store.decks } }),
  );
  await page.route("**/api/me/decks/*", async (route) => {
    const req = route.request();
    const id = decodeURIComponent(
      new URL(req.url()).pathname.split("/").pop() ?? "",
    );
    const body = req.postDataJSON() as {
      name?: string;
      list?: string;
      updatedAt: string;
    };
    writes.push(`${req.method()} ${id} ${body.name ?? ""}`);
    const deck: Deck = {
      id,
      name: body.name ?? "",
      list: body.list ?? "",
      updatedAt: body.updatedAt,
      deleted: req.method() === "DELETE",
    };
    store.decks = [...store.decks.filter((d) => d.id !== id), deck];
    await route.fulfill({ json: { deck } });
  });
  await page.route("**/api/me/settings", async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const body = req.postDataJSON() as {
        settings: Record<string, unknown>;
        updatedAt: string;
      };
      writes.push(`PUT settings sound=${String(body.settings["sound"])}`);
      store.settings = body.settings;
      store.settingsAt = body.updatedAt;
    }
    await route.fulfill({
      json: { settings: store.settings, updatedAt: store.settingsAt },
    });
  });
  return { store, writes };
}

/** Saves a deck in the Deckbuilder (#161: decks are imported there). */
async function saveLocalDeck(page: Page, name: string) {
  await importInDeckbuilder(page, list, name);
}

/** The Deckbuilder's My decks window's deck names (it opens if closed). */
async function names(page: Page) {
  const win = page.getByTestId("db-decks-window");
  if (!(await win.isVisible())) await page.getByTestId("db-my-decks").click();
  return win.locator('[data-testid="db-deck"] > span:first-child');
}

test("#152: at first sign-in, this browser's decks are offered once (a name clash asks), the account's arrive, and changes go to the account", async ({
  page,
}) => {
  // Before signing in: two decks in this browser only.
  await page.goto("/decks");
  await saveLocalDeck(page, "Local Green");
  await saveLocalDeck(page, "Red Rush");

  const account = await fakeAccount(
    page,
    [
      {
        id: "acct-blue",
        name: "Account Blue",
        list: `[deck] Account Blue\n${list}`,
        updatedAt: "2026-11-01T19:00:00.000Z",
        deleted: false,
      },
      {
        id: "acct-red",
        name: "Red Rush",
        list: "[deck] Red Rush\n4 ESD02-001",
        updatedAt: "2026-11-01T19:00:00.000Z",
        deleted: false,
      },
    ],
    { theme: "grey", sound: true },
  );
  // The offer is in the Deckbuilder (#161).
  await page.goto("/auth/dev?next=%2Fdecks");

  // The account's decks arrived; nothing of this browser's is lost.
  await expect(await names(page)).toHaveText(
    ["Local Green", "Red Rush", "Account Blue", "Red Rush"],
    { useInnerText: true },
  );
  // The window covers the page; close it to answer the offer.
  await page.getByTestId("db-decks-close").click();
  const offer = page.getByTestId("sync-offer");
  await expect(offer).toContainText(
    "2 decks saved in this browser aren't in your account yet.",
  );
  await expect(offer.getByTestId("sync-clash")).toContainText(
    'Your account already has a different "Red Rush"',
  );
  await offer.getByTestId("sync-clash").locator("select").selectOption("both");
  await offer.getByTestId("sync-upload").click();
  await expect(offer).toHaveCount(0);
  await expect
    .poll(() =>
      account.writes
        .filter((w) => w.startsWith("PUT ") && !w.includes("settings"))
        .map((w) => w.split(" ").slice(2).join(" "))
        .sort(),
    )
    .toEqual(["Local Green", "Red Rush (this browser)"]);
  await expect(await names(page)).toContainText(["Red Rush (this browser)"]);

  // Asked once: a reload shows no offer.
  await page.reload();
  await expect((await names(page)).first()).toBeVisible();
  await expect(page.getByTestId("sync-offer")).toHaveCount(0);

  // A delete here reaches the account.
  const blue = page.locator(
    '[data-testid="db-deck"][data-deck-name="Account Blue"]',
  );
  await blue.getByTestId("db-delete").click();
  await blue.getByTestId("db-delete-confirm").click();
  await expect
    .poll(() => account.writes.some((w) => w.startsWith("DELETE acct-blue")))
    .toBe(true);
});

test("#152: the account's settings win at sign-in, and a change goes to the account", async ({
  page,
}) => {
  const account = await fakeAccount(page, [], {
    theme: "grey",
    sound: true,
    volume: 30,
  });
  await page.goto("/auth/dev?next=%2Fplay%3Fmode%3Dbot");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "grey");
  await page.getByTestId("start-game").click();
  await page.getByTestId("first-pick-card-0").click();
  await page.getByTestId("first-pick-continue").click();
  await page.getByTestId("settings").click();
  await expect(page.getByTestId("setting-volume")).toHaveValue("30");
  await page.getByTestId("setting-sound").uncheck();
  await expect
    .poll(() => account.writes.includes("PUT settings sound=false"), {
      timeout: 5000,
    })
    .toBe(true);
});

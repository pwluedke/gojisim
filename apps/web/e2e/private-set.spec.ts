import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * The private card set, on a made-up set (one placeholder card, PRV-901). Only the accounts the
 * server names get `/api/private-set` (its gate is tested in `privateSet.test.ts` on the server);
 * the e2e dev server has no set, so every page here is "another account" until the route is
 * answered for the owner. The deck is the ESD01 starter with its four Shinseimaru swapped for the
 * placeholder.
 */
const starter = readFileSync(
  new URL(
    "../../../packages/cards/data/decks/esd01-starter.txt",
    import.meta.url,
  ),
  "utf8",
);
const CARD = {
  id: 990901,
  cardNumber: "PRV-901",
  baseCardNumber: "PRV-901",
  isParallel: false,
  parentId: null,
  deckCardNumber: "PRV-901",
  name: "Private Test Card",
  set: "PRV",
  colors: ["Red"],
  type: "Battle",
  traits: ["Boat"],
  rank: 2,
  counterOrThreat: 2000,
  invadeZones: 1,
  rarity: "C",
  movie: null,
  text: "A placeholder.",
  notes: null,
  imageUrl: "https://gojisim.invalid/private-set/990901.png",
  unknownFields: {},
};
const SET = JSON.stringify({
  cards: [CARD],
  abilities: {
    "PRV-901": { deckCardNumber: "PRV-901", status: "manual", abilities: [] },
  },
  decks: [
    {
      name: "Private Test Deck",
      list: starter
        .replace(/^\[deck\].*$/m, "[deck] Private Test Deck")
        .replace("4 ESD01-008", "4 PRV-901"),
    },
  ],
});

/** Answers the private set's route as the server does for its owner. */
const asOwner = (page: Page) =>
  page.route("**/api/private-set", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: SET }),
  );

const pickerOptions = (page: Page) =>
  page
    .getByTestId("deck-P1")
    .locator("option")
    .evaluateAll((els) => els.map((e) => e.textContent ?? ""));

test("another account (no set from the server) sees no private deck or card", async ({
  page,
}) => {
  await page.goto("/play?mode=bot");
  await expect
    .poll(async () => (await pickerOptions(page)).length)
    .toBeGreaterThan(1);
  expect((await pickerOptions(page)).join("|")).not.toContain(
    "Private Test Deck",
  );
  await page.goto("/decks?q=private+test+card");
  await expect(page.getByTestId("db-count")).toHaveText(/^0 /);
});

test("the owner gets the set's deck in the pickers and its cards drawn as text cards", async ({
  page,
}) => {
  await asOwner(page);
  await page.goto("/play?mode=bot");
  await expect
    .poll(async () => (await pickerOptions(page)).join("|"))
    .toContain("Private Test Deck");
  await page.goto("/decks?q=private+test+card");
  const card = page.getByTestId("db-card").first();
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-card-number", "PRV-901");
  await expect(card.locator("img").first()).toHaveAttribute(
    "src",
    /^data:image\/svg\+xml/,
  );
});

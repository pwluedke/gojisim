import { getCardAbilities } from "@gojisim/cards";
import { findCardByNumber } from "@gojisim/cards/deck-lists";
import { describe, expect, it } from "vitest";
import { cardImage, textCard } from "./cardImage";
import { loadPrivateSet, privateBotSet } from "./privateSet";

/** The private card set's client side, on a made-up set (one placeholder card). */
const CARD = {
  id: 990201,
  cardNumber: "PRV-101",
  baseCardNumber: "PRV-101",
  isParallel: false,
  parentId: null,
  deckCardNumber: "PRV-101",
  name: "Private Test Card",
  set: "PRV",
  colors: ["Red"],
  type: "Battle",
  traits: ["Weapon"],
  rank: 1,
  counterOrThreat: 1000,
  invadeZones: 2,
  rarity: "C",
  movie: null,
  text: "A placeholder & <test>.",
  notes: null,
  imageUrl: "https://gojisim.invalid/private-set/990201.png",
  unknownFields: {},
};
const SET = {
  cards: [CARD],
  abilities: {
    "PRV-101": { deckCardNumber: "PRV-101", status: "manual", abilities: [] },
  },
  decks: [
    {
      name: "Private Test Deck",
      list: "[deck] Private Test Deck\n[monster deck]\n1 ESD01-001\n[main deck]\n4 PRV-101\n",
    },
  ],
};
const answer = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("the private card set, in the browser", () => {
  it("a 404 (any account without the set) registers nothing", async () => {
    expect(await loadPrivateSet(answer(404, {}))).toBeNull();
    expect(findCardByNumber("PRV-101")).toBeUndefined();
    expect(privateBotSet()).toBeNull();
    expect(cardImage(CARD.id, "thumb")).toBe(`/cards/${CARD.id}-thumb.webp`);
  });

  it("the owner's set is registered: cards, abilities, decks, and drawn faces", async () => {
    const set = await loadPrivateSet(answer(200, SET));
    expect(set?.decks.map((d) => d.name)).toEqual(["Private Test Deck"]);
    expect(findCardByNumber("PRV-101")?.name).toBe("Private Test Card");
    expect(getCardAbilities("PRV-101").status).toBe("manual");
    // The bot's worker shares nothing with the page, so it gets the cards too (with their tokens).
    expect(privateBotSet()).toEqual({
      cards: SET.cards,
      abilities: SET.abilities,
    });
    const src = cardImage(CARD.id, "full");
    expect(src.startsWith("data:image/svg+xml")).toBe(true);
    // A scanned card keeps its image.
    expect(cardImage(15, "thumb")).toBe("/cards/15-thumb.webp");
  });

  it("a text card shows the name, type and rank, power, traits, escaped text and the icon; a token gets a ring", () => {
    const svg = textCard(CARD as never);
    for (const part of [
      "Private Test Card",
      "Battle · Rank 1",
      "Counter power 1,000",
      "《Weapon》",
      "A placeholder &amp; &lt;test&gt;.",
      ">2</text>",
    ])
      expect(svg).toContain(part);
    expect(svg).toContain("#d7261e");
    const white = textCard({ ...CARD, colors: ["White"] } as never);
    expect(white).not.toContain("#d7261e");
    const token = textCard({
      ...CARD,
      type: "Token",
      invadeZones: null,
      text: "",
    } as never);
    expect(token).toContain('r="70" fill="none"');
  });
});

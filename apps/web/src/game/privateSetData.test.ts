import { getTokenCard } from "@gojisim/cards";
import { describe, expect, it } from "vitest";
import { registerPrivateSet } from "./privateSetData";

/** A made-up set with a token, registered as the bot's worker does on each request. */
const TOKEN = {
  id: 990301,
  cardNumber: "PRV-T01",
  baseCardNumber: "PRV-T01",
  isParallel: false,
  parentId: null,
  deckCardNumber: "PRV-T01",
  name: "Private Test Token",
  set: "PRV",
  colors: ["Red"],
  type: "Token",
  traits: ["Token"],
  rank: 1,
  counterOrThreat: 1000,
  invadeZones: null,
  rarity: "C",
  movie: null,
  text: "",
  notes: null,
  imageUrl: "https://gojisim.invalid/private-set/990301.png",
  unknownFields: {},
};

describe("the private set in the bot's worker", () => {
  it("registers the cards before the abilities, so the set's tokens exist (a bot that couldn't create one stalled the game)", () => {
    expect(() => getTokenCard("Private Test Token")).toThrow();
    const data = {
      cards: [TOKEN],
      abilities: {
        "PRV-T01": {
          deckCardNumber: "PRV-T01",
          status: "manual",
          abilities: [],
        },
      },
    };
    registerPrivateSet(data);
    expect(getTokenCard("Private Test Token").id).toBe(990301);
    // Every request carries the set: registering it again changes nothing.
    expect(() => registerPrivateSet(data)).not.toThrow();
  });
});

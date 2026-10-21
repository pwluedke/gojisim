import { type Card, CardSchema } from "@gojisim/cards";
import type { CreateGameOptions, PlayerSetup } from "../../src";

/** Test-only card. Fixture ids start at 900000 so they never collide with cards.json. */
export function testCard(overrides: Partial<Card> & Pick<Card, "id">): Card {
  const cardNumber = overrides.cardNumber ?? `TEST-${overrides.id}`;
  return CardSchema.parse({
    cardNumber,
    baseCardNumber: cardNumber,
    isParallel: false,
    parentId: null,
    deckCardNumber: cardNumber,
    name: `Test card ${overrides.id}`,
    set: "TEST",
    colors: ["Red"],
    type: "Battle",
    traits: [],
    rank: 1,
    counterOrThreat: 1000,
    invadeZones: 1,
    rarity: "C",
    movie: null,
    text: "",
    notes: null,
    imageUrl: `https://example.invalid/${overrides.id}.png`,
    unknownFields: {},
    ...overrides,
  });
}

/**
 * A 4-card monster deck (ranks I to IV, shared trait) and a 50-card main deck of plain battle
 * cards. Each player gets its own id range: player index 0 uses 900000+, index 1 uses 910000+.
 */
export function testDeck(id: string, playerIndex: number): PlayerSetup {
  const base = 900000 + playerIndex * 10000;
  const monsterDeck = [1, 2, 3, 4].map((rank) =>
    testCard({
      id: base + rank,
      name: `${id} monster rank ${rank}`,
      type: "Monster",
      traits: ["Testzilla"],
      rank,
      counterOrThreat: 5000 + rank * 1000,
    }),
  );
  const mainDeck = Array.from({ length: 50 }, (_, i) =>
    testCard({
      id: base + 100 + i,
      name: `${id} battle ${i}`,
      rank: (i % 4) + 1,
    }),
  );
  return { id, monsterDeck, mainDeck };
}

export function testGameOptions(seed: number | string = 42): CreateGameOptions {
  return { seed, players: [testDeck("alice", 0), testDeck("bob", 1)] };
}

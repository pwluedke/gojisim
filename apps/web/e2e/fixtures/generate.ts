/**
 * Writes the M5c choice fixtures: game records that stop at a pending choice for P1 (a human
 * seat), found by playing seeded games with the weighted policy. Each record replays exactly in
 * `/play` ("Load a game record"). Run: `pnpm --filter @gojisim/web e2e:fixtures`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { buildTestDeck } from "@gojisim/cards/test-decks";
import { stateBoard, weightedPick } from "@gojisim/bot";
import {
  advanceToDecision,
  applyAction,
  getLegalActions,
  type GameRecord,
  type GameState,
  type PendingChoice,
  startGame,
} from "@gojisim/engine";

const data = (path: string) =>
  readFileSync(
    new URL(`../../../../packages/cards/data/${path}`, import.meta.url),
    "utf8",
  );
const cards = JSON.parse(data("cards.json")) as Card[];
const byId = (id: number) => cards.find((c) => c.id === id) as Card;
const starter = (file: string) => {
  const deck = parseDeckList(data(`decks/${file}`)).decks[0];
  if (!deck) throw new Error(file);
  return deck;
};
const esd01 = starter("esd01-starter.txt");
const esd02 = starter("esd02-starter.txt");

type Deck = { monsterDeck: Card[]; mainDeck: Card[] };
/** P1's monster deck holds two rank II monsters, so a counter asks for the next one (5.15.1.2). */
const twoRankII: Deck = {
  monsterDeck: [byId(3), byId(5), byId(676), byId(7), byId(8)],
  mainDeck: esd01.mainDeck,
};
/** P1 plays EBP01-017, which has no ability data yet: it opens a manual window. */
const withManual: Deck = {
  monsterDeck: esd01.monsterDeck,
  mainDeck: esd01.mainDeck.map((c) =>
    c.deckCardNumber === "ESD01-013" ? byId(146) : c,
  ),
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

interface Fixture {
  name: string;
  note: string;
  decks: (game: number) => [Deck, Deck];
  match: (choice: PendingChoice, state: GameState) => boolean;
}

const official = (): [Deck, Deck] => [esd01, esd02];
const randomDecks = (g: number): [Deck, Deck] =>
  g % 2
    ? [esd01, esd02]
    : [buildTestDeck("ESD01", g), buildTestDeck("ESD02", g)];
const source = (state: GameState) =>
  state.resolution
    ? state.cards[state.resolution.standby.sourceCardId]?.deckCardNumber
    : undefined;

const FIXTURES: Fixture[] = [
  {
    name: "target",
    note: "P1 targets a card for an ability (10.5.3)",
    decks: randomDecks,
    match: (c) => c.kind === "target" && c.rule === "10.5.3",
  },
  {
    name: "search",
    note: 'P1 searches their deck "up to 1", with find nothing as Done (5.8.1 or 12.6.2)',
    decks: randomDecks,
    match: (c) =>
      c.kind === "target" && (c.rule === "5.8.1" || c.rule === "12.6.2"),
  },
  {
    name: "discard-bot-turn",
    note: "P1 (human) discards during P2's (bot) turn, for ESD01-005 or ESD01-015 (5.7.2)",
    decks: (g) => (g % 2 ? [esd02, esd01] : [esd01, esd01]),
    match: (c, s) =>
      c.kind === "target" &&
      c.rule.startsWith("5.7") &&
      s.turnPlayer === "P2" &&
      ["ESD01-005", "ESD01-015"].includes(source(s) ?? ""),
  },
  {
    name: "zone",
    note: "P1 chooses a zone (5.11.1, 10.5.2.2 or 5.2.1)",
    decks: official,
    match: (c) => c.kind === "zone",
  },
  {
    name: "confirm",
    note: "P1 decides whether to use an optional ability: ESD02 Evolution (10.5.4)",
    decks: () => [esd02, esd01],
    match: (c) => c.kind === "confirm",
  },
  {
    name: "standby-order",
    note: "P1 picks which standby ability resolves first (10.4.3.2)",
    decks: randomDecks,
    match: (c) => c.kind === "standbyOrder",
  },
  {
    name: "next-monster",
    note: "P1 picks the next monster after a counter, from two rank II monsters (5.15.1.2)",
    decks: () => [twoRankII, esd02],
    match: (c) => c.kind === "nextMonster",
  },
  {
    name: "manual",
    note: "P1 resolves EBP01-017 by hand: a manual override window",
    decks: () => [withManual, esd02],
    match: (c) => c.kind === "manual",
  },
];

for (const fixture of FIXTURES) {
  let found: GameRecord | null = null;
  for (let g = 0; g < 2000 && !found; g++) {
    const [a, b] = fixture.decks(g);
    const record: GameRecord = {
      version: 1,
      seed: g,
      decks: [
        { id: "P1", monsterDeck: a.monsterDeck, mainDeck: a.mainDeck },
        { id: "P2", monsterDeck: b.monsterDeck, mainDeck: b.mainDeck },
      ],
      actions: [],
      seats: {
        P1: { kind: "human" },
        P2: { kind: "bot", bot: "ismcts", settings: { difficulty: 55 } },
      },
      botSeed: `${g}-bots`,
    };
    let state = startGame(record);
    const pick = rng(g);
    for (let i = 0; i < 4000 && !state.result; i++) {
      const choice = state.pendingChoice;
      if (choice?.player === "P1" && fixture.match(choice, state)) {
        found = record;
        break;
      }
      const who = choice?.player ?? state.turnPlayer;
      const legal = getLegalActions(state, who).filter(
        (x) => x.type !== "concede",
      );
      const action = weightedPick(stateBoard(state), legal, (n) =>
        Math.floor(pick() * n),
      );
      record.actions.push(action);
      state = advanceToDecision(applyAction(state, action));
    }
  }
  if (!found) {
    console.log(`${fixture.name}: not found`);
    continue;
  }
  const path = new URL(`./${fixture.name}.json`, import.meta.url);
  writeFileSync(path, `${JSON.stringify({ note: fixture.note, ...found })}\n`);
  console.log(
    `${fixture.name}: seed ${found.seed}, ${found.actions.length} actions`,
  );
}

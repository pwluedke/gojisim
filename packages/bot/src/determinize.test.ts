import { readFileSync } from "node:fs";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { buildTestDeck, getAllCards } from "@gojisim/cards/test-decks";
import {
  advanceToDecision,
  applyAction,
  checkInvariants,
  type GameState,
  getPlayerView,
  type PlayerId,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { randomBot, weightedBot } from "./baseline";
import { determinize } from "./determinize";
import { botInput, decklistsOf, seededRng } from "./input";

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}

function decksFor(game: number): [PlayerSetup, PlayerSetup] {
  if (game % 2 === 0)
    return [
      { id: "P1", ...official("esd01-starter.txt") },
      { id: "P2", ...official("esd02-starter.txt") },
    ];
  return [
    { id: "P1", ...buildTestDeck("ESD02", `det-${game}-1`) },
    { id: "P2", ...buildTestDeck("ESD01", `det-${game}-2`) },
  ];
}

const decider = (state: GameState): PlayerId =>
  state.pendingChoice?.player ?? state.turnPlayer;

/** Decision points (with their decider) from bot games, every `every`-th one. */
function samples(games: number, every: number) {
  const found: { state: GameState; decks: [PlayerSetup, PlayerSetup] }[] = [];
  for (let game = 0; game < games; game++) {
    const decks = decksFor(game);
    const lists = decklistsOf(decks);
    const rng = seededRng(`det-${game}`);
    let state = advanceToDecision(startGame({ seed: `det-${game}`, decks }));
    for (let n = 0; state.result === null && state.turn < 80; n++) {
      if (n % every === 0) found.push({ state, decks });
      const bot = game % 3 === 0 ? randomBot : weightedBot;
      const action = bot.chooseAction(
        botInput(state, decider(state), lists, rng),
      );
      state = advanceToDecision(applyAction(state, action));
    }
  }
  return found;
}

const allCards = (state: GameState, id: PlayerId) => {
  const p = state.players.find((x) => x.id === id);
  if (!p) return [];
  return [
    ...p.hand,
    ...p.deck,
    ...p.discard,
    ...p.monsterDeck,
    ...p.invadingMonsterZone,
    ...Object.values(p.zones).flat(2),
    ...p.strategyZones.flat().map((s) => s.card),
    ...state.resolutionArea.filter((c) => c.owner === id),
  ]
    .map((c) => c.cardId)
    .sort((a, b) => a - b);
};

describe("determinize (M6a)", () => {
  const points = samples(40, 7).slice(0, 200);

  it("has 200 mid-game decision points to check, choices of every common kind among them", () => {
    expect(points).toHaveLength(200);
    const kinds = new Set(
      points.map((p) => p.state.pendingChoice?.kind ?? "play timing"),
    );
    expect(kinds.has("play timing")).toBe(true);
    expect(kinds.has("target")).toBe(true);
  });

  it("over 200 mid-game states: conservation, public areas and own hidden areas exact, invariants pass", () => {
    for (const [i, { state, decks }] of points.entries()) {
      const viewer = decider(state);
      const view = getPlayerView(state, viewer);
      const det = determinize(
        view,
        { decks: decklistsOf(decks), log: view.log },
        seededRng(i),
      );
      // Everything the viewer sees is exactly the same, own hand and monster deck included.
      expect(getPlayerView(det, viewer), `state ${i}`).toEqual(view);
      // Card conservation: each player's cards are exactly their presented decks (6.3.1.1).
      for (const deck of decks)
        expect(allCards(det, deck.id), `state ${i} ${deck.id}`).toEqual(
          [...deck.monsterDeck, ...deck.mainDeck]
            .map((c) => c.id)
            .sort((a, b) => a - b),
        );
      expect(checkInvariants(det), `state ${i}`).toEqual([]);
    }
  });

  it("a determinized state is playable: the viewer's legal actions match, and the game goes on", () => {
    for (const [i, { state, decks }] of points.slice(0, 40).entries()) {
      const viewer = decider(state);
      const view = getPlayerView(state, viewer);
      const lists = decklistsOf(decks);
      const det = determinize(
        view,
        { decks: lists, log: view.log },
        seededRng(i),
      );
      const input = botInput(det, viewer, lists, seededRng(i));
      expect(input.legalActions, `state ${i}`).toEqual(
        botInput(state, viewer, lists, seededRng(i)).legalActions,
      );
      const action = randomBot.chooseAction(input);
      expect(() => advanceToDecision(applyAction(det, action))).not.toThrow();
    }
  });
});

describe("no peeking (M6a rule for every bot)", () => {
  /** The same state with the opponent's hand and deck mixed up, and both decks reordered. */
  function differentHidden(state: GameState, viewer: PlayerId): GameState {
    const other = JSON.parse(JSON.stringify(state)) as GameState;
    const opp = other.players.find((p) => p.id !== viewer);
    const me = other.players.find((p) => p.id === viewer);
    if (!opp || !me) throw new Error("players");
    // Swap the opponent's hand cards with cards from their deck (same instance ids kept in place
    // only for the slots; the cards behind them change).
    const swaps = Math.min(opp.hand.length, opp.deck.length);
    for (let i = 0; i < swaps; i++) {
      const h = opp.hand[i];
      const d = opp.deck[opp.deck.length - 1 - i];
      if (h && d) {
        opp.hand[i] = d;
        opp.deck[opp.deck.length - 1 - i] = h;
      }
    }
    opp.deck.reverse();
    me.deck.reverse();
    return other;
  }

  it("two states that differ only in hidden information give the bot identical inputs and identical determinizations", () => {
    const points = samples(6, 11).filter(
      (p) => p.state.pendingChoice === null || !p.state.pendingChoice.private,
    );
    let compared = 0;
    for (const [i, { state, decks }] of points.entries()) {
      const viewer = decider(state);
      const variant = differentHidden(state, viewer);
      const opp = state.players.find((p) => p.id !== viewer);
      const changed =
        JSON.stringify(variant.players.find((p) => p.id !== viewer)?.hand) !==
        JSON.stringify(opp?.hand);
      if (!changed) continue;
      compared++;
      const lists = decklistsOf(decks);
      const a = botInput(state, viewer, lists, seededRng(i));
      const b = botInput(variant, viewer, lists, seededRng(i));
      expect({ ...b, rng: null }, `state ${i}`).toEqual({ ...a, rng: null });
      expect(determinize(b.view, b.knowledge, seededRng(i))).toEqual(
        determinize(a.view, a.knowledge, seededRng(i)),
      );
    }
    expect(compared).toBeGreaterThan(20);
  });
});

describe("determinize: monster deck cards placed under the monster (M2, Q22)", () => {
  it("after EBP04-012's play from rank II, the opponent's view determinizes with every card accounted for", () => {
    const cards = (numbers: string[]) =>
      numbers.map((n) => {
        const found = getAllCards().find(
          (c) => c.cardNumber === n && !c.isParallel,
        );
        if (!found) throw new Error(n);
        return found;
      });
    const biollante: PlayerSetup = {
      id: "P1",
      monsterDeck: cards(["EBP02-024", "EBP02-025", "EBP02-026", "EBP02-028"]),
      mainDeck: [
        ...cards(Array(4).fill("EBP04-012")),
        ...official("esd02-starter.txt").mainDeck.slice(0, 46),
      ],
    };
    const decks: [PlayerSetup, PlayerSetup] = [
      biollante,
      { id: "P2", ...official("esd01-starter.txt") },
    ];
    const lists = decklistsOf(decks);
    for (let game = 0; game < 40; game++) {
      const rng = seededRng(`q22-${game}`);
      let state = advanceToDecision(startGame({ seed: `q22-${game}`, decks }));
      let played = false;
      for (let n = 0; state.result === null && n < 3000; n++) {
        const who = decider(state);
        const legal = botInput(state, who, lists, rng).legalActions;
        const under = legal.find(
          (a) => a.type === "playMonster" && a.underInstanceId !== undefined,
        );
        const action =
          under ?? weightedBot.chooseAction(botInput(state, who, lists, rng));
        state = advanceToDecision(applyAction(state, action));
        if (under) played = true;
        if (played && decider(state) === "P2") {
          const view = getPlayerView(state, "P2");
          const det = determinize(
            view,
            { decks: lists, log: view.log },
            seededRng(game),
          );
          // Tokens aren't deck cards (9.1.4.2, decision 338): EBP04-012's Tentacles are left out.
          const deckCards = allCards(det, "P1").filter(
            (id) => !det.cards[id]?.traits.includes("Token"),
          );
          expect(deckCards).toEqual(
            [...biollante.monsterDeck, ...biollante.mainDeck]
              .map((c) => c.id)
              .sort((a, b) => a - b),
          );
          expect(checkInvariants(det)).toEqual([]);
          return;
        }
      }
    }
    throw new Error("no game reached EBP04-012's play from rank II");
  });
});

import { readFileSync } from "node:fs";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { buildTestDeck, getAllCards } from "@gojisim/cards/test-decks";
import {
  advanceToDecision,
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  getPlayerView,
  type PlayerId,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { randomBot, weightedBot } from "./baseline";
import { determinize } from "./determinize";
import { ismctsBot } from "./ismcts";
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

describe("determinize: a monster played from the monster deck by an effect (M13a)", () => {
  it("after EBP03-074 plays the next monster, the opponent's view determinizes with every card accounted for", () => {
    const cards = (numbers: string[]) =>
      numbers.map((n) => {
        const found = getAllCards().find(
          (c) => c.cardNumber === n && !c.isParallel,
        );
        if (!found) throw new Error(n);
        return found;
      });
    // Blue Godzilla (2002) / (2003), ranks I to IV, sharing the Godzilla trait.
    const godzilla: PlayerSetup = {
      id: "P1",
      monsterDeck: cards(["EBP03-014", "EBP03-012", "EBP03-016", "EBP03-013"]),
      mainDeck: [
        ...cards(Array(4).fill("EBP03-074")),
        ...official("esd02-starter.txt").mainDeck.slice(0, 46),
      ],
    };
    const decks: [PlayerSetup, PlayerSetup] = [
      godzilla,
      { id: "P2", ...official("esd01-starter.txt") },
    ];
    const lists = decklistsOf(decks);
    for (let game = 0; game < 60; game++) {
      const rng = seededRng(`journey-${game}`);
      let state = advanceToDecision(
        startGame({ seed: `journey-${game}`, decks }),
      );
      for (let n = 0; state.result === null && n < 3000; n++) {
        const who = decider(state);
        const input = botInput(state, who, lists, rng);
        // P1 activates EBP03-074 whenever it can.
        const journey = input.legalActions.find(
          (a) =>
            a.type === "activateStrategy" &&
            state.cards[
              state.players[0].hand.find(
                (c) => c.instanceId === a.cardInstanceId,
              )?.cardId ?? -1
            ]?.cardNumber === "EBP03-074",
        );
        state = advanceToDecision(
          applyAction(state, journey ?? weightedBot.chooseAction(input)),
        );
        const played = state.log.some(
          (e) => e.type === "place" && e.payload["from"] === "monsterDeck",
        );
        if (played && decider(state) === "P2") {
          const view = getPlayerView(state, "P2");
          const det = determinize(
            view,
            { decks: lists, log: view.log },
            seededRng(game),
          );
          expect(allCards(det, "P1")).toEqual(
            [...godzilla.monsterDeck, ...godzilla.mainDeck]
              .map((c) => c.id)
              .sort((a, b) => a - b),
          );
          expect(checkInvariants(det)).toEqual([]);
          return;
        }
      }
    }
    throw new Error("no game reached EBP03-074's play from the monster deck");
  });
});

describe("determinize: a start phase replacement's yes / no (E21, M13a)", () => {
  it("at EBP04-010's 7.2.4 question, the determinized state can be answered and searched", () => {
    const cards = (numbers: string[]) =>
      numbers.map((n) => {
        const found = getAllCards().find(
          (c) => c.cardNumber === n && !c.isParallel,
        );
        if (!found) throw new Error(n);
        return found;
      });
    // EBP04-010 (rank II): with 2 or more rage at the start phase, it may discard 2 to keep it.
    const keeper: PlayerSetup = {
      id: "P1",
      monsterDeck: cards(["ESD01-001", "EBP04-010", "ESD01-003", "ESD01-004"]),
      mainDeck: official("esd01-starter.txt").mainDeck,
    };
    const decks: [PlayerSetup, PlayerSetup] = [
      keeper,
      { id: "P2", ...official("esd02-starter.txt") },
    ];
    const lists = decklistsOf(decks);
    for (let game = 0; game < 80; game++) {
      const rng = seededRng(`keep-${game}`);
      let state = advanceToDecision(startGame({ seed: `keep-${game}`, decks }));
      for (let n = 0; state.result === null && n < 3000; n++) {
        const choice = state.pendingChoice;
        if (
          choice?.player === "P1" &&
          choice.rule === "10.9" &&
          state.step === "7.2.4"
        ) {
          const view = getPlayerView(state, "P1");
          const det = determinize(
            view,
            { decks: lists, log: view.log },
            seededRng(game),
          );
          expect(det.replacementAsks).toEqual(state.replacementAsks);
          // Both answers resume the step in the simulation, and a search runs through it.
          for (const optionId of ["yes", "no"])
            advanceToDecision(
              applyAction(det, {
                type: "choose",
                player: "P1",
                choiceId: choice.id,
                optionId,
              }),
            );
          const input = botInput(state, "P1", lists, seededRng(game), {
            iterations: 40,
            maxMs: 1e9,
          });
          expect(() => ismctsBot.chooseAction(input)).not.toThrow();
          return;
        }
        const who = decider(state);
        state = advanceToDecision(
          applyAction(
            state,
            weightedBot.chooseAction(botInput(state, who, lists, rng)),
          ),
        );
      }
    }
    throw new Error("no game reached EBP04-010's 7.2.4 question");
  });
});

describe("determinize: an earlier pick of a multi-card search (5.8.1, M13a)", () => {
  it("EBP01-019's search for up to 2 [kamacuras], after the first pick: the picked card stays in the deck", () => {
    const real = (n: string) =>
      getAllCards().find((c) => c.cardNumber === n && !c.isParallel)!;
    const decks: [PlayerSetup, PlayerSetup] = [
      { id: "P1", ...official("esd01-starter.txt") },
      { id: "P2", ...official("esd02-starter.txt") },
    ];
    decks[0].mainDeck = [
      ...Array(4).fill(real("EBP01-019")),
      ...Array(4).fill(real("EBP04-038")),
      ...decks[0].mainDeck.slice(8),
    ];
    const lists = decklistsOf(decks);
    let state = advanceToDecision(startGame({ seed: "kamacuras", decks }));
    while (state.pendingChoice || state.turnPlayer !== "P1")
      state = advanceToDecision(
        applyAction(
          state,
          weightedBot.chooseAction(
            botInput(state, decider(state), lists, seededRng(1)),
          ),
        ),
      );
    const p1 = state.players[0];
    const p2 = state.players[1];
    p1.monsterPosition = 6;
    p2.monsterPosition = 8;
    // EBP01-019 in hand, and at least 2 [kamacuras] cards left in the deck to find.
    const inDeck = p1.deck.filter((c) => [150, 757].includes(c.cardId));
    const card = inDeck[0]!;
    p1.deck = p1.deck.filter((c) => c !== card);
    p1.hand.push(card);
    const play = getLegalActions(state, "P1").find(
      (a) =>
        a.type === "playBattle" &&
        a.cardInstanceId === card.instanceId &&
        a.zone !== 6,
    )!;
    expect(card.cardId).toBe(150);
    state = advanceToDecision(applyAction(state, play));
    const first = state.pendingChoice!;
    expect(first.rule).toBe("5.8.1");
    const picked = first.options.find((o) => o.id !== "done")!;
    state = advanceToDecision(
      applyAction(state, {
        type: "choose",
        player: "P1",
        choiceId: first.id,
        optionId: picked.id,
      }),
    );
    expect(state.resolution?.chosen).toEqual([picked.id]);
    const view = getPlayerView(state, "P1");
    const det = determinize(
      view,
      { decks: lists, log: view.log },
      seededRng(2),
    );
    expect(checkInvariants(det)).toEqual([]);
    expect(det.players[0].deck.some((c) => c.instanceId === picked.id)).toBe(
      true,
    );
    expect(allCards(det, "P1")).toEqual(
      [...decks[0].monsterDeck, ...decks[0].mainDeck]
        .map((c) => c.id)
        .sort((a, b) => a - b),
    );
    const input = botInput(state, "P1", lists, seededRng(3), {
      iterations: 40,
      maxMs: 1e9,
    });
    expect(() => ismctsBot.chooseAction(input)).not.toThrow();
  });
});

describe("determinize: a bound card that has moved since (4.1.4, M13a)", () => {
  it("EBP03-052: Land Moguera found and placed under it, then the search for Star Falcon: counted once", () => {
    const real = (n: string) =>
      getAllCards().find((c) => c.cardNumber === n && !c.isParallel)!;
    const decks: [PlayerSetup, PlayerSetup] = [
      { id: "P1", ...official("esd02-starter.txt") },
      { id: "P2", ...official("esd01-starter.txt") },
    ];
    decks[0].mainDeck = [
      real("EBP03-052"),
      real("EBP03-046"),
      ...Array(2).fill(real("EBP03-043")),
      ...decks[0].mainDeck.slice(4),
    ];
    const lists = decklistsOf(decks);
    let state = advanceToDecision(startGame({ seed: "moguera", decks }));
    while (state.pendingChoice || state.turnPlayer !== "P1")
      state = advanceToDecision(
        applyAction(
          state,
          weightedBot.chooseAction(
            botInput(state, decider(state), lists, seededRng(1)),
          ),
        ),
      );
    const [p1, p2] = state.players;
    p1.monsterPosition = 6;
    p2.monsterPosition = 8;
    const ids = (number: string) => real(number).id;
    // M.O.G.U.E.R.A. in hand; Land Moguera and the Star Falcons in the deck.
    for (const n of ["EBP03-052", "EBP03-046", "EBP03-043"]) {
      const where = [p1.hand, p1.deck, p1.discard].find((l) =>
        l.some((c) => c.cardId === ids(n)),
      );
      expect(where).toBeDefined();
    }
    const card = [...p1.hand, ...p1.deck].find(
      (c) => c.cardId === ids("EBP03-052"),
    )!;
    p1.deck = p1.deck.filter((c) => c !== card);
    p1.hand = [...p1.hand.filter((c) => c !== card), card];
    const play = getLegalActions(state, "P1").find(
      (a) =>
        a.type === "playBattle" &&
        a.cardInstanceId === card.instanceId &&
        a.zone !== 6,
    )!;
    state = advanceToDecision(applyAction(state, play));
    const first = state.pendingChoice!;
    const moguera = first.options.find((o) => o.cardId === ids("EBP03-046"))!;
    state = advanceToDecision(
      applyAction(state, {
        type: "choose",
        player: "P1",
        choiceId: first.id,
        optionId: moguera.id,
      }),
    );
    // Now the Star Falcon search: Land Moguera is under M.O.G.U.E.R.A. with a new instance id.
    expect(
      state.pendingChoice?.options.some((o) => o.cardId === ids("EBP03-043")),
    ).toBe(true);
    const view = getPlayerView(state, "P1");
    const det = determinize(
      view,
      { decks: lists, log: view.log },
      seededRng(2),
    );
    expect(checkInvariants(det)).toEqual([]);
    expect(allCards(det, "P1")).toEqual(
      [...decks[0].monsterDeck, ...decks[0].mainDeck]
        .map((c) => c.id)
        .sort((a, b) => a - b),
    );
  });
});

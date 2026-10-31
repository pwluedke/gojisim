import { readFileSync } from "node:fs";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  advanceToDecision,
  type GameState,
  getLegalActions,
  type PlayerSetup,
  startGame,
} from "@gojisim/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoardView } from "./BoardView";
import {
  boardModel,
  bottomPlayer,
  mechaCheckNeeded,
  mechaCheckText,
} from "./model";
import { Preview } from "./Preview";

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(
    `../../../../packages/cards/data/decks/${file}`,
    import.meta.url,
  );
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}

function game(): GameState {
  return advanceToDecision(
    startGame({
      seed: "m5a",
      decks: [
        { id: "P1", ...official("esd01-starter.txt") },
        { id: "P2", ...official("esd02-starter.txt") },
      ],
    }),
  );
}

describe("/play board model (M5a)", () => {
  it("never contains the opponent's hand card ids: not in the model, not in the rendered board", () => {
    const state = game();
    for (const bottom of ["P1", "P2"] as const) {
      const opponent = state.players.find((p) => p.id !== bottom);
      const own = state.players.find((p) => p.id === bottom);
      const model = boardModel(state, bottom);
      const html = renderToStaticMarkup(
        <BoardView model={model} prompt={null} />,
      );
      const json = JSON.stringify(model);
      for (const card of opponent?.hand ?? []) {
        expect(json).not.toContain(`"${card.instanceId}"`);
        expect(html).not.toContain(`"${card.instanceId}"`);
      }
      // Its own hand is there (so the check above is meaningful).
      for (const card of own?.hand ?? [])
        expect(html).toContain(`data-instance-id="${card.instanceId}"`);
      // The opponent's deck and monster deck never appear either.
      for (const card of [
        ...(opponent?.deck ?? []),
        ...(opponent?.monsterDeck ?? []),
      ])
        expect(json).not.toContain(`"${card.instanceId}"`);
    }
  });

  it("bottom player: the human against a bot, P1 with two bots", () => {
    const state = game();
    expect(
      bottomPlayer(state, {
        P1: { kind: "bot", difficulty: 55 },
        P2: { kind: "human" },
      }),
    ).toBe("P2");
    expect(
      bottomPlayer(state, {
        P1: { kind: "bot", difficulty: 1 },
        P2: { kind: "bot", difficulty: 1 },
      }),
    ).toBe("P1");
  });

  it("battle cards show printed counter power plus a colored modifier (PR #24 pattern)", () => {
    const state = game();
    const p1 = state.players[0];
    const city = getAllCards().find(
      (c) => c.cardNumber === "ESD01-010" && c.parentId === null,
    );
    if (!city) throw new Error("City of Tokyo");
    state.cards = { ...state.cards, [city.id]: city };
    p1.monsterPosition = 7;
    p1.zones[1] = [[{ instanceId: "c990001", cardId: city.id, owner: "P1" }]];
    p1.zones[8] = [[{ instanceId: "c990002", cardId: city.id, owner: "P1" }]];
    const html = renderToStaticMarkup(
      <BoardView model={boardModel(state, "P1")} prompt={null} />,
    )
      .replace(/<!-- -->/g, "")
      .replace(/<[^>]+>/g, "|");
    // The zone 8 City of Tokyo: printed 0, then +5000 from the one in zone 1 (Awakening 6).
    expect(html).toContain("|0| +5000|");
  });

  it("decision 373: Monster X's printed X shows as X, with its current value as X = 12000, never -1 or +1", () => {
    const state = game();
    const p1 = state.players[0];
    const base = (number: string) => {
      const card = getAllCards().find(
        (c) => c.cardNumber === number && c.parentId === null,
      );
      if (!card) throw new Error(number);
      return card;
    };
    // EBP03-067: X = 3000 × the colors among your other battle cards. One battle card of each
    // color makes 4 colors in play: X = 12000. EBP04-031 (a Monster X monster card) waits in the
    // discard pile, where it has no current value.
    const monsterX = base("EBP03-067");
    const colors = ["EBP01-016", "EBP01-053", "EBP02-063", "EBP01-070"].map(
      base,
    );
    const monsterCard = base("EBP04-031");
    state.cards = {
      ...state.cards,
      ...Object.fromEntries(
        [monsterX, ...colors, monsterCard].map((c) => [c.id, c]),
      ),
    };
    expect(colors.flatMap((c) => c.colors)).toEqual([
      "Red",
      "Blue",
      "Green",
      "White",
    ]);
    p1.monsterPosition = 7;
    p1.zones[8] = [
      [{ instanceId: "c990010", cardId: monsterX.id, owner: "P1" }],
    ];
    colors.forEach((card, i) => {
      p1.zones[([1, 2, 3, 5] as const)[i] as 1 | 2 | 3 | 5] = [
        [{ instanceId: `c99001${i + 1}`, cardId: card.id, owner: "P1" }],
      ];
    });
    p1.discard = [
      ...p1.discard,
      { instanceId: "c990019", cardId: monsterCard.id, owner: "P1" },
    ];
    const model = boardModel(state, "P1");
    expect(model.counterPower["c990010"]).toBe(12000);
    const text = (html: string) =>
      html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "|");
    const board = text(
      renderToStaticMarkup(<BoardView model={model} prompt={null} />),
    );
    expect(board).toContain("|X = 12000|");
    const preview = text(
      renderToStaticMarkup(<Preview model={model} instanceId="c990010" />),
    );
    expect(preview).toContain("Counter power |X = 12000|");
    const discarded = text(
      renderToStaticMarkup(<Preview model={model} instanceId="c990019" />),
    );
    expect(discarded).toContain("Threat |X|");
    for (const html of [board, preview, discarded]) {
      expect(html).not.toMatch(/\|-1\||\+1\b|\+12001/);
    }
  });

  it("12.5 a Burst monster shows its rank change and the end-phase discard reminder as a change chip", () => {
    const state = game();
    const p1 = state.players[0];
    const monster = p1.invadingMonsterZone[p1.invadingMonsterZone.length - 1];
    if (!monster) throw new Error("no monster");
    const under = { ...monster, instanceId: "c990003" };
    p1.invadingMonsterZone = [under, monster];
    const plain = renderToStaticMarkup(
      <BoardView model={boardModel(state, "P1")} prompt={null} />,
    );
    expect(plain).not.toContain('data-testid="change-badge"');
    state.timedTriggers = [
      {
        kind: "burstDiscard",
        sourceInstanceId: monster.instanceId,
        sourceCardId: monster.cardId,
        master: "P1",
      },
    ];
    const html = renderToStaticMarkup(
      <BoardView model={boardModel(state, "P1")} prompt={null} />,
    );
    expect(html).toContain('data-kind="burst"');
    expect(html).toMatch(/Burst R1→R1 · discard at end phase/);
  });

  it("10.8.1 and 5.16.1: the change badge shows counter power and cannot-engage chips, and lists each in full", () => {
    const state = game();
    const p1 = state.players[0];
    const city = getAllCards().find(
      (c) => c.cardNumber === "ESD01-010" && c.parentId === null,
    );
    if (!city) throw new Error("City of Tokyo");
    state.cards = { ...state.cards, [city.id]: city };
    p1.monsterPosition = 7;
    p1.zones[1] = [[{ instanceId: "c990001", cardId: city.id, owner: "P1" }]];
    p1.zones[8] = [
      [
        {
          instanceId: "c990002",
          cardId: city.id,
          owner: "P1",
          statuses: ["cannotEngage"],
        },
      ],
    ];
    const model = boardModel(state, "P1");
    expect(model.changes["c990002"]?.map((c) => c.label)).toEqual([
      "CP +5000",
      "Can't engage",
    ]);
    expect(model.changes["c990001"]).toBeUndefined();
    const html = renderToStaticMarkup(
      <BoardView model={model} prompt={null} />,
    );
    expect(html).toContain('data-kind="counterPower"');
    expect(html).toContain('data-kind="cannotEngage"');
    expect(html).toContain("Cannot engage: adds no counter power (5.16.1)");
  });

  it("10.8.1: any change in the model shows as a chip (a rank modifier on a test fixture)", () => {
    const state = game();
    const p1 = state.players[0];
    const monster = p1.invadingMonsterZone[p1.invadingMonsterZone.length - 1];
    if (!monster) throw new Error("no monster");
    const model = boardModel(state, "P1");
    model.changes[monster.instanceId] = [
      {
        kind: "rank",
        label: "Rank +1",
        detail: "Rank +1 from continuous effects (10.8.1)",
      },
    ];
    const html = renderToStaticMarkup(
      <BoardView model={model} prompt={null} />,
    );
    expect(html).toContain('data-kind="rank"');
    expect(html).toContain(">Rank +1<");
  });
});

describe("strategy zones on the mat (M12c-2)", () => {
  const real = (number: string) =>
    getAllCards().find((c) => c.cardNumber === number && c.parentId === null)!;

  it("M5h #13: with Show opponent's hand, the board model has the top player's hand face up; without it, none", () => {
    const state = game();
    const p2 = state.players.find((p) => p.id === "P2")!;
    const hidden = boardModel(state, "P1");
    expect(
      hidden.view.players.find((p) => p.id === "P2")?.hand.cards,
    ).toBeNull();
    const open = boardModel(state, "P1", true);
    const hand = open.view.players.find((p) => p.id === "P2")?.hand.cards;
    expect(hand?.map((c) => c.instanceId)).toEqual(
      p2.hand.map((c) => c.instanceId),
    );
    for (const card of p2.hand)
      expect(open.view.cards[card.cardId]).toBeDefined();
  });

  it('M5h #6: the hand label reads "Your Hand (N)", with no seat id', () => {
    const state = game();
    const count = state.players.find((p) => p.id === "P1")?.hand.length;
    const html = renderToStaticMarkup(
      <BoardView model={boardModel(state, "P1")} prompt={null} />,
    )
      // The text without tags, so the count's span doesn't split it.
      .replace(/<[^>]+>/g, "");
    expect(html).toContain(`Your Hand (${count})`);
    expect(html).not.toContain("P1,");
  });

  it("E20: a third strategy zone appears only once the player has one", () => {
    const state = game();
    const html = (s: GameState) =>
      renderToStaticMarkup(
        <BoardView model={boardModel(s, "P1")} prompt={null} />,
      );
    expect(html(state)).not.toContain('data-testid="strategy-P1-3"');
    const p1 = state.players.find((p) => p.id === "P1")!;
    p1.strategyZones.push([]);
    expect(html(state)).toContain('data-testid="strategy-P1-3"');
    expect(html(state)).not.toContain('data-testid="strategy-P2-3"');
  });

  it('K1: a Base card\'s strategy mark reads "Base", since it stays at the start phase (12.9.2)', () => {
    const state = game();
    const base = real("EBP03-070");
    state.cards = { ...state.cards, [base.id]: base };
    const p1 = state.players.find((p) => p.id === "P1")!;
    p1.strategyZones[0].push({
      card: { instanceId: "c900", cardId: base.id, owner: "P1" },
      placedOnTurn: state.turn - 1,
    });
    const html = renderToStaticMarkup(
      <BoardView model={boardModel(state, "P1")} prompt={null} />,
    );
    expect(html).toMatch(/data-testid="strategy-mark"[^>]*>Base</);
  });
});

describe("Mecha-Check (#138)", () => {
  const card = (number: string) => {
    const found = getAllCards().find((c) => c.deckCardNumber === number);
    if (!found) throw new Error(number);
    return found;
  };
  /**
   * ESD01 for P1 with Mecha-King Ghidorah and King Ghidorah cards added, at P1's first main phase
   * play timing (the first seed where P1 goes first).
   */
  function mechaGame(): GameState {
    const base = official("esd01-starter.txt");
    const extra = [
      card("EBP02-068"),
      ...Array.from({ length: 12 }, () => card("EBP02-066")),
      card("EBP02-068"),
    ];
    for (let n = 0; n < 50; n++) {
      const state = advanceToDecision(
        startGame({
          seed: `mecha-check-${n}`,
          decks: [
            {
              id: "P1",
              monsterDeck: base.monsterDeck,
              mainDeck: [...base.mainDeck, ...extra],
            },
            { id: "P2", ...official("esd02-starter.txt") },
          ],
        }),
      );
      if (state.turnPlayer === "P1" && !state.pendingChoice)
        return structuredClone(state);
    }
    throw new Error("no seed where P1 goes first");
  }
  /** Moves P1's first deck or hand card with `number` to `to`. */
  function move(state: GameState, number: string, to: "hand" | "discard") {
    const me = state.players.find((p) => p.id === "P1");
    if (!me) throw new Error("P1");
    for (const from of [me.deck, me.hand]) {
      const i = from.findIndex(
        (c) => state.cards[c.cardId]?.deckCardNumber === number,
      );
      if (i < 0 || (from === me.hand && to === "hand")) continue;
      const [moved] = from.splice(i, 1);
      if (moved) me[to].push(moved);
      return moved?.instanceId ?? "";
    }
    throw new Error(`no ${number}`);
  }
  const setOpponentAt = (state: GameState, zone: number) => {
    const opp = state.players.find((p) => p.id === "P2");
    if (opp) opp.monsterPosition = zone as typeof opp.monsterPosition;
  };

  it("8.2.1: N = ceil((rank − the opponent's monster's zone) / 2) from the engine's check, by position and discard count", () => {
    const state = mechaGame();
    const me = state.players.find((p) => p.id === "P1");
    for (const c of [...(me?.discard ?? [])]) {
      if (state.cards[c.cardId]?.traits.includes("King Ghidorah"))
        throw new Error("setup");
    }
    const id = move(state, "EBP02-068", "hand");
    setOpponentAt(state, 3);
    // Rank 23 at zone 3: 20 over, 10 cards.
    expect(mechaCheckNeeded(state, "P1", id)).toBe(10);
    for (let i = 0; i < 7; i++) move(state, "EBP02-066", "discard");
    expect(mechaCheckNeeded(state, "P1", id)).toBe(3);
    // Zone 4: 23 − 14 = 9 over zone 4 = 5 → 3 cards (ceil 2.5).
    setOpponentAt(state, 4);
    expect(mechaCheckNeeded(state, "P1", id)).toBe(3);
    setOpponentAt(state, 8);
    expect(mechaCheckNeeded(state, "P1", id)).toBe(1);
    expect(boardModel(state, "P1").mechaCheck).toEqual({ [id]: 1 });
  });

  it("0 exactly when the hand play is legal; the board model lists only Mecha-King Ghidorah, only in your hand", () => {
    const state = mechaGame();
    const id = move(state, "EBP02-068", "hand");
    setOpponentAt(state, 5);
    for (let i = 0; i < 8; i++) move(state, "EBP02-066", "discard");
    // 23 − 16 = 7: still 2 over zone 5.
    expect(mechaCheckNeeded(state, "P1", id)).toBe(1);
    move(state, "EBP02-066", "discard");
    expect(mechaCheckNeeded(state, "P1", id)).toBe(0);
    const legal = (s: GameState) =>
      getLegalActions(s, "P1").some(
        (a) => a.type === "playBattle" && a.cardInstanceId === id,
      );
    expect(legal(state)).toBe(true);
    const others =
      state.players
        .find((p) => p.id === "P1")
        ?.hand.filter((c) => c.instanceId !== id) ?? [];
    for (const c of others)
      expect(mechaCheckNeeded(state, "P1", c.instanceId)).toBeNull();
    expect(Object.keys(boardModel(state, "P1").mechaCheck)).toEqual([id]);
    expect(boardModel(state, "P2").mechaCheck).toEqual({});
  });

  it("the wording: plural, singular, and ready to play", () => {
    expect(mechaCheckText(3)).toBe(
      "Mecha-Check: 3 more King Ghidorah cards needed in your discard pile to play this.",
    );
    expect(mechaCheckText(1)).toBe(
      "Mecha-Check: 1 more King Ghidorah card needed in your discard pile to play this.",
    );
    expect(mechaCheckText(0)).toBe("Mecha-Check: ready to play.");
  });
});

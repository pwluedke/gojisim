import { readFileSync } from "node:fs";
import type { Card } from "@gojisim/cards";
import { parseDeckList } from "@gojisim/cards/deck-lists";
import { getAllCards } from "@gojisim/cards/test-decks";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type PlayerSetup,
  type PlayerState,
  startGame,
} from "@gojisim/engine";
import { describe, expect, it } from "vitest";
import { botInput, decklistsOf, seededRng } from "./input";
import { decide, ismctsSettings } from "./ismcts";

// Paul's full-turn position for the Constructed Future plan (Nov 5, 2026): Flying Form IV, 3
// Crystals; Constructed Future, 2 monster cards and GoD in hand; King Ghidorah (2024) in the
// discard pile. The plan: Constructed Future (the 3 Crystals go, KG (2024) comes back), then 2
// rage discards (8.4; Flying Form IV makes 2 Crystals each: 4), then the counter with GoD (7.4.3).

function official(file: string): Omit<PlayerSetup, "id"> {
  const url = new URL(`../../cards/data/decks/${file}`, import.meta.url);
  const deck = parseDeckList(readFileSync(url, "utf8")).decks[0];
  if (!deck) throw new Error(file);
  return { monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
}
const real = (number: string): Card =>
  getAllCards().find(
    (c) => c.cardNumber === number && c.parentId === null,
  ) as Card;

/** ESD01 with Flying Form IV as its rank IV monster and the plan's cards in the main deck. */
function decks(): [PlayerSetup, PlayerSetup] {
  const esd01 = official("esd01-starter.txt");
  const monsters = esd01.monsterDeck.map((c) =>
    c.rank === 4 ? real("EBP02-057") : c,
  );
  const main = [...esd01.mainDeck];
  for (const n of [
    "SD05-005",
    "EBP02-072",
    "EBP02-045",
    "EBP02-046",
    "EBP01-074",
  ]) {
    // ESD01 has 4 of ESD01-012; the fifth swap takes a Reinforcements (ESD01-009).
    let i = main.findIndex((c) => c.deckCardNumber === "ESD01-012");
    if (i < 0) i = main.findIndex((c) => c.deckCardNumber === "ESD01-009");
    main[i] = real(n);
  }
  return [
    { id: "P1", monsterDeck: monsters, mainDeck: main },
    { id: "P2", ...official("esd02-starter.txt") },
  ];
}

function position() {
  const setups = decks();
  let state = advanceToDecision(
    startGame({ seed: "cf-plan-turn", decks: setups }),
  );
  while (state.turnPlayer !== "P1" || state.pendingChoice) {
    const decider = state.pendingChoice?.player ?? state.turnPlayer;
    const choice = state.pendingChoice;
    state = advanceToDecision(
      applyAction(
        state,
        choice
          ? {
              type: "choose",
              player: decider,
              choiceId: choice.id,
              optionId: choice.options[0]!.id,
            }
          : { type: "pass", player: decider },
      ),
    );
  }
  const p1 = state.players[0] as PlayerState;
  const p2 = state.players[1] as PlayerState;
  p1.deck.push(...p1.hand, ...p1.discard);
  p1.hand = [];
  p1.discard = [];
  for (const z of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    for (const stack of p1.zones[z]) p1.deck.push(...stack);
    p1.zones[z] = [];
  }
  const left = (player: string, cardId: number) => {
    const last = state.log.at(-1)!;
    state.log.push({
      ...last,
      type: "newInvadingMonster",
      player,
      payload: { rule: "5.10", cardId },
    });
  };
  const take = (n: string) => {
    const i = p1.deck.findIndex(
      (c) => state.cards[c.cardId]?.deckCardNumber === n,
    );
    if (i < 0) throw new Error(`no ${n}`);
    return p1.deck.splice(i, 1)[0]!;
  };
  p1.hand = [
    take("SD05-005"),
    take("EBP02-072"),
    take("EBP02-045"),
    take("EBP02-046"),
  ];
  p1.discard = [take("EBP01-074")];
  // Flying Form IV as the invading monster, from the monster deck.
  const ff = p1.monsterDeck.findIndex(
    (c) => state.cards[c.cardId]?.deckCardNumber === "EBP02-057",
  );
  if (ff >= 0) {
    // Played on top of the monster before it, as a monster play stacks (5.10).
    const card = p1.monsterDeck.splice(ff, 1)[0]!;
    p1.invadingMonsterZone = [...p1.invadingMonsterZone, card];
    // The public log says it left the monster deck, as a monster play would (the bot reads it).
    left("P1", card.cardId);
  }
  // 3 Crystals tokens (tokens aren't in a decklist).
  const crystals = getAllCards().find(
    (c) => c.cardNumber === "EBP02-T03" && c.parentId === null,
  )!;
  state.cards = { ...state.cards, [crystals.id]: crystals };
  for (const z of [1, 2, 3] as const)
    p1.zones[z] = [
      [{ instanceId: `cry-${z}`, cardId: crystals.id, owner: "P1" }],
    ];
  p1.monsterPosition = 6;
  p1.rage = 0;
  // P2's Godzilla (1992), threat 18,000: KG (2024)'s 8,000 needs GoD's +20,000.
  const g = p2.monsterDeck.findIndex(
    (c) => state.cards[c.cardId]?.deckCardNumber === "ESD02-003",
  );
  if (g >= 0) {
    const card = p2.monsterDeck.splice(g, 1)[0]!;
    p2.invadingMonsterZone = [...p2.invadingMonsterZone, card];
    left("P2", card.cardId);
  }
  p2.monsterPosition = 3;
  p2.rage = 0;
  state.turnFlags.invasionUsed = true;
  return { state, setups };
}

describe("Paul's Constructed Future plan: the full turn", () => {
  it("cfPlan defaults to 1 and cfPlan=0 turns it off", () => {
    expect(ismctsSettings({}).cfPlan).toBe(1);
    expect(ismctsSettings({ cfPlan: "0" }).cfPlan).toBe(0);
  });

  it("Constructed Future before the rage discards, then 2 rage discards (4 Crystals), GoD, and the counter (7.4.3)", () => {
    const { setups } = position();
    const lists = decklistsOf(setups);
    for (let seed = 0; seed < 3; seed++) {
      let state = position().state;
      const turn = state.turn;
      const seq: string[] = [];
      for (
        let step = 0;
        step < 40 && state.turn === turn && state.result === null;
        step++
      ) {
        const decider = state.pendingChoice?.player ?? state.turnPlayer;
        let action: Action;
        if (decider === "P1")
          action = decide(
            botInput(state, "P1", lists, seededRng(`cf-plan-${seed}-${step}`), {
              iterations: 200,
              maxMs: 1e9,
              prune: 1,
              rules: 1,
            }),
          ).action;
        else {
          const c = state.pendingChoice!;
          action = {
            type: "choose",
            player: c.player,
            choiceId: c.id,
            optionId: c.options[0]!.id,
          };
        }
        if (action.type === "activateStrategy" || action.type === "gainRage") {
          const card = (state.players[0] as PlayerState).hand.find(
            (c) => c.instanceId === action.cardInstanceId,
          );
          seq.push(
            `${action.type}:${state.cards[card?.cardId ?? -1]?.deckCardNumber}`,
          );
        }
        state = advanceToDecision(applyAction(state, action));
      }
      const check = state.log
        .filter((e) => e.type === "counterCheck" && e.player === "P1")
        .at(-1);
      // Constructed Future before any rage discard (GoD may go down before or after it).
      const cf = seq.indexOf("activateStrategy:SD05-005");
      const firstRage = seq.findIndex((x) => x.startsWith("gainRage"));
      expect(cf, `seed ${seed}: ${seq.join(", ")}`).toBeGreaterThanOrEqual(0);
      expect(firstRage, `seed ${seed}: ${seq.join(", ")}`).toBeGreaterThan(cf);
      expect(
        seq.filter((s) => s.startsWith("gainRage")).length,
        `seed ${seed}: ${seq.join(", ")}`,
      ).toBe(2);
      expect(seq, `seed ${seed}`).toContain("activateStrategy:EBP02-072");
      expect(
        check?.payload["countered"],
        `seed ${seed}: ${JSON.stringify(check?.payload)}`,
      ).toBe(true);
    }
  }, 300000);
});

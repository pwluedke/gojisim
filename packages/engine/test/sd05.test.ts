import { describe, expect, it } from "vitest";
import type { GameState, PlayerState } from "../src";
import { inDiscard, inHand, place, real, zoneCardIds } from "./fixtures/real";
import { battleCard } from "./fixtures/state";
import {
  activate,
  choose,
  newLogTypes,
  opponentOf,
  self,
  settle,
  setup,
} from "./fixtures/play";

// SD05-005 Constructed Future (Japanese SD05, Nov 6, 2026; the community's name; Paul's translation and rulings, Nov 4).

const CRYSTALS = "EBP02-T03";
const MECHA_KING = "EBP02-068"; // Mecha-King Ghidorah, battle card, rank 23
const MINILLA = "EBP01-024"; // Minilla (2004), rank 6: [enter] the opponent loses 1 rage

const constructed = (state: GameState, me: PlayerState) =>
  activate(state, me, inHand(state, me, real("SD05-005")));
const discardIds = (state: GameState, me: PlayerState) =>
  self(state, me).discard.map((c) => c.cardId);

describe("SD05-005 Constructed Future", () => {
  it("SD05-005 5.12, 9.1.4.2, 5.11.1: 3 Crystals (rank 1) are destroyed and banished, then Mecha-King Ghidorah (rank 23) is played from the discard pile", () => {
    const { state, me } = setup();
    for (const zone of [1, 2, 3] as const)
      place(state, me, real(CRYSTALS), zone);
    const kept = place(state, me, battleCard({ rank: 7 }), 4);
    const king = inDiscard(state, me, real(MECHA_KING));
    inDiscard(state, me, battleCard({ rank: 9 }));
    const after = settle(constructed(state, me));
    expect(
      newLogTypes(after, state).filter((t) => t === "tokenGone"),
    ).toHaveLength(3);
    const zones = zoneCardIds(self(after, me));
    expect(Object.values(zones).flat()).toEqual(
      expect.arrayContaining([kept.cardId, king.cardId]),
    );
    expect(Object.values(zones).flat()).not.toContain(real(CRYSTALS).id);
    expect(discardIds(after, me)).not.toContain(king.cardId);
    // Tokens leave the game: none reaches the discard pile (9.1.4.2).
    expect(discardIds(after, me)).not.toContain(real(CRYSTALS).id);
  });

  it("SD05-005 5.12: with fewer than 3 battle cards, those are destroyed and nothing is played", () => {
    const { state, me } = setup();
    const a = place(state, me, battleCard({ rank: 2 }), 1);
    const b = place(state, me, battleCard({ rank: 5 }), 2);
    const king = inDiscard(state, me, real(MECHA_KING));
    const after = settle(constructed(state, me));
    expect(zoneCardIds(self(after, me))).toEqual({});
    expect(discardIds(after, me)).toEqual(
      expect.arrayContaining([a.cardId, b.cardId, king.cardId]),
    );
  });

  it("SD05-005 10.5.3: a tie at the lowest rank is the player's pick; higher ranks wait their turn", () => {
    const { state, me } = setup();
    const low = place(state, me, battleCard({ rank: 1 }), 1);
    const tied = ([2, 3, 4] as const).map((zone) =>
      place(state, me, battleCard({ rank: 2 }), zone),
    );
    const high = place(state, me, battleCard({ rank: 5 }), 5);
    let current = constructed(state, me);
    const offered = new Set<string>();
    // Pick the rank 2 cards in zones 3 and 4, leaving zone 2's.
    while (current.pendingChoice && current.pendingChoice.kind !== "zone") {
      const options = current.pendingChoice.options;
      for (const o of options) offered.add(o.id);
      const pick =
        options.find((o) => o.id === tied[2]?.instanceId) ??
        options.find((o) => o.id === tied[1]?.instanceId) ??
        options.find((o) => o.id === "yes") ??
        options[0];
      current = choose(current, (id) => id === pick?.id);
    }
    expect(offered.has(high.instanceId)).toBe(false);
    const after = settle(current);
    const zones = Object.values(zoneCardIds(self(after, me))).flat();
    expect(zones).toContain(tied[0]?.cardId);
    expect(zones).toContain(high.cardId);
    const ids = self(after, me).zones;
    const left = Object.values(ids)
      .flat()
      .map((s) => s.at(-1)?.instanceId);
    expect(left).toEqual(
      expect.arrayContaining([tied[0]?.instanceId, high.instanceId]),
    );
    expect(left).not.toContain(low.instanceId);
    expect(left).not.toContain(tied[1]?.instanceId);
    expect(left).not.toContain(tied[2]?.instanceId);
  });

  it("SD05-005: 3 Crystals destroyed with no battle card in the discard pile play nothing", () => {
    const { state, me } = setup();
    for (const zone of [1, 2, 3] as const)
      place(state, me, real(CRYSTALS), zone);
    const after = settle(constructed(state, me));
    expect(zoneCardIds(self(after, me))).toEqual({});
    // The tokens are gone and the strategy card stays in its strategy zone: nothing to play.
    expect(self(after, me).discard).toEqual([]);
  });

  it("SD05-005 5.11.1: the played card's [enter] triggers (Minilla (2004): the opponent loses 1 rage)", () => {
    const { state, me, opp } = setup();
    for (const zone of [1, 2, 3] as const)
      place(state, me, real(CRYSTALS), zone);
    inDiscard(state, me, real(MINILLA));
    opp.rage = 3;
    const after = settle(constructed(state, me));
    expect(Object.values(zoneCardIds(self(after, me))).flat()).toEqual([
      real(MINILLA).id,
    ]);
    expect(opponentOf(after, me).rage).toBe(2);
  });

  it("SD05-005 5.11.1: a tie at the highest printed rank is the player's pick", () => {
    const { state, me } = setup();
    for (const zone of [1, 2, 3] as const)
      place(state, me, real(CRYSTALS), zone);
    const first = inDiscard(state, me, battleCard({ rank: 8 }));
    const second = inDiscard(state, me, battleCard({ rank: 8 }));
    inDiscard(state, me, battleCard({ rank: 3 }));
    let current = constructed(state, me);
    while (current.pendingChoice?.options.some((o) => o.id === "yes"))
      current = choose(current, (id) => id === "yes");
    expect(current.pendingChoice?.options.map((o) => o.id).sort()).toEqual(
      [first.instanceId, second.instanceId].sort(),
    );
    const after = settle(choose(current, (id) => id === second.instanceId));
    const zones = Object.values(zoneCardIds(self(after, me))).flat();
    expect(zones).toEqual([second.cardId]);
  });

  it("SD05-005 10.9: a card a replacement keeps from being destroyed isn't one of the 3, so nothing is played", () => {
    const { state, me } = setup();
    for (const zone of [1, 2] as const) place(state, me, real(CRYSTALS), zone);
    // ESD01-011 (rank 5) goes to the bottom of the deck instead of being destroyed.
    const kept = place(state, me, real("ESD01-011"), 3);
    const king = inDiscard(state, me, real(MECHA_KING));
    const after = settle(constructed(state, me));
    expect(zoneCardIds(self(after, me))).toEqual({});
    expect(self(after, me).deck.at(-1)?.cardId).toBe(kept.cardId);
    expect(discardIds(after, me)).toContain(king.cardId);
  });

  it("SD05-005 12.7.2: a destroyed Revenge card's ability triggers, after the play from the discard pile (official FAQ)", () => {
    const { state, me } = setup();
    for (const zone of [1, 2] as const) place(state, me, real(CRYSTALS), zone);
    // Dorat (EBP02-058, rank 2): [revenge] return up to 1 [king-ghidorah] monster card.
    place(state, me, real("EBP02-058"), 3);
    const king = inDiscard(state, me, real(MECHA_KING));
    inDiscard(state, me, real("EBP02-045")); // King Ghidorah (1964), a monster card
    const after = settle(constructed(state, me));
    const entries = after.log.slice(state.log.length);
    const played = entries.findIndex(
      (e) => e.type === "place" && e.payload["cardId"] === king.cardId,
    );
    const revenge = entries.findIndex(
      (e) =>
        e.type === "resolveAbility" &&
        String(e.payload["abilityId"]).startsWith("EBP02-058#"),
    );
    expect(played).toBeGreaterThanOrEqual(0);
    expect(revenge).toBeGreaterThan(played);
    expect(self(after, me).hand.map((c) => c.cardId)).toContain(
      real("EBP02-045").id,
    );
  });

  describe("8.2, M2 (Paul, Nov 5, 2026): the play respects GAM's own condition", () => {
    const GAM = "EBP01-073"; // can't be played with 7 or fewer monster cards in your discard pile
    const run = (monsters: number) => {
      const { state, me } = setup();
      for (const zone of [1, 2, 3] as const)
        place(state, me, real(CRYSTALS), zone);
      const gam = inDiscard(state, me, real(GAM));
      const four = inDiscard(state, me, battleCard({ rank: 4 }));
      for (let i = 0; i < monsters; i++)
        inDiscard(state, me, real("EBP02-045"));
      const after = settle(constructed(state, me));
      return {
        zones: Object.values(zoneCardIds(self(after, me))).flat(),
        gam: gam.cardId,
        four: four.cardId,
      };
    };

    it("with 8 monster cards in the discard pile, GAM (rank 7) is played", () => {
      const r = run(8);
      expect(r.zones).toEqual([r.gam]);
    });

    it("with 7, GAM can't be played; the next highest is (provisional until Paul rules)", () => {
      const r = run(7);
      expect(r.zones).not.toContain(r.gam);
      expect(r.zones).toEqual([r.four]);
    });
  });
});

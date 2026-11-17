import type {
  Action,
  CardInstance,
  GameState,
  PlayerId,
} from "@gojisim/engine";
import { RAGE_THREAT } from "@gojisim/engine";
import { counterPlays } from "./cardRules";
import { cardData, ENTANGLING_FEAR } from "./mxPlan";
import { counters } from "./rules";
import type { GroupOptions } from "./switches/settings";
import type { Decklist } from "./types";

/**
 * BFW182's Tangler plan (#403, Discord #tangler; Paul's R-20), with #369 (Ian: passing with an
 * Entangling Fear in hand). A preference like the Wrangler plan: the moves it argues against, and
 * the ones it frees.
 *
 * 1. Tangle and build at once (`tanglerFear`, `tanglerBuild`): one Entangling Fear EBP04-081 every
 *    turn it can be played and none is in force (it holds a low zone, where the deck's strategies
 *    work and the opponent has less to play): no passing before it. Spare copies are kept: no Fear
 *    goes in a discard or an invasion's cost while fewer than 3 are in hand. The low evolution
 *    cards (rank 4 or lower with [evolution]) come out early: no passing while one can be played.
 * 2. Counter as early and as often as the board allows: card rule 20 already takes it.
 * 3. Discard by the math (`tanglerDiscard`): with a monster that lowers the opponent's rage when a
 *    battle card is discarded (Godzilla (2002) EBP03-015, Godzilla (2003) EPR-020 and EBP03-017)
 *    and their rage above 0, a battle card discarded takes RAGE_THREAT (5000, 3.4.5) off their
 *    threat. Where a discard is picked (5.7), a battle card worth less on the board (its counter
 *    power if its rank lets it be played now, 8.2.1, else nothing) goes before any other card; at
 *    a "you may discard a battle card" (10.5.4, Godzilla (2003) EBP03-017's enter), yes while there
 *    is one. (Rage gains discard only monster cards, 8.4.1, so they aren't a way.) #439, #440
 *    (BFW182): of the cheap ones the least worth goes first; between cheap ones of the same worth,
 *    one that doesn't draw and discard when played goes before one that does (Orga: a strict
 *    tiebreak, no holding it back, Nov 17); one its rank keeps out of
 *    play now counts 0 (a Perfect Form needing their monster in zone 8); with the counter made,
 *    the Destoroyah cards stay and the rest may go.
 * 4. At their rage 0 (3.4.4) there is nothing to lower: rule 3 is off, and discards only filter.
 * 5. With the counter made, stop playing out the hand (`tanglerStop`): battle card plays and
 *    strategies wait (passing is fine; the hand refills to 5), but Entangling Fear and the low
 *    evolution cards of rule 1.
 * 6. Save the finishers (`tanglerSave`; BFW182 and Paul, Nov 16): any Destoroyah battle card
 *    (Aggregate Form EBP01-049, Flying Form EBP01-054, Perfect Form EBP02-037) turns on Godzilla
 *    vs. Destoroyah EBP01-062. (a) With none on your field, the last rank 4 or 6 copy in hand stays:
 *    it isn't discarded or paid with, nor played unless the play makes this turn's counter. (b)
 *    Godzilla vs. Destoroyah is held for the final counter (their monster deck empty) or the one
 *    that stops a losing invasion (their monster in zone 6 or beyond): otherwise it waits.
 */

/** The Tangler's monsters that lower the opponent's rage when a battle card is discarded. */
export const RAGE_REDUCERS = new Set(["EBP03-015", "EPR-020", "EBP03-017"]);

/** Rule 6 (BFW182): the Destoroyah battle cards, any of which turns on Godzilla vs. Destoroyah. */
export const DESTOROYAH = new Set(["EBP01-049", "EBP01-054", "EBP02-037"]);
/** #439: the discards a card's own enter makes (Orga, Battra (Imago), Destoroyah Perfect Form). */
const DRAW_DISCARDS: Record<string, number> = {
  "EBP01-047": 1,
  "EBP01-055": 1,
  "EBP02-037": 2,
};
/** Rule 6: the rank 4 (Aggregate Form) and rank 6 (Flying Form) copies, one of which stays. */
const DESTOROYAH_KEPT = new Set(["EBP01-049", "EBP01-054"]);
/** Rule 6: Godzilla vs. Destoroyah EBP01-062 (+10,000 with a Destoroyah battle card out). */
const VS_DESTOROYAH = "EBP01-062";
/** Rule 6: their monster from this zone is in reach of your zone 8 (a losing invasion). */
const LOSING_ZONE = 6;

/** Rule 1: Entangling Fear copies in hand that make one a spare to discard. */
const FEAR_SPARES = 3;
/** Rule 1: the highest rank of a low evolution card. */
const LOW_EVOLUTION_RANK = 4;

/** A Tangler list: a rage-lowering monster and Entangling Fear. */
export function isTanglerDeck(deck: Decklist | undefined): boolean {
  if (!deck) return false;
  return (
    deck.monsterDeck.some((c) => RAGE_REDUCERS.has(c.deckCardNumber)) &&
    deck.mainDeck.some((c) => c.deckCardNumber === ENTANGLING_FEAR)
  );
}

/** The Tangler plan's switches (#403): one key per `tangler` switch file, each on by default. */
export type TanglerOptions = GroupOptions<"tangler">;

const isLowEvolution = (state: GameState, card: CardInstance | undefined) => {
  const d = cardData(state, card);
  return (
    d?.type === "Battle" &&
    (d.rank ?? 0) <= LOW_EVOLUTION_RANK &&
    /\[evolution-\d+\]/.test(d.text ?? "")
  );
};

/** The moves the Tangler plan argues against, and the ones it frees. */
export function tanglerVerdict(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
  options: TanglerOptions = {},
): { against: Set<Action>; rescued: Set<Action> } {
  const {
    fear = true,
    build = true,
    discard = true,
    stop = true,
    save = true,
    worth: byWorth = true,
  } = options;
  const against = new Set<Action>();
  const rescued = new Set<Action>();
  if (!isTanglerDeck(own)) return { against, rescued };
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  if (!player || !opponent) return { against, rescued };
  const inHand = (id: string | undefined) =>
    player.hand.find((c) => c.instanceId === id);
  const numberOf = (id: string | undefined) =>
    cardData(state, inHand(id))?.deckCardNumber;
  const fears = player.hand.filter(
    (c) => cardData(state, c)?.deckCardNumber === ENTANGLING_FEAR,
  ).length;
  const choice =
    state.pendingChoice?.player === me ? state.pendingChoice : null;
  // The hand card a discard pick names (5.7: the options are hand cards).
  const picked = (a: Action) =>
    choice && a.type === "choose" && choice.rule.startsWith("5.7")
      ? inHand(a.optionId)
      : undefined;

  // Rule 3: a battle card's worth on the board this turn (its counter power when its rank lets
  // it be played now, 8.2.1: at most their monster's zone; else 0) against the rage its discard
  // takes off. Rule 4: nothing to take off at their rage 0.
  const top = cardData(state, player.invadingMonsterZone.at(-1));
  const lowers =
    discard &&
    RAGE_REDUCERS.has(top?.deckCardNumber ?? "") &&
    opponent.rage > 0;
  // #439 (BFW182): a playable card that draws and discards drops their rage again for each
  // discard (Orga: about 7000, not 2000), a tiebreak below. #440: a card its rank keeps out of play now (Perfect Form
  // needing their monster in zone 8) is worth nothing. With the counter made, the Destoroyah cards
  // stay (rule 6) and the rest may go.
  const made = counters(state, me);
  const worth = (c: CardInstance | undefined) => {
    const d = cardData(state, c);
    if (d?.type !== "Battle") return Number.POSITIVE_INFINITY;
    if (byWorth && made && DESTOROYAH.has(d.deckCardNumber))
      return Number.POSITIVE_INFINITY;
    const playable = (d.rank ?? 0) <= (opponent.monsterPosition ?? 0);
    if (!playable) return 0;
    return d.counterOrThreat ?? 0;
  };
  // #439 (BFW182, Nov 17): the draw-discards are a strict tiebreak between cheap discards of the
  // same worth, not a reason to hold Orga (it filters well too): of those, one with none goes
  // first. (With the counter made, the extra drop isn't needed: Orga may go.)
  const extra = (c: CardInstance | undefined) => {
    const d = cardData(state, c);
    const playable = (d?.rank ?? 0) <= (opponent.monsterPosition ?? 0);
    return byWorth && lowers && !made && d && playable
      ? (DRAW_DISCARDS[d.deckCardNumber] ?? 0)
      : 0;
  };
  const cheap = (c: CardInstance | undefined) => worth(c) < RAGE_THREAT;

  // Rule 6a: the last rank 4 or 6 Destoroyah copy in hand, with no Destoroyah on your field.
  const onField = Object.values(player.zones).some((stacks) =>
    stacks.some((stack) =>
      DESTOROYAH.has(cardData(state, stack.at(-1))?.deckCardNumber ?? ""),
    ),
  );
  const kept = player.hand.filter((c) =>
    DESTOROYAH_KEPT.has(cardData(state, c)?.deckCardNumber ?? ""),
  );
  const keep = !onField && kept.length === 1 ? [kept[0]!.instanceId] : [];

  // Rule 1: spare Entangling Fears are kept (fewer than 3 in hand: none goes).
  if (fear && fears < FEAR_SPARES)
    for (const a of actions) {
      const card =
        picked(a) ??
        (a.type === "invade" ? inHand(a.cardInstanceId) : undefined);
      if (cardData(state, card)?.deckCardNumber === ENTANGLING_FEAR)
        against.add(a);
    }

  // Rule 6a at a discard pick: that copy waits while another card can go.
  if (save && choice && keep.length > 0) {
    const picks = actions.filter((a) => picked(a) !== undefined);
    if (picks.some((a) => picked(a)?.instanceId !== keep[0]))
      for (const a of picks)
        if (picked(a)?.instanceId === keep[0]) against.add(a);
  }

  // Rule 3 at a discard pick: a cheap battle card goes before any other card; at a "you may
  // discard a battle card" of a rage-lowering monster, yes while there is one.
  if (choice) {
    if (lowers && choice.kind === "confirm" && choice.rule === "10.5.4") {
      const source = state.resolution
        ? state.cards[state.resolution.standby.sourceCardId]?.deckCardNumber
        : undefined;
      const no = actions.find(
        (a) => a.type === "choose" && a.optionId === "no",
      );
      if (
        no &&
        RAGE_REDUCERS.has(source ?? "") &&
        player.hand.some((c) => cheap(c))
      )
        against.add(no);
    } else if (lowers) {
      const picks = actions.filter((a) => picked(a) !== undefined);
      // (Rule 6a's kept Destoroyah copy isn't one.) #439, #440: of those, the least worth goes.
      const cheapPicks = picks.filter(
        (a) => cheap(picked(a)) && picked(a)?.instanceId !== keep[0],
      );
      const least = Math.min(...cheapPicks.map((a) => worth(picked(a))));
      const leastWorth = cheapPicks.filter((a) => worth(picked(a)) === least);
      const fewest = Math.min(...leastWorth.map((a) => extra(picked(a))));
      const good = byWorth
        ? leastWorth.filter((a) => extra(picked(a)) === fewest)
        : cheapPicks;
      if (good.length > 0)
        for (const a of picks)
          if (good.includes(a)) rescued.add(a);
          else against.add(a);
    }
    return { against, rescued };
  }
  if (state.turnPlayer !== me) return { against, rescued };

  const feared = player.strategyZones
    .flat()
    .some((x) => cardData(state, x.card)?.deckCardNumber === ENTANGLING_FEAR);
  const fearPlays = actions.filter(
    (a) =>
      a.type === "activateStrategy" &&
      numberOf(a.cardInstanceId) === ENTANGLING_FEAR,
  );
  const evolutions = actions.filter(
    (a) =>
      a.type === "playBattle" &&
      isLowEvolution(state, inHand(a.cardInstanceId)),
  );
  const passes = actions.filter((a) => a.type === "pass");

  // Rule 5: with the counter made, the hand stays (but rule 1's Fear and low evolution cards).
  if (stop && counters(state, me))
    for (const a of actions)
      if (
        (a.type === "playBattle" || a.type === "activateStrategy") &&
        !fearPlays.includes(a) &&
        !evolutions.includes(a)
      )
        against.add(a);

  // Rule 6a: the last rank 4 or 6 Destoroyah battle card in hand stays (with none on the field),
  // unless playing it makes this turn's counter.
  if (save && keep.length > 0)
    for (const a of actions) {
      if (a.type === "invade" && keep.includes(a.cardInstanceId))
        against.add(a);
      if (a.type !== "playBattle" || !keep.includes(a.cardInstanceId)) continue;
      if (counters(state, me) || !counterPlays(state, actions, me).has(a))
        against.add(a);
    }
  // Rule 6b: Godzilla vs. Destoroyah waits unless it makes the counter that's the last one (their
  // monster deck is empty) or that stops a losing invasion (their monster in reach of your zone 8).
  if (save) {
    const vs = actions.filter(
      (a) =>
        a.type === "activateStrategy" &&
        numberOf(a.cardInstanceId) === VS_DESTOROYAH,
    );
    if (vs.length > 0) {
      const makes = counterPlays(state, actions, me, true);
      const last = opponent.monsterDeck.length === 0;
      const losing = (opponent.monsterPosition ?? 0) >= LOSING_ZONE;
      for (const a of vs)
        if (counters(state, me) || !makes.has(a) || !(last || losing))
          against.add(a);
    }
  }

  // Rule 1: Entangling Fear every turn it can be played (#369); the low evolution cards early.
  if (fear && !feared && fearPlays.length > 0) {
    for (const a of fearPlays) rescued.add(a);
    for (const a of passes) against.add(a);
  }
  if (build && evolutions.length > 0) {
    for (const a of evolutions) rescued.add(a);
    for (const a of passes) against.add(a);
  }

  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  return { against, rescued };
}

import type {
  Action,
  CardInstance,
  GameState,
  PlayerId,
} from "@gojisim/engine";
import { getLegalActions, RAGE_THREAT } from "@gojisim/engine";
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
 *    is one. (Rage gains discard only monster cards, 8.4.1, so they aren't a way.)
 * 4. At their rage 0 (3.4.4) there is nothing to lower: rule 3 is off, and discards only filter.
 * 5. With the counter made, stop playing out the hand (`tanglerStop`): battle card plays and
 *    strategies wait (passing is fine; the hand refills to 5), but Entangling Fear and the low
 *    evolution cards of rule 1.
 * 6. Save the finishers (`tanglerSave`, Monarch, Nov 16): Destoroyah Perfect Form EBP02-037 is
 *    held unless it's needed for this turn's counter: it makes the counter, the counter isn't made
 *    already, and no other play makes it (Godzilla vs. Destoroyah EBP01-062 aside). That's card
 *    rule 5's test, which already holds Godzilla vs. Destoroyah the same way. (BFW182 is asked
 *    which Destoroyah card he meant; Perfect Form for now.)
 */

/** The Tangler's monsters that lower the opponent's rage when a battle card is discarded. */
export const RAGE_REDUCERS = new Set(["EBP03-015", "EPR-020", "EBP03-017"]);

/** Rule 6: the battle card held for the late-game counter (Monarch: Perfect Form, for now). */
export const FINISHER = "EBP02-037";
/** Rule 6: the counter-only strategy card rule 5 already holds the same way. */
const VS_DESTOROYAH = "EBP01-062";

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
  const cheap = (c: CardInstance | undefined) => {
    const d = cardData(state, c);
    if (d?.type !== "Battle") return false;
    const playable = (d.rank ?? 0) <= (opponent.monsterPosition ?? 0);
    return (playable ? (d.counterOrThreat ?? 0) : 0) < RAGE_THREAT;
  };

  // Rule 1: spare Entangling Fears are kept (fewer than 3 in hand: none goes).
  if (fear && fears < FEAR_SPARES)
    for (const a of actions) {
      const card =
        picked(a) ??
        (a.type === "invade" ? inHand(a.cardInstanceId) : undefined);
      if (cardData(state, card)?.deckCardNumber === ENTANGLING_FEAR)
        against.add(a);
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
      const good = picks.filter((a) => cheap(picked(a)));
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

  // Rule 6: Perfect Form waits unless only it (with Godzilla vs. Destoroyah) makes this turn's
  // counter.
  if (save) {
    const finishers = actions.filter(
      (a) => a.type === "playBattle" && numberOf(a.cardInstanceId) === FINISHER,
    );
    if (finishers.length > 0) {
      const makes = counterPlays(state, actions, me);
      // The same hand without the finishers: can it still make the counter this turn?
      const without: GameState = {
        ...state,
        players: state.players.map((p) =>
          p.id === me
            ? {
                ...p,
                hand: p.hand.filter((c) => {
                  const n = cardData(state, c)?.deckCardNumber;
                  return n !== FINISHER && n !== VS_DESTOROYAH;
                }),
              }
            : p,
        ) as GameState["players"],
      };
      const othersMake =
        counterPlays(without, getLegalActions(without, me), me).size > 0;
      const needed = !counters(state, me) && !othersMake;
      for (const a of finishers) if (!(needed && makes.has(a))) against.add(a);
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

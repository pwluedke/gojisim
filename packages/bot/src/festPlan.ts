import {
  type Action,
  counterPowerOf,
  getThreat,
  type GameState,
  getLegalActions,
  type PlayerId,
} from "@gojisim/engine";
import { canClearZone8, counterPlays, winsNow } from "./cardRules";
import { counterWithin, playOut } from "./counterReach";
import type { GroupOptions } from "./switches/settings";
import type { Decklist } from "./types";

/**
 * The Red Fest plan (Slick's answers to the Red Fest guide, Nov 13, via Monarch), for a "Red
 * Counter (Fest)" deck: the Fest Godzilla monster deck (EBP01-011, EBP01-012) with the Fest rank
 * III and IV (EBP01-013, EBP01-014) in the main deck (the catalog's archetype). Like the Wrangler
 * plan, a preference: it argues against moves and the search favors the others, with Paul's
 * rules (Hard); each line only when the bot's own decklist has the cards it names. (Slick's line
 * 1, "go second", has nothing to steer: the first player is random, 6.3.1.4.)
 *
 * Line 2: invade only from rank IV; before that push (Godzilla Landing, the Fest monsters,
 * Godzilla (2004)) and counter. Exception: invade earlier with 3 or more monster cards to rage, a
 * Space Beam EBP01-031 in hand and the opponent's zone 8 clear or clearable.
 * Line 3 (needs Anguirus (2004) EBP02-016): it goes in zone 1 or 2, unless it's needed for the
 * counter now in zone 3 or 8.
 * Line 4 (needs Godzilla the Ride EPR-015): get a Ride into the discard pile (it turns on the
 * others' +5000): Godzilla (1954) ESC01-001 pays with a Ride when one can pay, and a Ride goes on
 * a Ride (11.5 sends the first to the discard pile) when one can.
 * Line 2, rank I (#400, Slick, `festRankOne`): the rank I Fest EBP01-011 invades only to line up
 * its same-column push (advancing into the column of their monster pushes it forward) with a
 * counter to follow this turn (up to 3 battle card plays); then it isn't argued against, and no
 * other invasion at rank I is allowed (the early exception included).
 * Line 2's exceptions (#406, Slick): (`festRankTwoPush`) the rank II Fest EBP01-012 invades when
 * its end-phase push takes their monster to zone 6 or beyond, lining up the counter next turn;
 * (`festEmerges`) an invasion that takes your monster to zone 6 or beyond fires Godzilla Emerges
 * ESD01-014 (in hand, 2 rage there or to be raged) for the rank 8 Godzilla (2023) EBP03-041;
 * (`festRankThreeSave`) at rank III in reach of their counter, the rage goes to the rank IV as
 * monster cards kept in hand (no rage discards), and the battle cards and strategies are played
 * out before passing, to make room for the end-of-turn draw.
 * Line 5, wall up (#400, Slick, `festWall`): against Monster X, once losing the counter race
 * (Slick: about to be two ranks ahead of them, a countered monster going up a rank: 2 ranks
 * above their monster, or 1 with your monster in zones 6-8), stop racing: below rank IV no invasion but one
 * that wins this turn; Heat Ray ESD01-016 is held for the invasion win (only when an invasion after it wins);
 * the rank IV Godzilla (2023) EBP01-010 isn't raged away or paid with. Hoard and rage toward the
 * rank IV Fest (line 5's rage over passing).
 * Line 5 (needs the Fest rank IV EBP01-014), against Monster X: the rank IV Fest with 2 or more
 * battle cards in your zones (Monster X's rank 5 or lower battle cards can't engage it), rage
 * heavily, and from rank IV go for the invasion.
 */

export const FEST_RANK_ONE = "EBP01-011";
export const FEST_RANK_TWO = "EBP01-012";
export const FEST_RANK_THREE = "EBP01-013";
export const FEST_RANK_FOUR = "EBP01-014";
export const SPACE_BEAM = "EBP01-031";
export const ANGUIRUS_2004 = "EBP02-016";
export const RIDE = "EPR-015";
export const GODZILLA_1954_BATTLE = "ESC01-001";
/** Line 5, wall up: the removal held for the invasion win, and the rank IV it rides on. */
export const HEAT_RAY = "ESD01-016";
export const GODZILLA_2023_IV = "EBP01-010";
/** #406: Godzilla Emerges (rank 6, 2 rage) and the rank 8 Godzilla (2023) battle card it fetches. */
export const GODZILLA_EMERGES = "ESD01-014";
export const GODZILLA_2023_VIII = "EBP03-041";
/** #406: Godzilla Emerges' rank (the zone your monster needs, 8.3.1) and its rage. */
const EMERGES_ZONE = 6;
const EMERGES_RAGE = 2;
/** Line 2: invade from this rank of the invading monster. */
const INVADE_FROM_RANK = 4;
/** Line 2's exception: monster cards in hand to rage. */
const RAGE_CARDS = 3;
/** Line 5, wall up (Slick): ranks ahead of their monster that mean the counter race is lost. */
const WALL_RANKS = 2;
/** A monster in this zone or beyond can be countered (5.15.1.1). */
const COUNTERED_FROM = 6;
/** Line 5: battle cards in your zones for the rank IV Fest's guard. */
const FEST_GUARD_CARDS = 2;

type Card = GameState["cards"][number];

/** Whether a decklist is a Fest deck: the Fest monster deck and the Fest rank III and IV. */
export function isFestDeck(deck: Decklist | undefined): boolean {
  if (!deck) return false;
  const monsters = new Set(deck.monsterDeck.map((c) => c.deckCardNumber));
  const main = new Set(deck.mainDeck.map((c) => c.deckCardNumber));
  return (
    monsters.has(FEST_RANK_ONE) &&
    monsters.has(FEST_RANK_TWO) &&
    main.has(FEST_RANK_THREE) &&
    main.has(FEST_RANK_FOUR)
  );
}

const has = (deck: Decklist | undefined, n: string) =>
  deck?.mainDeck.some((c) => c.deckCardNumber === n) ?? false;

/** Whether a decklist is a Monster X deck (its monster deck has Monster X). */
const isMonsterX = (deck: Decklist | undefined) =>
  deck?.monsterDeck.some((c) => c.name === "Monster X") ?? false;

/** The Red Fest plan's switches (#402): one key per `fest` switch file, each on by default. */
export type FestOptions = GroupOptions<"fest">;

/** The moves the plan argues against. */
export function festVerdict(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
  /** The opponent's decklist (public), when known. */
  theirs?: Decklist,
  /** The plan's switches (#402: `groupOptions(settings, "fest")`); each defaults to on. */
  options: FestOptions = {},
): { against: Set<Action>; rescued: Set<Action> } {
  const {
    rankOne = true,
    wall = true,
    rankTwoPush = true,
    emerges = true,
    rankThreeSave = true,
  } = options;
  const against = new Set<Action>();
  const rescued = new Set<Action>();
  if (!isFestDeck(own)) return { against, rescued };
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  if (!player || !opponent || state.turnPlayer !== me || state.pendingChoice)
    return { against, rescued };
  const card = (id: string): Card | undefined => {
    const c = player.hand.find((h) => h.instanceId === id);
    return c ? state.cards[c.cardId] : undefined;
  };
  const top = player.invadingMonsterZone[player.invadingMonsterZone.length - 1];
  const rank = (top && state.cards[top.cardId]?.rank) ?? 0;
  const invades = actions.filter((a) => a.type === "invade");
  const rages = actions.filter((a) => a.type === "gainRage");
  const battleCards = Object.values(player.zones).filter((stacks) =>
    stacks.some((stack) => {
      const t = stack[stack.length - 1];
      return t !== undefined && state.cards[t.cardId]?.type === "Battle";
    }),
  ).length;
  const vsMonsterX =
    isMonsterX(theirs) ||
    opponent.invadingMonsterZone.some(
      (c) => state.cards[c.cardId]?.name === "Monster X",
    );

  // Line 2: no invasion before rank IV, but for the early-invasion exception.
  if (rank < INVADE_FROM_RANK && invades.length > 0) {
    const early =
      rages.length >= RAGE_CARDS &&
      player.hand.some(
        (c) => state.cards[c.cardId]?.deckCardNumber === SPACE_BEAM,
      ) &&
      canClearZone8(state, actions, me);
    if (!early) for (const a of invades) against.add(a);
  }

  // Line 2, rank I (#400, Slick): invade only for the same-column push with a counter to follow.
  const topNumber = top ? state.cards[top.cardId]?.deckCardNumber : undefined;
  if (rankOne && topNumber === FEST_RANK_ONE && invades.length > 0) {
    const theirAt = opponent.monsterPosition;
    for (const a of invades) {
      const s = playOut(state, a, me);
      const pushed =
        !!s &&
        s.players.find((p) => p.id === opponent.id)?.monsterPosition !==
          theirAt;
      if (pushed && s && counterWithin(s, me)) {
        against.delete(a);
        rescued.add(a);
      } else against.add(a);
    }
  }

  // #406 (Slick), line 2's exceptions below rank IV:
  // (a) the rank II Fest EBP01-012's push: invading, its end phase advances their monster a zone;
  // an invasion when that takes their monster to zone 6 or beyond, where the counter next turn
  // sends it back (5.15.1.1), lines up that counter.
  if (rankTwoPush && topNumber === FEST_RANK_TWO && invades.length > 0) {
    const theirAt = opponent.monsterPosition ?? 0;
    if (theirAt < 8 && theirAt + 1 >= COUNTERED_FROM)
      for (const a of invades) {
        against.delete(a);
        rescued.add(a);
      }
  }
  // (b) Godzilla Emerges ESD01-014 (rank 6, so from zone 6, 8.3.1; it needs 2 rage): an invasion
  // that takes your monster to zone 6 or beyond, with it in hand and 2 rage there or to be raged,
  // fires it this turn for the rank 8 Godzilla (2023) EBP03-041.
  const emergesInHand = player.hand.some(
    (c) => state.cards[c.cardId]?.deckCardNumber === GODZILLA_EMERGES,
  );
  const myAt = player.monsterPosition ?? 0;
  if (
    emerges &&
    emergesInHand &&
    has(own, GODZILLA_2023_VIII) &&
    rank < INVADE_FROM_RANK &&
    myAt < EMERGES_ZONE &&
    player.rage + rages.length >= EMERGES_RAGE
  )
    for (const a of invades) {
      const s = playOut(state, a, me);
      const at = s?.players.find((p) => p.id === me)?.monsterPosition ?? 0;
      if (s && s.turnPlayer === me && at >= EMERGES_ZONE) {
        against.delete(a);
        rescued.add(a);
      }
    }

  // #406 (Slick), line 2c: at rank III in reach of their counter (zone 6 or beyond, their counter
  // power at least your threat), the counter comes and the rank IV is next: carry the rage to it
  // as cards in hand (no rage discards this turn), and play out the battle cards and strategies
  // that do nothing now, to make room for the end-of-turn draw (no passing while one can go).
  const countered =
    (player.monsterPosition ?? 0) >= COUNTERED_FROM &&
    counterPowerOf(state, opponent) >= getThreat(state, me);
  if (rankThreeSave && rank === 3 && countered) {
    for (const a of rages) against.add(a);
    const playOuts = actions.filter(
      (a) => a.type === "playBattle" || a.type === "activateStrategy",
    );
    if (playOuts.length > 0)
      for (const a of actions) if (a.type === "pass") against.add(a);
  }

  // Line 3: Anguirus (2004) in zone 1 or 2, unless the counter needs it in zone 3 or 8 now.
  if (has(own, ANGUIRUS_2004)) {
    const plays = actions.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" &&
        card(a.cardInstanceId)?.deckCardNumber === ANGUIRUS_2004,
    );
    if (plays.some((a) => a.zone === 1 || a.zone === 2)) {
      const needed = counterPlays(state, actions, me);
      for (const a of plays)
        if (
          a.zone !== 1 &&
          a.zone !== 2 &&
          !((a.zone === 3 || a.zone === 8) && needed.has(a))
        )
          against.add(a);
    }
  }

  // Line 4: get a Ride into the discard pile.
  const rideInDiscard = player.discard.some(
    (c) => state.cards[c.cardId]?.deckCardNumber === RIDE,
  );
  if (has(own, RIDE) && !rideInDiscard) {
    const isRide = (id: string | undefined) =>
      id !== undefined && card(id)?.deckCardNumber === RIDE;
    // Godzilla (1954) pays with a Ride when one can pay.
    const g1954 = actions.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" &&
        card(a.cardInstanceId)?.deckCardNumber === GODZILLA_1954_BATTLE &&
        a.costCardInstanceId !== undefined,
    );
    if (g1954.some((a) => isRide(a.costCardInstanceId)))
      for (const a of g1954) if (!isRide(a.costCardInstanceId)) against.add(a);
    // A Ride goes on your own Ride when it can.
    const ridePlays = actions.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" && isRide(a.cardInstanceId),
    );
    const onRide = (a: Extract<Action, { type: "playBattle" }>) =>
      player.zones[a.zone].some((stack) => {
        const t = stack[stack.length - 1];
        return (
          t !== undefined && state.cards[t.cardId]?.deckCardNumber === RIDE
        );
      });
    if (ridePlays.some(onRide))
      for (const a of ridePlays) if (!onRide(a)) against.add(a);
  }

  // Line 5: against Monster X, the rank IV Fest behind 2 battle cards, rage, invade from rank IV.
  if (vsMonsterX && has(own, FEST_RANK_FOUR)) {
    const fest4 = actions.filter(
      (a) =>
        a.type === "playMonster" &&
        card(a.cardInstanceId)?.deckCardNumber === FEST_RANK_FOUR,
    );
    if (fest4.length > 0 && battleCards >= FEST_GUARD_CARDS)
      for (const a of actions)
        if (
          a.type === "pass" ||
          (a.type === "gainRage" &&
            card(a.cardInstanceId)?.deckCardNumber === FEST_RANK_FOUR)
        )
          against.add(a);
    // Rage heavily: a rage discard over passing.
    if (rages.length > 0)
      for (const a of actions) if (a.type === "pass") against.add(a);
    // From rank IV, the invasion over passing.
    if (rank >= INVADE_FROM_RANK && invades.length > 0)
      for (const a of actions) if (a.type === "pass") against.add(a);
  }

  // Line 5, wall up (#400, Slick): against Monster X and losing the counter race, which Slick
  // counts as "about to be two ranks ahead of them" (a countered monster goes up a rank,
  // 5.15.1.2): 2 ranks above their monster, or 1 with their counter likely next turn (your
  // monster in zones 6-8, where it can be countered).
  const theirTop = opponent.invadingMonsterZone.at(-1);
  const theirRank = (theirTop && state.cards[theirTop.cardId]?.rank) ?? 0;
  const at = player.monsterPosition ?? 0;
  const losingRace =
    rank - theirRank >= WALL_RANKS ||
    (rank - theirRank === WALL_RANKS - 1 && at >= COUNTERED_FROM);
  if (wall && vsMonsterX && losingRace) {
    // Below rank IV: no invasion but one that wins now (from rank IV, line 5 goes for it).
    if (rank < INVADE_FROM_RANK)
      for (const a of invades) if (!winsNow(state, a, me)) against.add(a);
    for (const a of actions) {
      const n =
        "cardInstanceId" in a
          ? card(a.cardInstanceId)?.deckCardNumber
          : undefined;
      // The rank IV Godzilla (2023) is held: not raged away, not paid with.
      if (
        (a.type === "gainRage" || a.type === "invade") &&
        n === GODZILLA_2023_IV
      )
        against.add(a);
      // Heat Ray waits for the invasion win: only when an invasion after it wins.
      if (a.type === "activateStrategy" && n === HEAT_RAY) {
        const s = playOut(state, a, me);
        const wins =
          !!s &&
          s.turnPlayer === me &&
          getLegalActions(s, me).some(
            (b) => b.type === "invade" && winsNow(s, b, me),
          );
        if (!wins) against.add(a);
      }
    }
  }

  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  return { against, rescued };
}

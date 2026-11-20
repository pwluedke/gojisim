import { mark } from "./trace";
import type { Action, GameState, PlayerId } from "@gojisim/engine";
import { counterPowerOf, getThreat } from "@gojisim/engine";
import { playOut } from "./counterReach";
import { winsNow } from "./cardRules";
import { cardData } from "./mxPlan";
import type { GroupOptions } from "./switches/settings";
import {
  isSpaceGDeck,
  SPACEG_FOUR,
  SPACEG_ONE,
  SPACEG_THREE,
  SPACEG_TWO,
} from "./spacegDeck";
import type { Decklist } from "./types";

export {
  isSpaceGDeck,
  SPACEG_FOUR,
  SPACEG_ONE,
  SPACEG_THREE,
  SPACEG_TWO,
} from "./spacegDeck";

/**
 * The SpaceG plan (#408, Discord #space-godzilla), with its addendum. A preference like the
 * Wrangler plan: the moves it argues against, and the ones it frees. "SpaceG's engine is invading
 * and raging every turn; Crystals come from invading or covering, not from waiting."
 *
 * 1. Invade every turn (`spacegInvade`): at ranks 1 and 2 (SpaceGodzilla Flying Form EBP02-052,
 *    SpaceGodzilla EBP02-053, whose [invading] makes Crystals) and at rank 4, no passing while an
 *    invasion can be made.
 * 2. Rage at rank 3 and with the rank 4 Flying Form (`spacegRage`): the rank 3 SpaceGodzilla
 *    EBP02-054 destroys a rank 5 or lower battle card of theirs per Crystals in your zones whenever
 *    its rage goes up, and the rank 4 SpaceGodzilla Flying Form EBP02-057 makes 2 Crystals (God of
 *    Destruction's Counterattack EBP02-072 wants 3): no passing while a rage discard can be made
 *    (at rank 3, while they have such a card and you have Crystals).
 * 3. Cover the rank 3 with a rank 3 (`spacegCover`): another rank 3 SpaceGodzilla from your hand
 *    on the one in play makes 2 more Crystals: no passing while it can be played; and while this
 *    turn's invasion can still be made, it waits for it (the addendum: invade, then cover, so the
 *    Crystals land behind SpaceG).
 * 4. Positioning (`spacegZone`, Nov 16): the choice is how far to invade; the end-of-turn
 *    advance adds one zone either way. End the turn in zone 7 by default; an invasion that would
 *    end it in zone 8 waits (while one that ends it in zone 7 or short of it can be made) unless
 *    SpaceG survives their next counter there: their best counter power next turn (their board's,
 *    and their best battle cards in hand up to rank 8, one per empty zone; the discard pile doesn't
 *    count) stays below SpaceG's threat.
 */

/** Every SpaceGodzilla monster card in the list (the main deck's rank 4 EBP02-056 too). */
const SPACEG_MONSTERS = new Set([
  SPACEG_ONE,
  SPACEG_TWO,
  SPACEG_THREE,
  "EBP02-056",
  SPACEG_FOUR,
]);
/** The Crystals token. */
export const CRYSTALS = "EBP02-T03";
/** Rule 4: the default zone to end the turn in, and the highest rank they can play against 8. */
const END_ZONE = 7;
const ZONE_8_RANK = 8;
/** Rule 2: the rank of their battle cards the rank 3's rage destroys. */
const DESTROY_RANK = 5;

/** Rule 5: God of Destruction's Counterattack, kept out of invasion costs and rage discards. */
export const GOD_OF_DESTRUCTION = "EBP02-072";

/**
 * Rule 5 (Nov 18 decision), a hard rule, not a preference: with a SpaceG list, God of
 * Destruction's Counterattack is never paid for an invasion that doesn't win the game, nor
 * discarded for rage, while another move is left (the root's plan kills, `planDead`).
 */
export function spacegKeepGodDead(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
): Action[] {
  if (!isSpaceGDeck(own)) return [];
  const player = state.players.find((p) => p.id === me);
  if (!player || state.turnPlayer !== me || state.pendingChoice) return [];
  const isGod = (a: Action) =>
    (a.type === "invade" || a.type === "gainRage") &&
    cardData(
      state,
      player.hand.find((h) => h.instanceId === a.cardInstanceId),
    )?.deckCardNumber === GOD_OF_DESTRUCTION;
  return actions.filter(
    (a) => isGod(a) && (a.type === "gainRage" || !winsNow(state, a, me)),
  );
}

/**
 * Rules 6 and 7 (#497): costs paid with the cards whose value is in the discard pile (monster
 * cards) before the cards whose value is in hand. Rule 6: an invasion isn't paid with a card
 * that isn't a monster card while a monster card with the same invasion icons can pay it. Rule 7:
 * at SpaceGodzilla Flying Form EBP02-052's Crystal discard, God of Destruction's Counterattack
 * never goes, and no card but a monster card goes while one can. Hard rules, with the plans'
 * other kills at the root (`planDead`).
 */
export function spacegCostDead(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
  options: { monsterCost?: boolean; crystalCost?: boolean } = {},
): { invasions: Action[]; crystals: Action[] } {
  const none = { invasions: [], crystals: [] };
  const { monsterCost = true, crystalCost = true } = options;
  if (!isSpaceGDeck(own)) return none;
  const player = state.players.find((p) => p.id === me);
  if (!player) return none;
  const inHand = (id: string) =>
    cardData(
      state,
      player.hand.find((h) => h.instanceId === id),
    );
  const choice = state.pendingChoice;
  if (choice) {
    if (!crystalCost || choice.player !== me) return none;
    const source = state.resolution
      ? state.cards[state.resolution.standby.sourceCardId]
      : undefined;
    if (source?.deckCardNumber !== SPACEG_ONE) return none;
    const picks = actions.filter(
      (a): a is Extract<Action, { type: "choose" }> =>
        a.type === "choose" && inHand(a.optionId) !== undefined,
    );
    const monster = (a: (typeof picks)[number]) =>
      inHand(a.optionId)?.type === "Monster";
    const crystals = picks.filter(
      (a) =>
        inHand(a.optionId)?.deckCardNumber === GOD_OF_DESTRUCTION ||
        (picks.some(monster) && !monster(a)),
    );
    return { invasions: [], crystals };
  }
  if (!monsterCost || state.turnPlayer !== me) return none;
  const invades = actions.filter(
    (a): a is Extract<Action, { type: "invade" }> => a.type === "invade",
  );
  const icons = (a: (typeof invades)[number]) =>
    inHand(a.cardInstanceId)?.invadeZones ?? 0;
  const monster = (a: (typeof invades)[number]) =>
    inHand(a.cardInstanceId)?.type === "Monster";
  const invasions = invades.filter(
    (a) =>
      !monster(a) && invades.some((b) => monster(b) && icons(b) === icons(a)),
  );
  return { invasions, crystals: [] };
}

/** The SpaceG plan's switches (#408): one key per `spaceg` switch file, each on by default. */
export type SpaceGOptions = GroupOptions<"spaceg">;

/** The moves the SpaceG plan argues against, and the ones it frees. */
export function spacegVerdict(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
  options: SpaceGOptions = {},
): { against: Set<Action>; rescued: Set<Action> } {
  const { invade = true, rage = true, cover = true, zone = true } = options;
  const against = new Set<Action>();
  const rescued = new Set<Action>();
  if (!isSpaceGDeck(own)) return { against, rescued };
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  if (!player || !opponent || state.turnPlayer !== me || state.pendingChoice)
    return { against, rescued };
  const top = cardData(state, player.invadingMonsterZone.at(-1));
  const number = top?.deckCardNumber;
  const rank = top?.rank ?? 0;
  const of = (t: Action["type"]) => actions.filter((a) => a.type === t);
  const passes = of("pass");
  const invades = of("invade");
  const rages = of("gainRage");
  const handNumber = (a: Action) =>
    "cardInstanceId" in a
      ? cardData(
          state,
          player.hand.find((h) => h.instanceId === a.cardInstanceId),
        )?.deckCardNumber
      : undefined;
  const crystals = Object.values(player.zones).reduce(
    (n, stacks) =>
      n +
      stacks.filter(
        (stack) => cardData(state, stack.at(-1))?.deckCardNumber === CRYSTALS,
      ).length,
    0,
  );
  const spaceg = SPACEG_MONSTERS.has(number ?? "");

  // Rule 1: invade every turn at ranks 1, 2 and 4.
  if (invade && spaceg && (rank <= 2 || rank === 4) && invades.length > 0) {
    for (const a of invades) mark(rescued, a, "SpaceG plan 1", "freed");
    for (const a of passes) mark(against, a, "SpaceG plan 1", "against");
  }

  // Rule 4: end the turn in zone 7, unless SpaceG survives their next counter in zone 8.
  if (zone && spaceg && invades.length > 0) {
    const endZone = (a: Action) => {
      const s = playOut(state, a, me);
      const at = s?.players.find((p) => p.id === me)?.monsterPosition;
      return at === undefined || at === null ? null : at + 1;
    };
    const ends = invades.map((a) => ({ a, end: endZone(a) }));
    const short = ends.filter((x) => x.end !== null && x.end <= END_ZONE);
    const over = ends.filter((x) => x.end !== null && x.end > END_ZONE);
    if (short.length > 0 && over.length > 0) {
      const empty = Object.values(opponent.zones).filter(
        (stacks) => stacks.length === 0,
      ).length;
      const best = opponent.hand
        .map((c) => cardData(state, c))
        .filter((c) => c?.type === "Battle" && (c.rank ?? 0) <= ZONE_8_RANK)
        .map((c) => c?.counterOrThreat ?? 0)
        .sort((x, y) => y - x)
        .slice(0, empty)
        .reduce((n, v) => n + v, 0);
      const survives =
        counterPowerOf(state, opponent) + best < getThreat(state, me);
      if (!survives)
        for (const x of over) mark(against, x.a, "SpaceG plan 4", "against");
    }
  }

  // Rule 3: the rank 3 covered by a rank 3, after this turn's invasion.
  if (cover && number === SPACEG_THREE) {
    const covers = of("playMonster").filter(
      (a) => handNumber(a) === SPACEG_THREE,
    );
    if (covers.length > 0) {
      for (const a of passes) mark(against, a, "SpaceG plan 3", "against");
      if (invades.length > 0) {
        for (const a of covers) mark(against, a, "SpaceG plan 3", "against");
        for (const a of invades) mark(rescued, a, "SpaceG plan 3", "freed");
      } else for (const a of covers) mark(rescued, a, "SpaceG plan 3", "freed");
    }
  }

  // Rule 2: rage at rank 3 (with Crystals and a target) and with the rank 4 Flying Form.
  if (rage && rages.length > 0) {
    const targets = Object.values(opponent.zones).some((stacks) =>
      stacks.some((stack) => {
        const c = cardData(state, stack.at(-1));
        return c?.type === "Battle" && (c.rank ?? 0) <= DESTROY_RANK;
      }),
    );
    const destroys = number === SPACEG_THREE && crystals > 0 && targets;
    if (destroys || number === SPACEG_FOUR) {
      for (const a of rages) mark(rescued, a, "SpaceG plan 2", "freed");
      for (const a of passes) mark(against, a, "SpaceG plan 2", "against");
    }
  }

  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  return { against, rescued };
}

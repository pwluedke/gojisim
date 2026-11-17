import type { Action, GameState, PlayerId } from "@gojisim/engine";
import { cardData } from "./mxPlan";
import type { GroupOptions } from "./switches/settings";
import type { Decklist } from "./types";

/**
 * Paul's SpaceG plan (#408, Discord #space-godzilla), with his addendum. A preference like the
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
 * (Paul's positioning, zone 7 or advance to 8 by whether SpaceG survives the counter, waits on
 * Monarch's answer.)
 */

/** SpaceG's monster deck. */
export const SPACEG_ONE = "EBP02-052";
export const SPACEG_TWO = "EBP02-053";
export const SPACEG_THREE = "EBP02-054";
export const SPACEG_FOUR = "EBP02-057";
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
/** Rule 2: the rank of their battle cards the rank 3's rage destroys. */
const DESTROY_RANK = 5;

/** A SpaceG list: the SpaceGodzilla monster deck's rank 1 and 3. */
export function isSpaceGDeck(deck: Decklist | undefined): boolean {
  if (!deck) return false;
  const monsters = new Set(deck.monsterDeck.map((c) => c.deckCardNumber));
  return monsters.has(SPACEG_ONE) && monsters.has(SPACEG_THREE);
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
  const { invade = true, rage = true, cover = true } = options;
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
    for (const a of invades) rescued.add(a);
    for (const a of passes) against.add(a);
  }

  // Rule 3: the rank 3 covered by a rank 3, after this turn's invasion.
  if (cover && number === SPACEG_THREE) {
    const covers = of("playMonster").filter(
      (a) => handNumber(a) === SPACEG_THREE,
    );
    if (covers.length > 0) {
      for (const a of passes) against.add(a);
      if (invades.length > 0) {
        for (const a of covers) against.add(a);
        for (const a of invades) rescued.add(a);
      } else for (const a of covers) rescued.add(a);
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
      for (const a of rages) rescued.add(a);
      for (const a of passes) against.add(a);
    }
  }

  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  return { against, rescued };
}

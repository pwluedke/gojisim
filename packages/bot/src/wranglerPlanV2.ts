import {
  type Action,
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  type PlayerId,
  sameColumn,
  type ZoneNumber,
} from "@gojisim/engine";
import { counterPlays, winsNow } from "./cardRules";
import { counters } from "./rules";
import type { Decklist } from "./types";
import {
  DESPAIR,
  GAM,
  GODZILLA_2004,
  isWranglerDeck,
  wranglerVerdict,
} from "./wranglerPlan";

/**
 * The Wrangler plan v2 (Paul, Nov 13: the Wrangler as a red rage counter deck; the rules doc
 * `claude/wrangler-bot-rules.md` v2, via Monarch), for a "Red Counter (Wrangler)" deck. Like v1 a
 * preference (the search favors the moves it doesn't argue against), each line only when the
 * bot's own list has its cards; with the card rules (Medium and Hard). `wranglerPlan=2` (the
 * default); `wranglerPlan=1` is v1.
 *
 * Plan A is the counter loop: push the opponent forward into your Kings and Godzilla Against
 * Mechagodzilla, make them trample their own battle cards, counter them back, repeat.
 * - Line 1 (v1's): Despair on a Mecha-King blocker, and the Despair/GAM invasion guard.
 * - Don't race: invade only when it wins this turn.
 * - Push (Godzilla Landing EBP01-030, The Slithering Disaster EBP04-078, Godzilla (2004)
 *   EBP01-008's [enter]) only when, after it, the counter is made or can be made this turn, or a
 *   rank 7-8 battle card can be played (v2.1, #317: two Landings to zone 8 with nothing after);
 *   never pay an invasion with a push card.
 * - Churn from turn 1: rage discards over passing (toward 8 monster cards in the discard pile for
 *   GAM), freed from the holds (card rule 14 included), but for the held key cards.
 * - Dig (v2.2, #318): with no battle card in hand, Despair (even for no value) and the rage
 *   discards of cards it needn't hold over passing, so the end phase draws more cards.
 * - Kings (Godzilla, King of the Monsters EBP01-075) and GAM in zones 1, 2 or 8 (1 or 5 against
 *   Godzilla (1994)), never in your own monster's next two zones; with a King in zones 1-5, rage
 *   to 3 (it can't be destroyed by the opponent's effects then), before passing, with the held
 *   cards if need be (v2.1, #316).
 * - Godzilla (1954) EBP01-004 isn't stacked with your Kings on the board (its zone 8 wipe takes
 *   them too).
 * - Godzilla (Fest Godzilla) EBP01-015 for the counter with a King out.
 */

export const KING = "EBP01-075";
export const LANDING = "EBP01-030";
export const SLITHERING = "EBP04-078";
export const GODZILLA_1954_WIPE = "EBP01-004";
export const FEST_COUNTER = "EBP01-015";
/** Held from rage: Godzilla (2004) (a push) and Godzilla (1954) EBP01-004 (until Kings are out). */
const HELD = new Set([GODZILLA_2004, GODZILLA_1954_WIPE]);
/** Zones for Kings and GAM, and against Godzilla (1994). */
const KING_ZONES = new Set([1, 2, 8]);
const KING_ZONES_VS_1994 = new Set([1, 5]);
/** Your monster's path: its next zones (it crushes your own battle cards there, 11.3). */
const PATH = 2;
/** v2.2 (Ian, point 2): the monster card whose invasion fetches more (Godzilla (2023) ESD01-002). */
const FETCH_MONSTER = "ESD01-002";
/** #321: the cards kept when discarding down, while a spare monster card can go instead. */
const KEY_CARDS = new Set([
  LANDING,
  SLITHERING,
  KING,
  GAM,
  DESPAIR,
  FEST_COUNTER,
]);
/** #317: a push needs a follow-up this turn, the counter or a battle card of this rank or more. */
const FOLLOW_UP_RANK = 7;
/** A King in zones 1-5 can't be destroyed by the opponent's effects from this much rage. */
const KING_RAGE = 3;

type Card = GameState["cards"][number];

/** The opponent's battle cards in their zones (v2's push check). */
const battleCards = (state: GameState, who: PlayerId) =>
  Object.values(state.players.find((p) => p.id === who)?.zones ?? {}).reduce(
    (n, stacks) =>
      n +
      stacks.filter((stack) => {
        const t = stack[stack.length - 1];
        return t !== undefined && state.cards[t.cardId]?.type === "Battle";
      }).length,
    0,
  );

/** `action` played out, the bot's own choices answered first-option, or `null`. */
function after(
  state: GameState,
  action: Action,
  me: PlayerId,
): GameState | null {
  try {
    let s = advanceToDecision(applyAction(state, action));
    for (let i = 0; i < 20 && s.pendingChoice?.player === me; i++) {
      const first = getLegalActions(s, me).find((a) => a.type !== "concede");
      if (!first) break;
      s = advanceToDecision(applyAction(s, first));
    }
    return s;
  } catch {
    return null;
  }
}

/** The moves the v2 plan argues against, and the ones it frees from the holds. */
export function wranglerV2Verdict(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
  /** The opponent's decklist (public), when known. */
  theirs?: Decklist,
  /** v2.1's changes (#316, #317, #319, #321); `false` is v2, for the paired check. */
  v21 = true,
  /** v2.2's changes (#318); `false` is v2.1, for the paired check. */
  v22 = true,
  /** v2.3's changes (Ian's guide review, Nov 15); `false` is v2.2. */
  v23 = true,
): { against: Set<Action>; rescued: Set<Action> } {
  if (!isWranglerDeck(own)) return { against: new Set(), rescued: new Set() };
  // Line 1 (v1's Despair line) goes first.
  const line1 = wranglerVerdict(state, actions, me, own, theirs, true, v21);
  if (line1.line1) return { against: line1.against, rescued: line1.rescued };
  const against = new Set(line1.against);
  const rescued = new Set(line1.rescued);
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  // v2.1 (#321): discarding down (5.7.2), a monster card goes before a key card (a monster card
  // in the discard pile counts toward Godzilla Against Mechagodzilla's 8, too).
  const choice = state.pendingChoice;
  // v2.2 (Ian, point 10): Godzilla Against Mechagodzilla's rage reset (its optional cost when your
  // monster invades) is saved unless it's what makes the counter reachable this turn.
  if (
    v22 &&
    choice?.player === me &&
    choice.kind === "confirm" &&
    state.resolution &&
    state.cards[state.resolution.standby.sourceCardId]?.deckCardNumber === GAM
  ) {
    const yes = actions.find(
      (a) => a.type === "choose" && a.optionId === "yes",
    );
    const no = actions.find((a) => a.type === "choose" && a.optionId === "no");
    if (yes && no) {
      const reaches = (s: GameState | null) =>
        !!s &&
        (counters(s, me) ||
          (s.turnPlayer === me &&
            counterPlays(s, getLegalActions(s, me), me).size > 0));
      if (!(reaches(after(state, yes, me)) && !reaches(after(state, no, me))))
        against.add(yes);
    }
    return { against, rescued };
  }
  // v2.2 (Ian's notes, point 7): at Despair's target pick (line 1 not deciding it), the battle
  // cards in your monster's column first, then their cards in zones 1 and 2.
  if (
    v22 &&
    choice?.player === me &&
    choice.kind === "target" &&
    player &&
    opponent &&
    state.resolution &&
    state.cards[state.resolution.standby.sourceCardId]?.deckCardNumber ===
      DESPAIR
  ) {
    const at = player.monsterPosition ?? 0;
    const zoneOf = (instanceId: string) => {
      const z = Object.entries(opponent.zones).find(([, stacks]) =>
        stacks.some((stack) => stack.at(-1)?.instanceId === instanceId),
      )?.[0];
      return z === undefined ? undefined : (Number(z) as ZoneNumber);
    };
    const picks = actions.filter(
      (a): a is Extract<Action, { type: "choose" }> => a.type === "choose",
    );
    // Line 1 already picked (a Mecha-King): it stands.
    if (picks.some((a) => against.has(a))) return { against, rescued };
    const aligned = picks.filter((a) => {
      const z = zoneOf(a.optionId);
      return (
        z !== undefined &&
        at > 0 &&
        sameColumn(
          { player: opponent.id, zone: z },
          { player: me, zone: at as ZoneNumber },
        )
      );
    });
    const front = picks.filter((a) => {
      const z = zoneOf(a.optionId);
      return z === 1 || z === 2;
    });
    const best = aligned.length > 0 ? aligned : front;
    if (best.length > 0)
      for (const a of picks) if (!best.includes(a)) against.add(a);
    return { against, rescued };
  }
  if (v21 && choice?.player === me && choice.rule === "5.7.2") {
    const cardOf = (optionId: string) => {
      const id = choice.options.find((o) => o.id === optionId)?.cardId;
      return id === null || id === undefined ? undefined : state.cards[id];
    };
    const picks = actions.filter(
      (a): a is Extract<Action, { type: "choose" }> => a.type === "choose",
    );
    const spare = picks.filter((a) => {
      const c = cardOf(a.optionId);
      return c?.type === "Monster" && !KEY_CARDS.has(c.deckCardNumber);
    });
    if (spare.length > 0)
      for (const a of picks) {
        const n = cardOf(a.optionId)?.deckCardNumber;
        if (n !== undefined && KEY_CARDS.has(n)) against.add(a);
      }
    return { against, rescued };
  }
  if (!player || !opponent || state.turnPlayer !== me || state.pendingChoice)
    return { against, rescued };
  const card = (id: string): Card | undefined => {
    const c = player.hand.find((h) => h.instanceId === id);
    return c ? state.cards[c.cardId] : undefined;
  };
  const number = (a: Action) =>
    "cardInstanceId" in a ? card(a.cardInstanceId)?.deckCardNumber : undefined;
  const at = player.monsterPosition ?? 0;
  const kingIn = (zones: number[]) =>
    zones.some((z) =>
      player.zones[z as 1].some((stack) => {
        const t = stack[stack.length - 1];
        return (
          t !== undefined && state.cards[t.cardId]?.deckCardNumber === KING
        );
      }),
    );
  const kingsOut = kingIn([1, 2, 3, 4, 5, 6, 7, 8]);

  // Don't race: an invasion only when it wins this turn; never paid with a push card.
  for (const a of actions)
    if (a.type === "invade" && !winsNow(state, a, me)) against.add(a);
  // v2.2 (Ian, point 2): with Godzilla (2023) ESD01-002 on top, an invasion for its fetch (a rank
  // III burst Godzilla (2023) per zone it invades) when the bot needs the monster cards: to reach
  // 3 rage with a King in zones 1-5 that its free rage discards can't, or to make a counter it
  // can't make otherwise. Invade 2 only for that; invade 1 paying with a strategy it doesn't need
  // (Despair, The Slithering Disaster). "Motion in the Wrangler is strictly necessary or not."
  const top = player.invadingMonsterZone.at(-1);
  if (v22 && top && state.cards[top.cardId]?.deckCardNumber === FETCH_MONSTER) {
    const free = actions.filter(
      (a) => a.type === "gainRage" && !HELD.has(number(a) ?? ""),
    ).length;
    const short =
      kingIn([1, 2, 3, 4, 5]) &&
      player.rage < KING_RAGE &&
      player.rage + free < KING_RAGE;
    const counterNow =
      counters(state, me) || counterPlays(state, actions, me).size > 0;
    for (const a of actions) {
      if (a.type !== "invade" || !against.has(a)) continue;
      const pay = card(a.cardInstanceId);
      const icon = pay?.invadeZones ?? 1;
      const s = after(state, a, me);
      const counterAfter =
        !counterNow &&
        !!s &&
        (counters(s, me) ||
          (s.turnPlayer === me &&
            counterPlays(s, getLegalActions(s, me), me).size > 0));
      const need = short || counterAfter;
      const spare =
        pay?.deckCardNumber === DESPAIR || pay?.deckCardNumber === SLITHERING;
      if (need && (icon >= 2 || spare)) against.delete(a);
    }
  }

  // Push only when a follow-up comes this turn (#317): after it, the counter is made or can be
  // made, or a rank 7-8 battle card can be played.
  // v2.3 (Ian): only the counter is a follow-up, not a rank 7-8 battle card play.
  const followUp = (s: GameState) => {
    if (counters(s, me)) return true;
    if (s.turnPlayer !== me) return false;
    const legal = getLegalActions(s, me);
    if (counterPlays(s, legal, me).size > 0) return true;
    if (v23) return false;
    const hand = s.players.find((p) => p.id === me)?.hand ?? [];
    return legal.some((a) => {
      if (a.type !== "playBattle") return false;
      const c = hand.find((h) => h.instanceId === a.cardInstanceId);
      return (c ? (s.cards[c.cardId]?.rank ?? 0) : 0) >= FOLLOW_UP_RANK;
    });
  };
  const theirCards = battleCards(state, opponent.id);
  for (const a of actions) {
    const n = number(a);
    const push =
      (a.type === "activateStrategy" && (n === LANDING || n === SLITHERING)) ||
      (a.type === "playMonster" && n === GODZILLA_2004);
    if (!push) continue;
    const s = after(state, a, me);
    if (!s) continue;
    // v2 (the paired check's control): the counter made after it, or they trampled a card.
    const ok = v21
      ? followUp(s)
      : counters(s, me) || battleCards(s, opponent.id) < theirCards;
    if (!ok) against.add(a);
  }

  // Godzilla (1954) EBP01-004 isn't stacked with your Kings on the board.
  if (kingsOut)
    for (const a of actions)
      if (a.type === "playMonster" && number(a) === GODZILLA_1954_WIPE)
        against.add(a);

  // Kings and GAM in zones 1, 2 or 8 (1 or 5 against Godzilla (1994)), off your monster's path.
  const vs1994 =
    theirs?.monsterDeck.some((c) => c.name === "Godzilla (1994)") ??
    opponent.invadingMonsterZone.some(
      (c) => state.cards[c.cardId]?.name === "Godzilla (1994)",
    );
  const zones = vs1994 ? KING_ZONES_VS_1994 : KING_ZONES;
  const offPath = (z: number) => !(z > at && z <= at + PATH);
  for (const n of [KING, GAM]) {
    const plays = actions.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" && number(a) === n,
    );
    const good = plays.filter((a) => zones.has(a.zone) && offPath(a.zone));
    if (good.length > 0)
      for (const a of plays) if (!good.includes(a)) against.add(a);
  }

  // Churn from turn 1: rage discards over passing, freed from the holds; the held cards stay
  // (Godzilla (1954) EBP01-004 may go once your Kings are out). With a King in zones 1-5 and under
  // 3 rage, rage first.
  // v2.3 (Ian): every monster card is pitched for rage, from turn 1, but Godzilla (2004).
  const held = (n: string | undefined) =>
    n !== undefined &&
    (v23
      ? n === GODZILLA_2004
      : HELD.has(n) && !(n === GODZILLA_1954_WIPE && kingsOut));
  const churn = actions.filter(
    (a) => a.type === "gainRage" && !held(number(a)),
  );
  if (churn.length > 0) {
    for (const a of churn) rescued.add(a);
    for (const a of actions)
      if (a.type === "pass" || (a.type === "gainRage" && !churn.includes(a)))
        against.add(a);
    if (kingIn([1, 2, 3, 4, 5]) && player.rage < KING_RAGE)
      for (const a of actions)
        if (a.type !== "gainRage" && a.type !== "concede") against.add(a);
  }
  // v2.1 (#316): with a King in zones 1-5 under 3 rage, no passing while any rage discard can
  // still be made, the held cards' too: the King's protection comes first. (Godzilla (1954)
  // EBP01-001's counter-phase rage needs a monster card off the top, so it isn't counted on.)
  if (v21 && kingIn([1, 2, 3, 4, 5]) && player.rage < KING_RAGE) {
    const rage = actions.filter((a) => a.type === "gainRage");
    if (rage.length > 0) {
      for (const a of rage) {
        rescued.add(a);
        against.delete(a);
      }
      for (const a of actions) if (a.type === "pass") against.add(a);
    }
  }
  // v2.2 (#318, Ian): with no battle card in hand (no answer to the next invasion), dig: the end
  // phase draws up to the hand size (7.5.4), so each card out of the hand this turn is one more
  // card drawn. Rage discards of the cards it needn't hold and Despair, even for no value, over
  // passing (Monarch: "play or rage away cards it doesn't need to hold").
  const battlesInHand = player.hand.filter(
    (c) => state.cards[c.cardId]?.type === "Battle",
  ).length;
  // v2.3 (Ian): against Monster X, whose first two ranks take 2 battle cards to counter, dig until
  // the hand holds 2.
  const vsMonsterX =
    theirs?.monsterDeck.some((c) => c.name.startsWith("Monster X")) ??
    opponent.invadingMonsterZone.some((c) =>
      state.cards[c.cardId]?.name.startsWith("Monster X"),
    );
  const noAnswer =
    battlesInHand === 0 || (v23 && vsMonsterX && battlesInHand < 2);
  if (v22 && noAnswer) {
    const out = actions.filter(
      (a) =>
        (a.type === "gainRage" && !held(number(a))) ||
        (a.type === "activateStrategy" && number(a) === DESPAIR),
    );
    if (out.length > 0) {
      for (const a of out) {
        rescued.add(a);
        against.delete(a);
      }
      for (const a of actions) if (a.type === "pass") against.add(a);
    }
  }

  // Godzilla (Fest Godzilla) EBP01-015 for the counter with a King out.
  if (kingsOut) {
    const needed = counterPlays(state, actions, me);
    if (
      actions.some(
        (a) =>
          a.type === "playBattle" &&
          number(a) === FEST_COUNTER &&
          needed.has(a),
      )
    )
      for (const a of actions) if (a.type === "pass") against.add(a);
  }

  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  return { against, rescued };
}

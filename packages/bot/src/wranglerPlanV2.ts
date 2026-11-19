import { mark } from "./trace";
import {
  type Action,
  advanceToDecision,
  applyAction,
  counterPowerOf,
  type GameState,
  getLegalActions,
  isAdjacent,
  type PlayerId,
  sameColumn,
  type ZoneNumber,
} from "@gojisim/engine";
import { counterPlays, winsNow } from "./cardRules";
import type { GroupOptions } from "./switches/settings";
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
 * The Wrangler plan v2 (Paul, Nov 13: the Wrangler as a red rage counter deck; the Wrangler play
 * guide, `claude/wrangler-play-guide.md` v2, via Monarch), for a "Red Counter (Wrangler)" deck. Like v1 a
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
 * - Push line (#381, Ian, `wranglerPushLine`): an invasion is also how the monster reaches a push
 *   strategy's zone (8.3.1). An invasion (not paid with a push card) after which a push strategy
 *   and then battle card plays make the counter this turn is taken over raging or passing; the
 *   push's follow-up counts a counter made by up to 3 battle card plays, not only one.
 * - Reset line (#388, Ian, `wranglerResetLine`): protection goes before the destroys. With GAM up
 *   and the opponent's rage above 0, an invasion whose reset (their rage to 0, a King's protection
 *   gone), then a rage gain (Godzilla (2023) EBP01-010's column destroy) and up to 3 battle card
 *   plays make the counter this turn is taken over raging or passing, ahead of v2.1's rage to 3.
 *   #417 (Ian): when the reset alone makes the counter (the invasion settles with their rage 0
 *   and the counter made), that invasion is taken over every other move.
 * - Keep the rank I (#428, Ian, `wranglerKeepRankOne`): with a King to protect and the rage short
 *   of 3, no burst over the rank I Godzilla (1954) EBP01-001 (its counter-phase mill is a rage).
 * - Tag out against a reset (#384, Ian, `wranglerTagOut`): with the opponent's GAM up and unused,
 *   a tag-out to Godzilla (2001) EBP03-004 (rage the opponent can't reduce from zone 4) goes
 *   before raging or passing.
 * - Despair's rage (#442, Ian, `wranglerFetchDespair`): no Despair below 2 rage (it does nothing);
 *   with Godzilla (2023) ESD01-002 on top, an invasion whose fetches bring the rage to 2, with a
 *   target for Despair after it, comes first.
 * - Fetch for rage (#425, Ian, `wranglerFetchRage`): v2.2's fetch invasion (Godzilla (2023)
 *   ESD01-002 on top) counts a King to be played this turn, not only one in zones 1-5; with such an
 *   invasion, tagging out (it loses the fetch) and passing wait.
 * - Spare cost (#418, Ian, `wranglerSpareCost`): early (your monster at rank I or II), an invasion
 *   paid with a spare strategy (The Slithering Disaster, a Despair beyond the one kept; never
 *   Godzilla Landing) is freed from "don't race".
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
/** wranglerBio: the rank IV whose rage clears the opponent's column (Godzilla (2023) EBP01-010). */
const COLUMN_CLEAR = "EBP01-010";
/** #384: Godzilla (2001), whose rage the opponent's effects can't reduce from zone 4 (awakening-4). */
const RAGE_LOCK = "EBP03-004";
/** #428: the rank I Godzilla (1954), whose counter-phase mill adds a rage on a monster card. */
const RANK_ONE_MILL = "EBP01-001";
/** #384: the zone its awakening needs. */
const RAGE_LOCK_ZONE = 4;
/** `wranglerBioHard` (Paul, Nov 15): a counter over this beats Biollante's rank III anyway. */
const BIO_III_COUNTER = 40000;
/** v2.2 (Ian, point 2): the monster card whose invasion fetches more (Godzilla (2023) ESD01-002). */
const FETCH_MONSTER = "ESD01-002";
/** #418: the highest rank of your monster while a spare strategy pays an invasion. */
const SPARE_COST_RANK = 2;
/** #434: a Tangler deck's signature (card rule 29): Godzilla (2002) and Entangling Fear. */
const TANGLER_MONSTERS = new Set([
  "EBP03-014",
  "EBP03-015",
  "EPR-020",
  "EBP03-017",
]);
const ENTANGLING_FEAR_CARD = "EBP04-081";
/** #442: the rage Despair EBP02-018 needs. */
const DESPAIR_RAGE = 2;
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

/** #381: battle card plays a line may make for its counter (two GAMs on Ian's turn 7). */
const LINE_PLAYS = 3;
/** #381: the most plays-and-choices the counter search looks at, per line. */
const LINE_NODES = 120;

/** #388: the most plays-and-choices the reset line looks at, per decision. */
const RESET_NODES = 400;

/** #381: the counter is made, or up to LINE_PLAYS battle card plays make it this turn. */
function counterWithin(s: GameState, me: PlayerId): boolean {
  if (counters(s, me)) return true;
  if (s.turnPlayer !== me || s.pendingChoice) return false;
  let nodes = LINE_NODES;
  const search = (t: GameState, left: number): boolean => {
    if (nodes-- <= 0) return false;
    if (counters(t, me)) return true;
    if (left === 0 || t.turnPlayer !== me || t.pendingChoice) return false;
    const hand = t.players.find((p) => p.id === me)?.hand ?? [];
    const seen = new Set<string>();
    for (const a of getLegalActions(t, me)) {
      if (a.type !== "playBattle") continue;
      const c = hand.find((h) => h.instanceId === a.cardInstanceId);
      const key = `${c ? t.cards[c.cardId]?.deckCardNumber : ""}@${a.zone}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const u = after(t, a, me);
      if (u && search(u, left - 1)) return true;
    }
    return false;
  };
  return search(s, LINE_PLAYS);
}

/** A player's rage. */
const rageOf = (s: GameState, who: PlayerId) =>
  s.players.find((p) => p.id === who)?.rage ?? 0;

/**
 * #388: every way through my own pending choices from `s`, within `budget`'s plays. #417: options
 * naming copies of one card (GAM's pick of a monster card from the discard pile, two GAMs'
 * order) are tried once, so two GAMs' prompts fit the budget.
 */
function settled(
  s: GameState,
  me: PlayerId,
  budget: { n: number },
): GameState[] {
  const choice = s.pendingChoice;
  if (choice?.player !== me) return [s];
  const out: GameState[] = [];
  const seen = new Set<string>();
  for (const c of getLegalActions(s, me)) {
    if (c.type === "concede") continue;
    if (c.type === "choose") {
      const cardId = choice.options.find((o) => o.id === c.optionId)?.cardId;
      const key =
        cardId === null || cardId === undefined
          ? c.optionId
          : `card:${s.cards[cardId]?.deckCardNumber ?? cardId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    if (budget.n-- <= 0) continue;
    try {
      out.push(...settled(advanceToDecision(applyAction(s, c)), me, budget));
    } catch {
      /* an option the engine refuses: skip it */
    }
  }
  return out;
}

/**
 * #388: after GAM's reset, a rage gain (Godzilla (2023) EBP01-010's column destroy, now that a
 * King's protection is gone), its choices, then the counter by up to LINE_PLAYS battle card plays.
 */
function rageThenCounter(
  s: GameState,
  me: PlayerId,
  budget: { n: number },
): boolean {
  if (counters(s, me)) return true;
  if (s.turnPlayer !== me || s.pendingChoice) return false;
  const hand = s.players.find((p) => p.id === me)?.hand ?? [];
  const seen = new Set<string>();
  for (const g of getLegalActions(s, me)) {
    if (g.type !== "gainRage" || budget.n <= 0) continue;
    const c = hand.find((h) => h.instanceId === g.cardInstanceId);
    const key = c ? (s.cards[c.cardId]?.deckCardNumber ?? "") : "";
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const next = advanceToDecision(applyAction(s, g));
      if (settled(next, me, budget).some((t) => counterWithin(t, me)))
        return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

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

/**
 * The moves the v2 plan argues against, the ones it frees from the holds, and (`wranglerBioHard`)
 * the ones it prunes outright.
 */
/** The Wrangler plan v2's switches (#402): one key per `wrangler` switch file, each on by default. */
export type WranglerOptions = GroupOptions<"wrangler">;

export function wranglerV2Verdict(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
  /** The opponent's decklist (public), when known. */
  theirs?: Decklist,
  /** The plan's switches (#402: `groupOptions(settings, "wrangler")`); each defaults to on. */
  options: WranglerOptions = {},
): { against: Set<Action>; rescued: Set<Action>; pruned?: Set<Action> } {
  const {
    v21 = true,
    v22 = true,
    v23 = true,
    bio = true,
    bioHard = true,
    pushLine = true,
    resetLine = true,
    tagOut = true,
    keepRankOne = true,
    fetchRage = true,
    spareCost = true,
    fetchDespair = true,
  } = options;
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
      const makes =
        reaches(after(state, yes, me)) && !reaches(after(state, no, me));
      if (!makes) mark(against, yes, "Wrangler plan v2.2", "against");
      // #417: the reset that alone makes the counter this turn is taken (the search answered no
      // to it otherwise).
      else if (resetLine) {
        mark(against, no, "Wrangler plan v2.2", "against");
        return { against, rescued, pruned: new Set([no]) };
      }
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
      for (const a of picks)
        if (!best.includes(a))
          mark(against, a, "Wrangler plan Line 1", "against");
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
        if (n !== undefined && KEY_CARDS.has(n))
          mark(against, a, "Wrangler plan Line 1", "against");
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
  // wranglerBio (Ian): against a Biollante deck; Meganula EBP01-045 can take 1 rage, so the
  // King's 3 rage needs a buffer of 1.
  const vsBio =
    bio &&
    (theirs?.monsterDeck.some((c) => c.name.startsWith("Biollante")) ??
      opponent.invadingMonsterZone.some((c) =>
        state.cards[c.cardId]?.name.startsWith("Biollante"),
      ));
  const kingRage = vsBio ? KING_RAGE + 1 : KING_RAGE;

  // Don't race: an invasion only when it wins this turn; never paid with a push card.
  for (const a of actions)
    if (a.type === "invade" && !winsNow(state, a, me))
      mark(against, a, "Wrangler plan Line 1", "against");
  const top0 = player.invadingMonsterZone.at(-1);
  // #418 (Ian): early (your monster at rank I or II), a dead strategy clogs the hand: an
  // invasion paid with a spare one is freed from "don't race" (monster cards still go for rage).
  // Spares: The Slithering Disaster, and a Despair beyond the one the plan keeps. Never Godzilla
  // Landing (card rule 31). Not against Tangler (#434's check).
  const topRank = (top0 && state.cards[top0.cardId]?.rank) ?? 0;
  // #434's check: against Tangler, whose monster sits low behind Entangling Fear, The Slithering
  // Disaster (their monster from zones 3-5 into 6-8) and Despair are the answer, not spares.
  const vsTangler = theirs
    ? theirs.monsterDeck.some((c) => TANGLER_MONSTERS.has(c.deckCardNumber)) &&
      theirs.mainDeck.some((c) => c.deckCardNumber === ENTANGLING_FEAR_CARD)
    : opponent.invadingMonsterZone.some((c) =>
        TANGLER_MONSTERS.has(state.cards[c.cardId]?.deckCardNumber ?? ""),
      );
  if (spareCost && topRank <= SPARE_COST_RANK && !vsTangler) {
    const despairs = player.hand.filter(
      (c) => state.cards[c.cardId]?.deckCardNumber === DESPAIR,
    ).length;
    for (const a of actions) {
      if (a.type !== "invade" || winsNow(state, a, me)) continue;
      const n = card(a.cardInstanceId)?.deckCardNumber;
      if (n === SLITHERING || (n === DESPAIR && despairs >= 2)) {
        against.delete(a);
        mark(rescued, a, "Wrangler plan Line 1", "freed");
      }
    }
  }

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
    // #425 (Ian): a King to be played this turn counts too, not only one already in zones 1-5.
    const kingPlay =
      fetchRage &&
      actions.some((a) => a.type === "playBattle" && number(a) === KING);
    const short =
      (kingIn([1, 2, 3, 4, 5]) || kingPlay) &&
      player.rage < kingRage &&
      player.rage + free < kingRage;
    let fetching = false;
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
      // #425: for a King still in hand (v2.2's King in zones 1-5 keeps its "closer" rule), the
      // line must reach the rage: the rage now and a discard for each monster card in hand after
      // the invasion (its fetches in).
      const reaches =
        !fetchRage ||
        !short ||
        counterAfter ||
        kingIn([1, 2, 3, 4, 5]) ||
        (!!s &&
          player.rage +
            (s.players.find((p) => p.id === me)?.hand ?? []).filter(
              (c) => s.cards[c.cardId]?.type === "Monster",
            ).length >=
            kingRage);
      if (need && (icon >= 2 || spare) && reaches) {
        against.delete(a);
        fetching = true;
      }
    }
    // #425: with a fetch invasion the bot needs, tagging out (its fetch goes with Godzilla (2023)
    // ESD01-002) and passing wait.
    if (fetchRage && fetching)
      for (const a of actions)
        if (a.type === "playMonster" || a.type === "pass")
          mark(against, a, "Wrangler plan v2.2", "against");
  }

  // #442 (Ian): Despair needs 2 rage ("If your monster card has 2 or more rage"). With Godzilla
  // (2023) ESD01-002 on top and the rage under 2, an invasion whose fetches (the monster cards in
  // hand after it) bring the rage to 2, with one of their battle cards at or before your zone for
  // it, comes first: Despair now (it would do nothing), tagging out (the fetch goes) and passing
  // wait. (Without that line v2.2's dig may still play Despair for no value.)
  if (fetchDespair && player.rage < DESPAIR_RAGE) {
    const despairs = actions.filter(
      (a) => a.type === "activateStrategy" && number(a) === DESPAIR,
    );
    if (
      despairs.length > 0 &&
      top &&
      state.cards[top.cardId]?.deckCardNumber === FETCH_MONSTER
    ) {
      let opens = false;
      for (const a of actions) {
        if (a.type !== "invade" || winsNow(state, a, me)) continue;
        if (number(a) === DESPAIR) continue;
        const s = after(state, a, me);
        const mine = s?.players.find((p) => p.id === me);
        const theirs = s?.players.find((p) => p.id !== me);
        if (!s || !mine || !theirs || s.turnPlayer !== me) continue;
        const monsters = mine.hand.filter(
          (c) => s.cards[c.cardId]?.type === "Monster",
        ).length;
        const at = mine.monsterPosition ?? 0;
        const target = ([1, 2, 3, 4, 5, 6, 7, 8] as const).some(
          (z) =>
            z <= at &&
            theirs.zones[z].some(
              (stack) => s.cards[stack.at(-1)?.cardId ?? -1]?.type === "Battle",
            ),
        );
        if (mine.rage + monsters >= DESPAIR_RAGE && target) {
          against.delete(a);
          mark(rescued, a, "Wrangler plan v2.2", "freed");
          opens = true;
        }
      }
      if (opens)
        for (const a of actions)
          if (
            a.type === "playMonster" ||
            a.type === "pass" ||
            despairs.includes(a)
          )
            mark(against, a, "Wrangler plan v2.2", "against");
    }
  }

  // #381: an invasion that reaches a push strategy's zone, the push, then the counter this turn.
  const reachesCounter = (s: GameState) => counterWithin(s, me);
  const pushLines = new Set<Action>();
  if (
    pushLine &&
    !counters(state, me) &&
    counterPlays(state, actions, me).size === 0
  )
    for (const a of actions) {
      if (a.type !== "invade") continue;
      const pay = number(a);
      if (pay === LANDING || pay === SLITHERING) continue;
      const s = after(state, a, me);
      if (!s || s.turnPlayer !== me) continue;
      const hand = s.players.find((p) => p.id === me)?.hand ?? [];
      const pushes = getLegalActions(s, me).filter((p) => {
        if (p.type !== "activateStrategy") return false;
        const c = hand.find((h) => h.instanceId === p.cardInstanceId);
        const n = c ? s.cards[c.cardId]?.deckCardNumber : undefined;
        return n === LANDING || n === SLITHERING;
      });
      if (
        pushes.some((p) => {
          const t = after(s, p, me);
          return !!t && reachesCounter(t);
        })
      ) {
        pushLines.add(a);
        against.delete(a);
        mark(rescued, a, "Wrangler plan v2.2", "freed");
      }
    }

  // #388 (Ian): the rage reset before the destroys. An invasion that triggers GAM's reset (the
  // opponent's rage to 0, so a King's protection is gone), then a rage gain (Godzilla (2023)
  // EBP01-010's column destroy) and up to LINE_PLAYS battle card plays, makes the counter this
  // turn: it's taken over raging or passing (raging first spends the destroy on a protected King).
  const resetLines = new Set<Action>();
  // #417 (Ian): the reset lines whose invasion makes the counter right away (their rage to 0 is
  // all it takes): the counter now, so every other move waits.
  const resetCounters = new Set<Action>();
  const budget = { n: RESET_NODES };
  const gamUp = Object.values(player?.zones ?? {}).some((stacks) =>
    stacks.some((stack) => {
      const t = stack[stack.length - 1];
      return t !== undefined && state.cards[t.cardId]?.deckCardNumber === GAM;
    }),
  );
  if (
    resetLine &&
    gamUp &&
    rageOf(state, opponent.id) > 0 &&
    !counters(state, me) &&
    counterPlays(state, actions, me).size === 0
  )
    for (const a of actions) {
      if (a.type !== "invade" || budget.n <= 0) continue;
      let lands: GameState[];
      try {
        lands = settled(advanceToDecision(applyAction(state, a)), me, budget);
      } catch {
        continue;
      }
      const reset = lands.filter((t) => rageOf(t, opponent.id) === 0);
      if (reset.some((t) => counters(t, me))) resetCounters.add(a);
      if (
        resetCounters.has(a) ||
        reset.some((t) => rageThenCounter(t, me, budget))
      ) {
        resetLines.add(a);
        against.delete(a);
        mark(rescued, a, "Wrangler plan v2.2", "freed");
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
    // #381: a counter two or three battle card plays make counts too.
    if (pushLine && reachesCounter(s)) return true;
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
    if (!ok) mark(against, a, "Wrangler plan v2.3", "against");
  }

  // Godzilla (1954) EBP01-004 isn't stacked with your Kings on the board.
  if (kingsOut)
    for (const a of actions)
      if (a.type === "playMonster" && number(a) === GODZILLA_1954_WIPE)
        mark(against, a, "Wrangler plan v2.3", "against");

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
      for (const a of plays)
        if (!good.includes(a))
          mark(against, a, "Wrangler plan v2.3", "against");
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
    for (const a of churn) mark(rescued, a, "Wrangler plan v2.3", "freed");
    for (const a of actions)
      if (a.type === "pass" || (a.type === "gainRage" && !churn.includes(a)))
        mark(against, a, "Wrangler plan v2.3", "against");
    if (kingIn([1, 2, 3, 4, 5]) && player.rage < kingRage)
      for (const a of actions)
        if (a.type !== "gainRage" && a.type !== "concede")
          mark(against, a, "Wrangler plan v2.3", "against");
  }
  // v2.1 (#316): with a King in zones 1-5 under 3 rage, no passing while any rage discard can
  // still be made, the held cards' too: the King's protection comes first. (Godzilla (1954)
  // EBP01-001's counter-phase rage needs a monster card off the top, so it isn't counted on.)
  if (v21 && kingIn([1, 2, 3, 4, 5]) && player.rage < kingRage) {
    const rage = actions.filter((a) => a.type === "gainRage");
    if (rage.length > 0) {
      for (const a of rage) {
        mark(rescued, a, "Wrangler plan v2.1", "freed");
        against.delete(a);
      }
      for (const a of actions)
        if (a.type === "pass")
          mark(against, a, "Wrangler plan v2.1", "against");
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
        mark(rescued, a, "Wrangler plan v2.3", "freed");
        against.delete(a);
      }
      for (const a of actions)
        if (a.type === "pass")
          mark(against, a, "Wrangler plan v2.3", "against");
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
      for (const a of actions)
        if (a.type === "pass")
          mark(against, a, "Wrangler plan v2.3", "against");
  }

  // #384 (Ian): against a rage reset on their board (their GAM up with nothing under it: their next
  // invasion sets your rage to 0), rage is only worth something on a monster it can't touch. A
  // tag-out to Godzilla (2001) EBP03-004 (its rage can't be reduced by their effects from zone 4,
  // where the end-phase advance takes it, 7.5.2) goes before raging or passing.
  const theirReset = Object.values(opponent.zones).some((stacks) =>
    stacks.some(
      (stack) =>
        stack.length === 1 &&
        state.cards[stack[0]!.cardId]?.deckCardNumber === GAM,
    ),
  );
  const tagOuts = actions.filter(
    (a) => a.type === "playMonster" && number(a) === RAGE_LOCK,
  );
  if (
    tagOut &&
    theirReset &&
    tagOuts.length > 0 &&
    (player.monsterPosition ?? 0) + 1 >= RAGE_LOCK_ZONE
  ) {
    for (const a of actions)
      if (a.type === "pass" || a.type === "gainRage") {
        mark(against, a, "Wrangler plan v2.3", "against");
        rescued.delete(a);
      }
    for (const a of tagOuts) {
      against.delete(a);
      mark(rescued, a, "Wrangler plan v2.3", "freed");
    }
  }

  // #428 (Ian): the rank I Godzilla (1954) EBP01-001's counter-phase mill is a rage source. With a
  // King to protect (in play or in hand) and the rage short of 3, a burst over it (it covers the
  // rank I through this turn's counter phase) waits, unless it wins now.
  const topNow = player.invadingMonsterZone.at(-1);
  const kingInHand = player.hand.some(
    (c) => state.cards[c.cardId]?.deckCardNumber === KING,
  );
  if (
    keepRankOne &&
    topNow &&
    state.cards[topNow.cardId]?.deckCardNumber === RANK_ONE_MILL &&
    (kingIn([1, 2, 3, 4, 5, 6, 7, 8]) || kingInHand) &&
    player.rage < kingRage
  )
    for (const a of actions)
      if (a.type === "playMonster" && !winsNow(state, a, me))
        mark(against, a, "Wrangler plan v2.3", "against");

  // #381: with a push line on, raging and passing wait (rage first would spend the turn); #388:
  // so with a reset line (rage first would spend the destroy on a protected King).
  if (pushLines.size > 0 || resetLines.size > 0)
    for (const a of actions)
      if (a.type === "pass" || a.type === "gainRage") {
        mark(against, a, "Wrangler plan v2.3", "against");
        rescued.delete(a);
      }
  // #388: the reset line goes ahead of v2.1's rage to 3 for a King in zones 1-5 (its rage gains
  // come right after the invasion, so the King is covered by the end of the turn).
  for (const a of resetLines) against.delete(a);

  // wranglerBio (Ian, Nov 15): the Wrangler play guide's rules against Biollante.
  // wranglerBioHard (Paul, Nov 15): its strategy, Rose Form and zone 5 lines are prunes, not
  // arguments (the search can't override them).
  const pruned = new Set<Action>();
  const hard = (a: Action) => {
    mark(against, a, "Wrangler plan v2.1", "against");
    if (bioHard) pruned.add(a);
  };
  if (vsBio) {
    const theirTop = opponent.invadingMonsterZone.at(-1);
    const theirCard = theirTop ? state.cards[theirTop.cardId] : undefined;
    const theirAt = opponent.monsterPosition ?? 0;
    // Keep Biollante at rank I: no play that makes the counter on its Rose Form.
    if (theirCard?.name === "Biollante Rose Form" && !counters(state, me))
      for (const a of actions) {
        if (a.type === "pass" || a.type === "concede" || a.type === "invade")
          continue;
        const s = after(state, a, me);
        if (s && counters(s, me)) hard(a);
      }
    // Don't move Biollante out of zone 5 (zone 6 opens its 6-cost strategies).
    for (const a of actions) {
      const n = number(a);
      const push =
        (a.type === "activateStrategy" &&
          (n === LANDING || n === SLITHERING)) ||
        (a.type === "playMonster" && n === GODZILLA_2004);
      if (!push || theirAt > 5) continue;
      const s = after(state, a, me);
      const moved = s?.players.find(
        (p) => p.id === opponent.id,
      )?.monsterPosition;
      if ((moved ?? 0) > 5) hard(a);
    }
    // Wait to be countered to rank IV, then the all-out invasion with Godzilla (2023) EBP01-010.
    if (top && state.cards[top.cardId]?.deckCardNumber === COLUMN_CLEAR)
      for (const a of actions)
        if (a.type === "invade" && !winsNow(state, a, me)) against.delete(a);
    // Kings spread: never two next to each other, where one Godzilla vs. Megaguirus takes both.
    const kingZones = ([1, 2, 3, 4, 5, 6, 7, 8] as const).filter((z) =>
      player.zones[z].some(
        (stack) =>
          state.cards[stack.at(-1)?.cardId ?? -1]?.deckCardNumber === KING,
      ),
    );
    const nextToKing = (zone: ZoneNumber) =>
      kingZones.some((k) =>
        isAdjacent({ player: me, zone }, { player: me, zone: k }),
      );
    const kingPlays = actions.filter(
      (a): a is Extract<Action, { type: "playBattle" }> =>
        a.type === "playBattle" && number(a) === KING,
    );
    if (kingPlays.some((a) => !nextToKing(a.zone)))
      for (const a of kingPlays)
        if (nextToKing(a.zone))
          mark(against, a, "Wrangler plan v2.1", "against");
    // GAM down before Bio7 (EBP02-035) returns your discard pile to your deck.
    if (actions.some((a) => a.type === "playBattle" && number(a) === GAM))
      for (const a of actions)
        if (a.type === "pass")
          mark(against, a, "Wrangler plan v2.1", "against");
    // No strategy in play against its rank III EBP02-027 in zone 5+ (its awakening 6 makes it
    // counter-proof while you have one).
    // Hard: unless your counter beats 40,000 (Paul), when an advance takes it to zone 6+.
    if (theirCard?.deckCardNumber === "EBP02-027" && theirAt >= 5)
      for (const a of actions)
        if (a.type === "activateStrategy")
          if (counterPowerOf(state, player) > BIO_III_COUNTER)
            mark(against, a, "Wrangler plan v2.1", "against");
          else hard(a);
  }

  // #417: a reset invasion that makes the counter now is taken, as card rule 7 takes a way to
  // the counter: every other move is pruned (an invasion that wins now aside), the monster plays
  // too (as a preference, the search took a monster play over it).
  if (resetCounters.size > 0)
    for (const a of actions)
      if (
        a.type !== "concede" &&
        !resetCounters.has(a) &&
        !(a.type === "invade" && winsNow(state, a, me))
      ) {
        mark(against, a, "Wrangler plan v2.1", "against");
        rescued.delete(a);
        pruned.add(a);
      }
  // Never argue against everything.
  if (actions.every((a) => a.type === "concede" || against.has(a)))
    against.clear();
  // Nor prune everything.
  if (actions.every((a) => a.type === "concede" || pruned.has(a)))
    pruned.clear();
  return { against, rescued, pruned };
}

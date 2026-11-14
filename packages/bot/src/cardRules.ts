import { getCardAbilities } from "@gojisim/cards";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  getRank,
  type PlayerId,
  sameColumn,
  type ZoneNumber,
  hasFlag,
} from "@gojisim/engine";
import {
  boostedZones,
  columnCard,
  counterMadeWith,
  counterOnly,
  counters,
} from "./rules";
import type { Decklist } from "./types";

/**
 * Card-play rules for Medium and Hard (Paul, Nov 12), on with `cardRules` (from Medium up) or
 * with Paul's play rules (`rules`, Hard). Like the rules, they act at the search root and on
 * blunders, judged on the first determinization, and read card data, never card names.
 *
 * 1. #255: a monster card that loses the game with no card in your strategy zones (Godzilla (1995)
 *    EBP03-013: "if there are no cards in your strategy zones, you lose") is played only when,
 *    once played, you have a strategy card in play or can play one this turn.
 * 2. #246: in your zone 8 (Paul, Nov 12: or zone 6 or 7, when the invasion can then reach it) with
 *    the opponent's zone 8 occupied, when a play this turn can clear it and leave an invasion
 *    that wins, clear it first: no invading into the blocker (it spends the turn's invasion,
 *    8.6.2) and no passing; and inside that play, the answers that clear it (the blocker as the
 *    target, the option that destroys it). From zone 7 that's King Ghidorah's line: Godzilla vs.
 *    King Ghidorah EBP02-071 at awakening 6 destroys a rank 6 or lower blocker, then the invasion.
 * 3. #258: a card that works in the same column as the opponent's monster (Mecha-King Ghidorah
 *    EBP02-068: no invading, +3000) goes in that column when it can; otherwise in zone 1 or 2 (the
 *    columns the opponent's monster walks through, zones 4 to 7). An empty zone over stacking on
 *    your own card, and never the zone straight ahead of your own monster (its next advance).
 *    #289: never on top of your own column card in that column while zone 1 or 2 has room; and a
 *    card that stops the opponent's monster invading counts as rule 7's zone 8 block.
 * 4. #259: a card that plays itself from the discard pile (King Ghidorah (1998) EBP03-063) comes
 *    back whenever there's an empty zone (its optional play is answered yes), into an empty zone;
 *    and a destroy of the opponent's cards leaves their recurring cards for last (they come back),
 *    taking a card that stays gone when it can.
 * 5. #254: a counter-only strategy (Godzilla vs. Destoroyah EBP01-062: +10,000 total counter power)
 *    is played only when it's needed: not while the counter is already made without it (7.4.3),
 *    and not when even with it (and the others in hand) the counter isn't made.
 * 6. #248: a slow counter deck (`SLOW_DECK_MONSTERS` or fewer monster cards in its main deck: the
 *    Tangler the bot played in Ian's reports has 4) doesn't invade unless the invasion wins the game now: it hasn't the
 *    threat to live in the high zones, and an invasion ends its turn in reach of a push.
 * 7. #265: with your zone 8 open and the opponent's monster in reach of it (zone 6 or beyond),
 *    when some plays this turn put a battle card in your zone 8, take one: those plays stay even
 *    where another rule holds them (#265: the held monster cards whose rage discards make
 *    Godzilla Against Mechagodzilla playable), and every other move waits (passing too), but an
 *    invasion that wins now.
 *    #305 (Ian): the counter comes first. With the counter made, nothing is forced; with a way to
 *    make it this turn (rule 9's plays), those plays are the ones taken instead of the block. A
 *    counter sends their monster back (7.4.3), so it beats the block, and the block can cost it
 *    (a King over your own Godzilla (2023) in zone 8: 17,000 vs 27,000, where zone 1 made 27,000).
 * 8. #272: a battle card whose ability works only in some zones (Godzilla, King of the Monsters
 *    EBP01-075: protected in zones 1-5) is played in one of them when it can be (Paul's rule 6
 *    only leans that way, as a prior). Blocking an open zone 8 (rule 7) still comes first.
 * 9. #274: with the opponent's monster in reach of your zone 8 and the counter not made yet, the
 *    plays that start a way to make it this turn (rage discards count: Godzilla, King of the
 *    Monsters EBP01-075 gains +3000 counter power per rage) are freed from the holds of Paul's
 *    rule 2. Unlike rule 7 it forces nothing: the search still picks, and the card rules'
 *    placements stand.
 * 10. #275: a play that advances the opponent's monster (Godzilla Landing EBP01-030) is made only
 *    when, after it, you can still make the counter this turn or have your zone 8 blocked (or can
 *    block it): pushing their monster toward zone 8 otherwise hands them the invasion win.
 * 11. Paul, Nov 12 (Ian): against an opponent who can legally run Godzilla vs. King Ghidorah
 *    EBP02-071 (a green deck) and whose monster can reach zone 7 (zone 5 or beyond), a zone 8
 *    blocker of rank 6 or lower doesn't count (its awakening 6 destroys it), for rules 7, 9 and
 *    10: it takes rank 7 or higher.
 * 12. #130 (Tuscancow): an Evolution's pick (12.6.2) of a card no stronger than the one it stacks
 *    on (counter power not higher: Battra (Larva) onto Battra (Larva)) is left out while a stronger
 *    one or "done" is there.
 * 13. #131 (Tuscancow): a battle card whose [enter] needs Awakening N (Super-X ESD02-009: zone 4)
 *    waits while your monster is short of N and an invasion this turn takes it there: invade
 *    first, then play it (combos.md #7, the Cadmium Barrage order).
 * 14. #263 (Paul, Nov 12): no rage discards on turns 1-2 unless the rage is needed (it's on a
 *    way to the counter or to a zone 8 block); passing is freed from Paul's rule 3 then.
 * 15. #264 (Paul, Nov 12): play into your monster cards' abilities. A monster card whose ability
 *    fires on reaching a zone (Godzilla (1954) EBP01-004: on advancing into zone 8, destroy all
 *    battle cards) isn't stacked on a turn your monster can't reach that zone (its invasion, then
 *    the end-phase advance), unless the stack is needed now (it's on a way to the counter) or it's
 *    the only play besides passing.
 * 16. #290 (Keldroc, Nov 13): a mode that does something. At a "choose one" (10.5.2.2.1), a mode
 *    that changes nothing (King Ghidorah (1991) EBP02-049's destroy with no rank 5 or lower battle
 *    card to hit) isn't picked while another mode does something.
 * 17. #288 (Keldroc, Nov 13): a [revenge] card (Dorat EBP02-058) goes where it gets destroyed:
 *    ahead of your own monster, whose advance crushes it (11.3), an empty zone first, never zone 8,
 *    and (Monarch, Nov 13) the nearest two zones ahead first, Keldroc's "landmine"; it isn't paid for
 *    an invasion while another card can pay (discarded, it never pays off);
 *    and nothing goes on top of your own [revenge] card while another zone is open (but a column
 *    card, which rule 3 places: Mecha-King Ghidorah in the opponent monster's column, #289).
 * 18. #290 (Keldroc and Monarch, Nov 13): at a "choose one", a mode that makes the opponent
 *    discard beats one that only mills your own deck (King Ghidorah (1991) EBP02-049: the hand
 *    discard, "9 times out of 10"), unless only the mill lets this turn's Mecha-King Ghidorah
 *    EBP02-068 play or counter happen (its discarded King Ghidorah cards lower Mecha-King's rank).
 */

type Json = Record<string, unknown>;

/** Every object nested anywhere in a value. */
function nested(value: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(value)) for (const v of value) nested(v, out);
  else if (value && typeof value === "object") {
    out.push(value as Json);
    for (const v of Object.values(value)) nested(v, out);
  }
  return out;
}

/** Whether a card has an ability that loses the game for its player while their strategy zones are empty. */
export function losesWithoutStrategy(deckCardNumber: string): boolean {
  return getCardAbilities(deckCardNumber).abilities.some((ability) => {
    const parts = nested(ability);
    const loses = parts.some(
      (p) => p["effect"] === "loseGame" && p["player"] === "you",
    );
    const emptyStrategy = parts.some((p) => {
      const count = p["count"] as Json | undefined;
      return (
        count?.["owner"] === "you" &&
        count["area"] === "strategy" &&
        p["op"] === "=" &&
        p["value"] === 0
      );
    });
    return loses && emptyStrategy;
  });
}

/** Rule 1: after playing it, a strategy card is in play or can be played this turn. */
function strategyCovered(state: GameState, me: PlayerId): boolean {
  const player = state.players.find((p) => p.id === me);
  if (player?.strategyZones.some((zone) => zone.length > 0)) return true;
  return getLegalActions(state, me).some((a) => a.type === "activateStrategy");
}

/** Its own [enter] choices taken (the first option each), up to the next decision that isn't one. */
function settleOwnChoices(state: GameState, me: PlayerId): GameState {
  let s = state;
  for (let i = 0; i < 20 && s.pendingChoice?.player === me; i++) {
    const first = getLegalActions(s, me).find((a) => a.type !== "concede");
    if (!first) break;
    s = advanceToDecision(applyAction(s, first));
  }
  return s;
}

/** The search budget for rule 2's look at a play's own choices (states visited). */
const CLEAR_BUDGET = 200;

const zone8Empty = (state: GameState, me: PlayerId) =>
  (state.players.find((p) => p.id !== me)?.zones[8].length ?? 1) === 0;

/**
 * Rule 2: whether `action` can leave the opponent's zone 8 empty with the invasion still to come
 * this turn: its own choices tried every way (a small search, `CLEAR_BUDGET` states), as the
 * bot would answer them.
 */
function clearsZone8(state: GameState, action: Action, me: PlayerId): boolean {
  let budget = CLEAR_BUDGET;
  const reaches = (s: GameState): boolean => {
    if (budget-- <= 0) return false;
    if (s.result) return s.result.winner === me;
    const choice = s.pendingChoice;
    if (choice?.player === me)
      return getLegalActions(s, me)
        .filter((a) => a.type === "choose")
        .some((a) => reaches(advanceToDecision(applyAction(s, a))));
    if (choice) return false;
    if (s.turnPlayer !== me || !zone8Empty(s, me)) return false;
    // An invasion that wins now (5.13.1.1.2): from zone 8 any; from 6 or 7, one that reaches it.
    return getLegalActions(s, me).some(
      (a) => a.type === "invade" && winsNow(s, a, me),
    );
  };
  try {
    return reaches(advanceToDecision(applyAction(state, action)));
  } catch {
    return false;
  }
}

/**
 * Rule 2's verdict: the invasions and the pass, while another play clears the blocker first; at
 * one of the bot's own choices on the way, the answers that can't clear it while one can.
 */
function invadeIntoBlocker(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  const player = state.players.find((p) => p.id === me);
  if (
    state.turnPlayer !== me ||
    (player?.monsterPosition ?? 0) < 6 ||
    zone8Empty(state, me) ||
    state.turnFlags.invasionUsed
  )
    return [];
  if (state.pendingChoice) {
    if (state.pendingChoice.player !== me) return [];
    const answers = actions.filter((a) => a.type === "choose");
    const clearing = new Set(answers.filter((a) => clearsZone8(state, a, me)));
    return clearing.size > 0 ? answers.filter((a) => !clearing.has(a)) : [];
  }
  if (!actions.some((a) => a.type === "invade")) return [];
  const clearing = actions.some(
    (a) =>
      a.type !== "invade" &&
      a.type !== "pass" &&
      a.type !== "concede" &&
      clearsZone8(state, a, me),
  );
  return clearing
    ? actions.filter((a) => a.type === "invade" || a.type === "pass")
    : [];
}

/**
 * Rule 3: plays of same-column cards away from the best zones there are: the opponent's monster
 * column, else zone 1 or 2; empty before stacked; never straight ahead of the own monster.
 */
function columnPlays(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  if (!player || !opponent || state.pendingChoice) return [];
  const oppAt = opponent.monsterPosition;
  const ahead =
    player.monsterPosition === null ? null : player.monsterPosition + 1;
  const dead: Action[] = [];
  const cardOf = (id: string) => {
    const c = player.hand.find((h) => h.instanceId === id);
    return c ? state.cards[c.cardId] : undefined;
  };
  const byCard = new Map<string, Extract<Action, { type: "playBattle" }>[]>();
  for (const a of actions)
    if (a.type === "playBattle" && columnCard(cardOf(a.cardInstanceId)))
      byCard.set(a.cardInstanceId, [
        ...(byCard.get(a.cardInstanceId) ?? []),
        a,
      ]);
  for (const plays of byCard.values()) {
    const empty = (z: ZoneNumber) => player.zones[z].length === 0;
    const inColumn = (z: ZoneNumber) =>
      oppAt !== null &&
      sameColumn({ player: me, zone: z }, { player: opponent.id, zone: oppAt });
    // #289: covering your own column card there gains nothing (the new one does the same).
    const ownColumnCard = (z: ZoneNumber) =>
      player.zones[z].some((stack) =>
        columnCard(state.cards[stack[stack.length - 1]?.cardId ?? -1]),
      );
    const tiers: ((z: ZoneNumber) => boolean)[] = [
      (z) => inColumn(z) && empty(z),
      (z) => inColumn(z) && !ownColumnCard(z),
      (z) => (z === 1 || z === 2) && empty(z),
      (z) => z === 1 || z === 2,
    ];
    const safe = plays.filter((a) => a.zone !== ahead);
    const best = tiers
      .map((tier) => safe.filter((a) => tier(a.zone)))
      .find((t) => t.length > 0);
    if (!best) continue;
    for (const a of plays) if (!best.includes(a)) dead.push(a);
  }
  return dead;
}

/** Rule 17: how many zones ahead of your monster count as near, for a [revenge] card. */
const LANDMINE_REACH = 2;

/** Rule 17: whether a card has [revenge] (it pays off when it's destroyed from the field). */
export function hasRevenge(deckCardNumber: string): boolean {
  return getCardAbilities(deckCardNumber).abilities.some(
    (ability) =>
      ability.kind === "keyword" &&
      (ability as unknown as Json)["keyword"] !== undefined &&
      ((ability as unknown as Json)["keyword"] as Json)["name"] === "revenge",
  );
}

/**
 * Rule 17: plays that waste a [revenge] card. It goes where it gets destroyed: ahead of your own
 * monster (its advance crushes it, 11.3), an empty zone first, never zone 8. And no card goes on
 * top of your own [revenge] card while another zone is open (covered, it never pays off).
 */
function revengePlays(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  const player = state.players.find((p) => p.id === me);
  if (!player || state.pendingChoice || player.monsterPosition === null)
    return [];
  const at = player.monsterPosition;
  const dataOf = (id: string) => {
    const c = player.hand.find((h) => h.instanceId === id);
    return c ? state.cards[c.cardId] : undefined;
  };
  const empty = (z: ZoneNumber) => player.zones[z].length === 0;
  const coversRevenge = (z: ZoneNumber) =>
    player.zones[z].some((stack) =>
      hasRevenge(
        state.cards[stack[stack.length - 1]?.cardId ?? -1]?.deckCardNumber ??
          "",
      ),
    );
  const dead: Action[] = [];
  // Keldroc: "every Dorat is sacred": paid for an invasion it's discarded, never destroyed, so it
  // isn't the payment while another card can pay.
  const invades = actions.filter((a) => a.type === "invade");
  const revengePays = invades.filter(
    (a) =>
      a.type === "invade" &&
      hasRevenge(dataOf(a.cardInstanceId)?.deckCardNumber ?? ""),
  );
  if (revengePays.length > 0 && revengePays.length < invades.length)
    dead.push(...revengePays);
  const byCard = new Map<string, Extract<Action, { type: "playBattle" }>[]>();
  for (const a of actions)
    if (a.type === "playBattle")
      byCard.set(a.cardInstanceId, [
        ...(byCard.get(a.cardInstanceId) ?? []),
        a,
      ]);
  for (const plays of byCard.values()) {
    const first = plays[0];
    const data = first ? dataOf(first.cardInstanceId) : undefined;
    // A column card's zone is rule 3's call (its column outweighs the card it covers).
    if (columnCard(data)) continue;
    const revenge = hasRevenge(data?.deckCardNumber ?? "");
    const ahead = (z: ZoneNumber) => z > at && z < 8;
    // Keldroc's "landmine": the nearest zones ahead first, so it's crushed soon.
    const near = (z: ZoneNumber) => ahead(z) && z <= at + LANDMINE_REACH;
    const tiers: ((z: ZoneNumber) => boolean)[] = revenge
      ? [
          (z) => near(z) && empty(z),
          (z) => ahead(z) && empty(z),
          (z) => ahead(z) && !coversRevenge(z),
        ]
      : [(z) => !coversRevenge(z)];
    const best = tiers
      .map((tier) => plays.filter((a) => tier(a.zone)))
      .find((t) => t.length > 0);
    if (!best) continue;
    for (const a of plays) if (!best.includes(a)) dead.push(a);
  }
  return dead;
}

/** Rule 4: whether a card has an ability that plays itself from the discard pile. */
export function recursFromDiscard(deckCardNumber: string): boolean {
  return getCardAbilities(deckCardNumber).abilities.some((ability) => {
    const a = ability as unknown as Json;
    const where = a["activeIn"];
    return (
      Array.isArray(where) &&
      where.includes("discard") &&
      nested(a).some(
        (p) =>
          p["effect"] === "play" &&
          p["from"] === "discard" &&
          (p["filter"] as Json | undefined)?.["this"] === true,
      )
    );
  });
}

/** The card the resolving ability belongs to, or `undefined`. */
const sourceOf = (state: GameState) =>
  state.resolution
    ? state.cards[state.resolution.standby.sourceCardId]
    : undefined;

/** Rule 4: the answers that keep a recurring card in the discard or stack it, and the destroys that waste a pick on one. */
function recurringPlays(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  const choice = state.pendingChoice;
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  if (!player || !opponent) return [];
  if (!choice) {
    // From the hand too: a recurring card into an empty zone when one is open.
    const recurringPlay = (
      a: Action,
    ): a is Extract<Action, { type: "playBattle" }> => {
      if (a.type !== "playBattle") return false;
      const c = player.hand.find((h) => h.instanceId === a.cardInstanceId);
      const data = c ? state.cards[c.cardId] : undefined;
      return !!data && recursFromDiscard(data.deckCardNumber);
    };
    const plays = actions.filter(recurringPlay);
    const intoEmpty = (a: Extract<Action, { type: "playBattle" }>) =>
      player.zones[a.zone].length === 0;
    return plays.some(intoEmpty) ? plays.filter((a) => !intoEmpty(a)) : [];
  }
  if (choice.player !== me) return [];
  const answers = actions.filter(
    (a): a is Extract<Action, { type: "choose" }> => a.type === "choose",
  );
  const emptyZones = ([1, 2, 3, 4, 5, 6, 7, 8] as ZoneNumber[]).filter(
    (z) => z !== player.monsterPosition && player.zones[z].length === 0,
  );
  const source = sourceOf(state);
  const recurring = !!source && recursFromDiscard(source.deckCardNumber);
  // Its optional play from the discard pile: yes while there's an empty zone.
  if (choice.kind === "confirm" && recurring && emptyZones.length > 0)
    return answers.filter((a) => a.optionId === "no");
  // Where it goes: an empty zone when there is one.
  if (choice.kind === "zone" && recurring && emptyZones.length > 0) {
    const empty = answers.filter((a) =>
      emptyZones.some((z) => a.optionId === `${me}:${z}`),
    );
    return empty.length > 0 ? answers.filter((a) => !empty.includes(a)) : [];
  }
  // A destroy among the opponent's cards: a recurring one only when nothing else is destroyed.
  if (choice.kind === "target") {
    const card = (id: string) => {
      for (const stacks of Object.values(opponent.zones))
        for (const stack of stacks)
          for (const c of stack)
            if (c.instanceId === id) return state.cards[c.cardId];
      return undefined;
    };
    // A destroyed card leaves the opponent's zones (its discard-pile copy gets a new instance id).
    const destroys = (a: Action) => {
      if (a.type !== "choose") return false;
      try {
        const after = advanceToDecision(applyAction(state, a));
        const theirs = after.players.find((p) => p.id === opponent.id);
        return !Object.values(theirs?.zones ?? {}).some((stacks) =>
          stacks.some((stack) =>
            stack.some((c) => c.instanceId === a.optionId),
          ),
        );
      } catch {
        return false;
      }
    };
    const targets = answers.filter((a) => card(a.optionId));
    const wasted = targets.filter((a) => {
      const c = card(a.optionId);
      return !!c && recursFromDiscard(c.deckCardNumber) && destroys(a);
    });
    const better = targets.some((a) => !wasted.includes(a) && destroys(a));
    return better ? wasted : [];
  }
  return [];
}

/** Rule 5: whether the counter is made after `action` (its own further choices not taken). */
function madeAfter(state: GameState, action: Action, me: PlayerId): boolean {
  try {
    return counterMadeWith(state, action, me);
  } catch {
    return false;
  }
}

/**
 * Rule 5: counter-only strategy plays that aren't needed, or not enough: from the hand, or an
 * answer that activates one (Destoroyah Perfect Form EBP01-060's [enter], from the discard pile).
 */
function spentCounters(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  if (state.turnPlayer !== me) return [];
  const player = state.players.find((p) => p.id === me);
  if (!player) return [];
  const inStrategy = (s: GameState, cardId: number) =>
    s.players
      .find((p) => p.id === me)
      ?.strategyZones.some((z) => z.some((x) => x.card.cardId === cardId)) ??
    false;
  let plays: Action[];
  if (state.pendingChoice) {
    if (state.pendingChoice.player !== me) return [];
    const options = new Map(
      state.pendingChoice.options.map((o) => [o.id, o.cardId]),
    );
    plays = actions.filter((a) => {
      if (a.type !== "choose") return false;
      const cardId = options.get(a.optionId);
      if (cardId === null || cardId === undefined) return false;
      if (!counterOnly(state.cards[cardId])) return false;
      // An answer that puts it in a strategy zone activates it.
      try {
        return (
          !inStrategy(state, cardId) &&
          inStrategy(advanceToDecision(applyAction(state, a)), cardId)
        );
      } catch {
        return false;
      }
    });
  } else
    plays = actions.filter((a) => {
      if (a.type !== "activateStrategy") return false;
      const c = player.hand.find((h) => h.instanceId === a.cardInstanceId);
      return counterOnly(c ? state.cards[c.cardId] : undefined);
    });
  if (plays.length === 0) return [];
  // Already made without it: keep it.
  if (counters(state, me)) return plays;
  return plays.filter((a) => !madeAfter(state, a, me));
}

/** Rule 6: at most this many monster cards in the main deck makes a slow counter deck (Ian, Nov 12). */
export const SLOW_DECK_MONSTERS = 4;

/** Rule 6: whether a decklist is a slow counter deck. */
export function slowCounterDeck(deck: Decklist | undefined): boolean {
  return (
    !!deck &&
    deck.mainDeck.filter((c) => c.type === "Monster").length <=
      SLOW_DECK_MONSTERS
  );
}

/** Rule 6: a slow counter deck's invasions that don't win now. */
function slowInvasions(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own: Decklist | undefined,
): Action[] {
  if (state.pendingChoice || !slowCounterDeck(own)) return [];
  return actions.filter((a) => {
    if (a.type !== "invade" && a.type !== "invadeFromDeck") return false;
    try {
      return advanceToDecision(applyAction(state, a)).result?.winner !== me;
    } catch {
      return true;
    }
  });
}

/** Whether `action` wins the game now. */
function winsNow(state: GameState, action: Action, me: PlayerId): boolean {
  if (action.type === "concede") return false;
  try {
    return advanceToDecision(applyAction(state, action)).result?.winner === me;
  } catch {
    return false;
  }
}

/**
 * Rules 7 and 9: the plays freed from Paul's rules' holds: a block's (rule 7), else the counter's
 * (rule 9) that the card rules themselves don't leave out.
 */
export function rescuedPlays(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  own?: Decklist,
  options: CardRulesOptions = {},
): Set<Action> {
  const dead = cardRulesDead(state, actions, me, own, options);
  const blocks = forcedPlays(state, actions, me, options);
  if (blocks.size > 0) {
    // As in `cardRulesDead`: the ways the card rules leave standing, or all of them.
    const kept = [...blocks].filter((a) => !dead.has(a));
    return new Set(kept.length > 0 ? kept : blocks);
  }
  const freed = new Set(
    [...counterPlays(state, actions, me)].filter((a) => !dead.has(a)),
  );
  // Rule 14: with the early rage discards held, passing is allowed (Paul's rule 3 forbids it
  // while a monster card can go to rage).
  if (earlyRage(state, actions, me).length > 0)
    for (const a of actions) if (a.type === "pass") freed.add(a);
  return freed;
}

/** Rules 7 and 9's search budget (states visited) for a way to reach their goal this turn. */
const BLOCK_BUDGET = 400;
/** Rule 7's search depth (own plays in a row). */
const BLOCK_DEPTH = 5;

/**
 * Rule 11 (Paul, Nov 12): the rank a zone 8 blocker needs to hold: 7 against an opponent who can
 * legally run Godzilla vs. King Ghidorah EBP02-071 (a green invading monster, public) and whose
 * monster is in zone 5 or beyond (its awakening 6 destroys a rank 6 or lower blocker); else any.
 */
function blockerRankNeeded(state: GameState, me: PlayerId): number {
  const opponent = state.players.find((p) => p.id !== me);
  const top = opponent?.invadingMonsterZone.at(-1);
  const card = top ? state.cards[top.cardId] : undefined;
  const green = card?.colors.includes("Green") ?? false;
  return green && (opponent?.monsterPosition ?? 0) >= 5 ? 7 : 0;
}

const blocked = (state: GameState, me: PlayerId) => {
  // #289: the opponent's monster can't invade at all (Mecha-King Ghidorah EBP02-068 in its column).
  const top = state.players
    .find((p) => p.id !== me)
    ?.invadingMonsterZone.at(-1);
  if (top && hasFlag(state, top, "cannotInvade")) return true;
  const need = blockerRankNeeded(state, me);
  return (
    state.players
      .find((p) => p.id === me)
      ?.zones[8].some((stack) => {
        const top = stack[stack.length - 1];
        if (!top || state.cards[top.cardId]?.type !== "Battle") return false;
        return need === 0 || (getRank(state, top) ?? 0) >= need;
      }) ?? false
  );
};

/**
 * Rule 7: the plays that start a way to put a battle card in your open zone 8 this turn, while the
 * opponent's monster is in reach of it. Empty when there's no threat or no way.
 */
export function blockingPlays(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  { counterFirst = true }: CardRulesOptions = {},
): Set<Action> {
  const opponent = state.players.find((p) => p.id !== me);
  if (
    state.pendingChoice ||
    state.turnPlayer !== me ||
    blocked(state, me) ||
    (opponent?.monsterPosition ?? 1) < 6 ||
    // #305: the counter made sends their monster back (7.4.3), so there's no invasion to block.
    (counterFirst && counters(state, me))
  )
    return new Set();
  return playsReaching(state, actions, me, (s) => blocked(s, me));
}

/**
 * Rule 7 (#305): the plays taken while the opponent's monster is in reach of your open zone 8: a
 * way to make the counter this turn (rule 9's), else a way to block.
 */
function forcedPlays(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  options: CardRulesOptions,
): Set<Action> {
  const blocks = blockingPlays(state, actions, me, options);
  if (blocks.size === 0 || options.counterFirst === false) return blocks;
  const ways = counterPlays(state, actions, me);
  return ways.size > 0 ? ways : blocks;
}

/** Rule 9: the plays that start a way to make the counter this turn, while it isn't made. */
export function counterPlays(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Set<Action> {
  const opponent = state.players.find((p) => p.id !== me);
  if (
    state.pendingChoice ||
    state.turnPlayer !== me ||
    (opponent?.monsterPosition ?? 1) < 6 ||
    counters(state, me)
  )
    return new Set();
  return playsReaching(state, actions, me, (s) => counters(s, me));
}

/** Rules 7 and 9: the first plays of the short sequences of own plays that reach `goal` this turn. */
function playsReaching(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  goal: (s: GameState) => boolean,
): Set<Action> {
  const found = new Set<Action>();
  let budget = BLOCK_BUDGET;
  const playable = (a: Action) =>
    a.type === "gainRage" ||
    a.type === "playBattle" ||
    a.type === "activateStrategy" ||
    a.type === "playMonster";
  const step = (s: GameState, a: Action) => {
    try {
      return advanceToDecision(applyAction(s, a));
    } catch {
      return null;
    }
  };
  // The bot's own answers are tried every way (an overload's keep, 11.5; a target), within the
  // budget, like rule 2's look; a play counts one step of the depth.
  const reaches = (s: GameState | null, depth: number): boolean => {
    if (!s || budget-- <= 0 || s.result) return false;
    const choice = s.pendingChoice;
    if (choice?.player === me)
      return getLegalActions(s, me)
        .filter((a) => a.type === "choose")
        .some((a) => reaches(step(s, a), depth));
    if (choice || s.turnPlayer !== me) return false;
    if (goal(s)) return true;
    if (depth === 0) return false;
    return getLegalActions(s, me)
      .filter(playable)
      .some((a) => reaches(step(s, a), depth - 1));
  };
  for (const a of actions.filter(playable))
    if (reaches(step(state, a), BLOCK_DEPTH - 1)) found.add(a);
  return found;
}

/** Rule 8: plays of zone-limited cards outside their zones, while a play inside them is legal. */
function zoneLimitedPlays(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  if (state.pendingChoice) return [];
  const player = state.players.find((p) => p.id === me);
  if (!player) return [];
  const dead: Action[] = [];
  const byCard = new Map<string, Extract<Action, { type: "playBattle" }>[]>();
  for (const a of actions)
    if (a.type === "playBattle")
      byCard.set(a.cardInstanceId, [
        ...(byCard.get(a.cardInstanceId) ?? []),
        a,
      ]);
  for (const [id, plays] of byCard) {
    const c = player.hand.find((h) => h.instanceId === id);
    const zones = boostedZones(c ? state.cards[c.cardId] : undefined);
    if (zones.length === 0) continue;
    if (!plays.some((a) => zones.includes(a.zone))) continue;
    for (const a of plays) if (!zones.includes(a.zone)) dead.push(a);
  }
  return dead;
}

/** Rule 10: plays that advance the opponent's monster with no counter or zone 8 block to follow. */
function unsafeAdvances(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  if (state.pendingChoice || state.turnPlayer !== me) return [];
  const before =
    state.players.find((p) => p.id !== me)?.monsterPosition ?? null;
  if (before === null) return [];
  const dead: Action[] = [];
  for (const a of actions) {
    if (a.type === "pass" || a.type === "concede" || a.type === "invade")
      continue;
    let after: GameState;
    try {
      after = settleOwnChoices(advanceToDecision(applyAction(state, a)), me);
    } catch {
      continue;
    }
    if (after.result) continue;
    const at = after.players.find((p) => p.id !== me)?.monsterPosition ?? null;
    if (at === null || at <= before || at < 6) continue;
    if (after.pendingChoice || after.turnPlayer !== me) continue;
    const legal = getLegalActions(after, me);
    const safe =
      counters(after, me) ||
      blocked(after, me) ||
      playsReaching(after, legal, me, (s) => counters(s, me) || blocked(s, me))
        .size > 0;
    if (!safe) dead.push(a);
  }
  return dead;
}

/** Rule 12: Evolution picks no stronger than the card they'd stack on. */
function weakEvolutions(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  const choice = state.pendingChoice;
  if (
    choice?.player !== me ||
    choice.kind !== "target" ||
    choice.rule !== "12.6.2"
  )
    return [];
  const base = sourceOf(state);
  const floor = base?.counterOrThreat ?? null;
  if (floor === null) return [];
  const options = new Map(choice.options.map((o) => [o.id, o.cardId]));
  const weak = actions.filter((a) => {
    if (a.type !== "choose") return false;
    const cardId = options.get(a.optionId);
    if (cardId === null || cardId === undefined) return false;
    const card = state.cards[cardId];
    return (card?.counterOrThreat ?? 0) <= floor;
  });
  // Something stays: a stronger pick, or "done".
  return actions.some((a) => a.type === "choose" && !weak.includes(a))
    ? weak
    : [];
}

/** Rule 13: the Awakening zone a card's [enter] needs, or `null`. */
export function enterAwakening(deckCardNumber: string): number | null {
  for (const ability of getCardAbilities(deckCardNumber).abilities) {
    const a = ability as unknown as Json;
    if ((a["trigger"] as Json | undefined)?.["on"] !== "enter") continue;
    const gate = ((a["gates"] as Json[] | undefined) ?? []).find(
      (g) => g["gate"] === "awakening",
    );
    if (typeof gate?.["zone"] === "number") return gate["zone"];
  }
  return null;
}

/** Rule 13: plays of Awakening-[enter] cards before the invasion that would wake them. */
function earlyAwakenings(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  if (state.pendingChoice || state.turnPlayer !== me) return [];
  const player = state.players.find((p) => p.id === me);
  const at = player?.monsterPosition ?? null;
  if (!player || at === null) return [];
  const invasions = actions.filter((a) => a.type === "invade");
  if (invasions.length === 0) return [];
  // How far an invasion this turn takes the monster (the best of them).
  let reach: number = at;
  for (const a of invasions) {
    try {
      const after = advanceToDecision(applyAction(state, a));
      const pos = after.players.find((p) => p.id === me)?.monsterPosition;
      if (typeof pos === "number") reach = Math.max(reach, pos);
    } catch {
      continue;
    }
  }
  return actions.filter((a) => {
    if (a.type !== "playBattle") return false;
    const c = player.hand.find((h) => h.instanceId === a.cardInstanceId);
    const data = c ? state.cards[c.cardId] : undefined;
    const need = data ? enterAwakening(data.deckCardNumber) : null;
    return need !== null && at < need && reach >= need;
  });
}

/** Rule 14: the turns (game turns) in which rage discards wait until they're needed. */
const EARLY_RAGE_TURNS = 2;

/** Rule 14: early rage discards that aren't on a way to the counter or a block. */
function earlyRage(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  if (state.pendingChoice || state.turnPlayer !== me) return [];
  if (state.turn > EARLY_RAGE_TURNS) return [];
  const rages = actions.filter((a) => a.type === "gainRage");
  if (rages.length === 0) return [];
  // Needed: on a way to the counter (while it isn't made yet) or to a zone 8 block.
  const needed = new Set([
    ...(counters(state, me)
      ? []
      : playsReaching(state, actions, me, (s) => counters(s, me))),
    ...blockingPlays(state, actions, me),
  ]);
  return rages.filter((a) => !needed.has(a));
}

/** Rule 15: the zone a monster card's ability fires on reaching ("advanced" into it), or `null`. */
export function reachZone(deckCardNumber: string): number | null {
  for (const ability of getCardAbilities(deckCardNumber).abilities) {
    const trigger = (ability as unknown as Json)["trigger"] as Json | undefined;
    if (
      trigger?.["on"] === "advanced" &&
      trigger["whose"] === "this" &&
      typeof trigger["toZone"] === "number"
    )
      return trigger["toZone"];
  }
  return null;
}

/** Rule 15: monster plays whose reach-a-zone ability can't fire this turn, and that aren't needed. */
function heldMonsters(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  if (state.pendingChoice || state.turnPlayer !== me) return [];
  const player = state.players.find((p) => p.id === me);
  const at = player?.monsterPosition ?? null;
  if (!player || at === null) return [];
  const plays = actions.filter((a) => {
    if (a.type !== "playMonster") return false;
    const c = player.hand.find((h) => h.instanceId === a.cardInstanceId);
    const data = c ? state.cards[c.cardId] : undefined;
    return data ? reachZone(data.deckCardNumber) !== null : false;
  });
  if (plays.length === 0) return [];
  // The furthest the monster gets this turn: its best invasion, then the end-phase advance.
  let reach: number = at;
  for (const a of actions) {
    if (a.type !== "invade") continue;
    try {
      const pos = advanceToDecision(applyAction(state, a)).players.find(
        (p) => p.id === me,
      )?.monsterPosition;
      if (typeof pos === "number") reach = Math.max(reach, pos);
    } catch {
      continue;
    }
  }
  reach += 1;
  const others = actions.filter(
    (a) => a.type !== "pass" && a.type !== "concede" && !plays.includes(a),
  );
  if (others.length === 0) return [];
  // Needed now: on a way to the counter, while it isn't made yet.
  const needed = counters(state, me)
    ? new Set<Action>()
    : playsReaching(state, actions, me, (s) => counters(s, me));
  return plays.filter((a) => {
    const c = player.hand.find(
      (h) => a.type === "playMonster" && h.instanceId === a.cardInstanceId,
    );
    const zone = c
      ? reachZone(state.cards[c.cardId]?.deckCardNumber ?? "")
      : null;
    return zone !== null && reach < zone && !needed.has(a);
  });
}

/** Rule 16: what a mode can change, public and private (zones, hands, piles, rage, monsters). */
function fingerprint(state: GameState): string {
  return JSON.stringify(
    state.players.map((p) => [
      p.hand.map((c) => c.instanceId),
      p.discard.length,
      p.deck.length,
      Object.values(p.zones).map((stacks) =>
        stacks.map((stack) => stack.map((c) => c.instanceId)),
      ),
      p.rage,
      p.monsterPosition,
    ]),
  );
}

/** Rule 18: Mecha-King Ghidorah, whose rank drops for each King Ghidorah card in your discard pile. */
const MECHA_KING = "EBP02-068";

/** Rule 18: answers every choice (anyone's) with its first option, back to a play timing. */
function settleAll(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 20 && s.pendingChoice && !s.result; i++) {
    const c = s.pendingChoice;
    const first = getLegalActions(s, c.player).find(
      (a) => a.type !== "concede",
    );
    if (!first) break;
    s = advanceToDecision(applyAction(s, first));
  }
  return s;
}

/** Rule 18: whether, from `s`, a Mecha-King Ghidorah can be played or the counter made this turn. */
function mechaKingOrCounter(s: GameState, me: PlayerId): boolean {
  if (s.result || s.turnPlayer !== me) return false;
  const legal = getLegalActions(s, me);
  const player = s.players.find((p) => p.id === me);
  const mechaKing = legal.some(
    (a) =>
      a.type === "playBattle" &&
      s.cards[
        player?.hand.find((c) => c.instanceId === a.cardInstanceId)?.cardId ??
          -1
      ]?.deckCardNumber === MECHA_KING,
  );
  return (
    mechaKing ||
    counters(s, me) ||
    playsReaching(s, legal, me, (x) => counters(x, me)).size > 0
  );
}

/** Rule 18: mill modes of my "choose one" while a mode makes the opponent discard. */
function millModes(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  const choice = state.pendingChoice;
  if (choice?.player !== me || choice.kind !== "option") return [];
  const mine = (s: GameState) => s.players.find((p) => p.id === me);
  const theirs = (s: GameState) => s.players.find((p) => p.id !== me);
  const before = { me: mine(state), them: theirs(state) };
  const discards: GameState[] = [];
  const mills: { action: Action; after: GameState }[] = [];
  for (const a of actions) {
    if (a.type !== "choose") continue;
    let after: GameState;
    try {
      after = advanceToDecision(applyAction(state, a));
    } catch {
      continue;
    }
    const them = theirs(after);
    const you = mine(after);
    if (!them || !you || !before.me || !before.them) continue;
    // The opponent answers a discard, or their hand shrinks.
    if (
      after.pendingChoice?.player === them.id ||
      them.hand.length < before.them.hand.length
    ) {
      discards.push(settleAll(after));
      continue;
    }
    // Only your own deck went to your discard pile.
    const settled = settleOwnChoices(after, me);
    const youNow = mine(settled);
    if (
      youNow &&
      youNow.deck.length < before.me.deck.length &&
      youNow.discard.length > before.me.discard.length &&
      youNow.hand.length === before.me.hand.length &&
      theirs(settled)?.hand.length === before.them.hand.length
    )
      mills.push({ action: a, after: settled });
  }
  if (discards.length === 0 || mills.length === 0) return [];
  const discardEnables = discards.some((s) => mechaKingOrCounter(s, me));
  return mills
    .filter(({ after }) => discardEnables || !mechaKingOrCounter(after, me))
    .map(({ action }) => action);
}

/** Rule 16: the modes of my "choose one" that change nothing, while another mode does something. */
function idleModes(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
): Action[] {
  const choice = state.pendingChoice;
  if (choice?.player !== me || choice.kind !== "option") return [];
  const before = fingerprint(state);
  const idle: Action[] = [];
  let useful = 0;
  for (const a of actions) {
    if (a.type !== "choose") continue;
    let after: GameState;
    try {
      after = settleOwnChoices(advanceToDecision(applyAction(state, a)), me);
    } catch {
      useful++;
      continue;
    }
    // The opponent answering (a discard) or any change is something.
    if (after.pendingChoice || after.result || fingerprint(after) !== before)
      useful++;
    else idle.push(a);
  }
  return useful > 0 ? idle : [];
}

/** Switches for checks of a card rule against its earlier form. */
export interface CardRulesOptions {
  /** #305: rule 7 takes the counter before the block (the default); false is the old rule 7. */
  counterFirst?: boolean;
}

/** The legal actions the card rules leave out, judged on `state` (the first determinization). */
export function cardRulesDead(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  /** The bot's own decklist (rule 6), when known. */
  own?: Decklist,
  options: CardRulesOptions = {},
): Set<Action> {
  const dead = new Set<Action>();
  for (const action of actions) {
    if (action.type !== "playMonster") continue;
    const card = state.players
      .find((p) => p.id === me)
      ?.hand.find((c) => c.instanceId === action.cardInstanceId);
    const data = card ? state.cards[card.cardId] : undefined;
    if (!data || !losesWithoutStrategy(data.deckCardNumber)) continue;
    let after: GameState;
    try {
      after = settleOwnChoices(
        advanceToDecision(applyAction(state, action)),
        me,
      );
    } catch {
      continue;
    }
    if (after.result) {
      if (after.result.winner !== me) dead.add(action);
      continue;
    }
    // The opponent answers something first: not judged.
    if (after.pendingChoice) continue;
    if (!strategyCovered(after, me)) dead.add(action);
  }
  for (const action of invadeIntoBlocker(state, actions, me)) dead.add(action);
  for (const action of columnPlays(state, actions, me)) dead.add(action);
  for (const action of recurringPlays(state, actions, me)) dead.add(action);
  for (const action of spentCounters(state, actions, me)) dead.add(action);
  for (const action of slowInvasions(state, actions, me, own)) dead.add(action);
  for (const action of zoneLimitedPlays(state, actions, me)) dead.add(action);
  for (const action of unsafeAdvances(state, actions, me)) dead.add(action);
  for (const action of weakEvolutions(state, actions, me)) dead.add(action);
  for (const action of earlyAwakenings(state, actions, me)) dead.add(action);
  for (const action of earlyRage(state, actions, me)) dead.add(action);
  for (const action of heldMonsters(state, actions, me)) dead.add(action);
  for (const action of idleModes(state, actions, me)) dead.add(action);
  for (const action of millModes(state, actions, me)) dead.add(action);
  for (const action of revengePlays(state, actions, me)) dead.add(action);
  // Rule 7: a way to make the counter (#305), else to block zone 8, is taken: every other move
  // waits (but an invasion that wins now), and it outranks the others' holds. (Rule 9 alone only
  // frees holds, in `rescuedPlays`.)
  const blocks = forcedPlays(state, actions, me, options);
  if (blocks.size > 0) {
    // The ways the other card rules leave standing; all of them only when they leave none.
    const kept = [...blocks].filter((a) => !dead.has(a));
    const taken = new Set(kept.length > 0 ? kept : blocks);
    for (const a of actions)
      if (!taken.has(a) && !winsNow(state, a, me)) dead.add(a);
    for (const a of taken) dead.delete(a);
  }
  return dead;
}

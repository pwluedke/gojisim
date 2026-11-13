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
 * 4. #259: a card that plays itself from the discard pile (King Ghidorah (1998) EBP03-063) comes
 *    back whenever there's an empty zone (its optional play is answered yes), into an empty zone;
 *    and a destroy of the opponent's cards leaves their recurring cards for last (they come back),
 *    taking a card that stays gone when it can.
 * 5. #254: a counter-only strategy (Godzilla vs. Destoroyah EBP01-062: +10,000 total counter power)
 *    is played only when it's needed: not while the counter is already made without it (7.4.3),
 *    and not when even with it (and the others in hand) the counter isn't made.
 * 6. #248: a slow counter deck (`SLOW_DECK_MONSTERS` or fewer monster cards in its main deck, Ian:
 *    the Wrangler has 4) doesn't invade unless the invasion wins the game now: it hasn't the
 *    threat to live in the high zones, and an invasion ends its turn in reach of a push.
 * 7. #265: with your zone 8 open and the opponent's monster in reach of it (zone 6 or beyond),
 *    when some plays this turn put a battle card in your zone 8, take one: those plays stay even
 *    where another rule holds them (#265: the held monster cards whose rage discards make
 *    Godzilla Against Mechagodzilla playable), and every other move waits (passing too), but an
 *    invasion that wins now.
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
    const tiers: ((z: ZoneNumber) => boolean)[] = [
      (z) => inColumn(z) && empty(z),
      (z) => inColumn(z),
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
): Set<Action> {
  const blocks = blockingPlays(state, actions, me);
  if (blocks.size > 0) return blocks;
  const dead = cardRulesDead(state, actions, me, own);
  return new Set(
    [...counterPlays(state, actions, me)].filter((a) => !dead.has(a)),
  );
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
): Set<Action> {
  const opponent = state.players.find((p) => p.id !== me);
  if (
    state.pendingChoice ||
    state.turnPlayer !== me ||
    blocked(state, me) ||
    (opponent?.monsterPosition ?? 1) < 6
  )
    return new Set();
  return playsReaching(state, actions, me, (s) => blocked(s, me));
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

/** The legal actions the card rules leave out, judged on `state` (the first determinization). */
export function cardRulesDead(
  state: GameState,
  actions: readonly Action[],
  me: PlayerId,
  /** The bot's own decklist (rule 6), when known. */
  own?: Decklist,
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
  // Rule 7: a way to block zone 8 is taken: every other move waits (but an invasion that wins
  // now), and it outranks the others' holds. (Rule 9 only frees holds, in `rescuedPlays`.)
  const blocks = blockingPlays(state, actions, me);
  if (blocks.size > 0) {
    for (const a of actions)
      if (!blocks.has(a) && !winsNow(state, a, me)) dead.add(a);
    for (const a of blocks) dead.delete(a);
  }
  return dead;
}

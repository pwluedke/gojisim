import { getCardAbilities, getCardTraits } from "@gojisim/cards";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  counterPowerOf,
  type GameState,
  getLegalActions,
  getThreat,
  isBattle,
  type PlayerId,
  type PlayerState,
  sameColumn,
  type ZoneNumber,
} from "@gojisim/engine";

/**
 * Paul's play rules for Hard (#175, Nov 2), from the #170 SpaceGodzilla study. Read from card
 * conditions, never card names, so they apply to every deck. They act only at the search root,
 * like M13a's pruning: judged once per decision on the first determinization from public
 * information (the bot's own hand, both boards). Hard rules leave actions out (`dead`); soft ones
 * give a root action a prior bonus (`bonus`, added to its `priorVisits` value). Play-outs and the
 * evaluation are unchanged.
 *
 * 1. Stack a same-rank monster card (8.5.1) when a card wants a stack size it doesn't have yet.
 * 2. Hold one monster card per rank that can still be played on top for its ability (#189: also
 *    when a cost is paid by discarding from hand, 5.7.1).
 * 3. Discard every other monster card for rage (8.4.1): no pass while one can go.
 * 4. Counter-only strategies: held until the counter is made (with the others still playable),
 *    then preferred (a prior: one if one makes it, both if it takes two).
 * 5. "Same column as the opponent's monster" battle cards go in that column.
 * 6. Zone-boosted battle cards go in their zone (a prior; never away from an open own zone 8
 *    while the opponent can invade next turn).
 */

/** The prior bonus a rule-preferred root action gets, in evaluation units. */
export const RULE_BONUS = 0.15;

type Json = Record<string, unknown>;
type Card = GameState["cards"][number];

const abilitiesOf = (card: Card | undefined): Json[] =>
  card
    ? (getCardAbilities(card.deckCardNumber).abilities as unknown as Json[])
    : [];

/** Every object nested anywhere in an ability (conditions sit at several depths). */
function nested(value: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(value)) for (const v of value) nested(v, out);
  else if (value && typeof value === "object") {
    out.push(value as Json);
    for (const v of Object.values(value)) nested(v, out);
  }
  return out;
}

function players(state: GameState, id: PlayerId): [PlayerState, PlayerState] {
  const me = state.players.find((p) => p.id === id);
  const other = state.players.find((p) => p.id !== id);
  if (!me || !other) throw new Error(`Unknown player ${id}`);
  return [me, other];
}

const topOf = <T>(stack: readonly T[]): T | undefined =>
  stack[stack.length - 1];

const cardOf = (
  state: GameState,
  c: CardInstance | undefined,
): Card | undefined => (c ? state.cards[c.cardId] : undefined);

const handCard = (me: PlayerState, id: string | undefined) =>
  id ? me.hand.find((c) => c.instanceId === id) : undefined;

const actionCard = (a: Action): string | undefined =>
  (a as { cardInstanceId?: string }).cardInstanceId;

// ---------------------------------------------------------------------------------------------
// Card conditions

/** Rule 1: the stack sizes a card's abilities ask for (`count under stackOf … ≥ N`). */
export function stackWants(card: Card | undefined): number[] {
  return nested(abilitiesOf(card)).flatMap((o) => {
    const count = o["count"] as Json | undefined;
    return count &&
      count["area"] === "under" &&
      (count["stackOf"] === "this" || count["stackOf"] === "yourMonster") &&
      (o["op"] === ">=" || o["op"] === "==") &&
      typeof o["value"] === "number"
      ? [o["value"] as number]
      : [];
  });
}

/** Rule 4: a strategy whose only abilities change counter power (God of Destruction's Counterattack). */
export function counterOnly(card: Card | undefined): boolean {
  const abilities = abilitiesOf(card);
  return (
    card?.type === "Strategy" &&
    abilities.length > 0 &&
    abilities.every(
      (a) =>
        a["kind"] === "continuous" &&
        ((a["modifiers"] as Json[] | undefined) ?? []).every(
          (m) =>
            m["stat"] === "totalCounterPower" || m["stat"] === "counterPower",
        ),
    )
  );
}

/** Rule 5: a card that works in the same column as the opponent's monster. */
export function columnCard(card: Card | undefined): boolean {
  return nested(abilitiesOf(card)).some(
    (o) => o["relation"] === "sameColumnAs" && o["of"] === "opponentMonster",
  );
}

/** Rule 6: the zones a card is boosted in (`zoneOf this in [zones]`), or none. */
export function boostedZones(card: Card | undefined): ZoneNumber[] {
  for (const o of nested(abilitiesOf(card)))
    if (o["zoneOf"] === "this" && Array.isArray(o["in"]))
      return o["in"] as ZoneNumber[];
  return [];
}

// ---------------------------------------------------------------------------------------------
// The board

/** Whether `player`'s counter succeeds now (7.4.3: total counter power at least the threat). */
function counters(state: GameState, player: PlayerId): boolean {
  const [me, opponent] = players(state, player);
  return counterPowerOf(state, me) >= getThreat(state, opponent.id);
}

/**
 * Rule 2: the monster cards in hand to hold: each has its own ability, shares a trait with the
 * invading monster and has a rank at or above it, so it can still be played on top (8.5.1). At
 * most one per rank (Monarch): extra copies go to rage.
 */
export function heldCards(state: GameState, me: PlayerState): Set<string> {
  const active = cardOf(state, topOf(me.invadingMonsterZone));
  const held = new Set<string>();
  if (!active || active.rank === null) return held;
  const traits = new Set(getCardTraits(active));
  const ranks = new Set<number>();
  for (const c of [...me.hand].sort((a, b) =>
    a.instanceId.localeCompare(b.instanceId),
  )) {
    const data = cardOf(state, c);
    if (
      data?.type !== "Monster" ||
      data.rank === null ||
      data.rank < active.rank ||
      abilitiesOf(data).length === 0 ||
      !getCardTraits(data).some((t) => traits.has(t)) ||
      ranks.has(data.rank)
    )
      continue;
    ranks.add(data.rank);
    held.add(c.instanceId);
  }
  return held;
}

/** Rule 1: whether a card in play, in hand or in the monster deck wants a bigger stack. */
function stackWanted(state: GameState, me: PlayerState): boolean {
  const under = me.invadingMonsterZone.length - 1;
  const cards = [
    ...me.invadingMonsterZone,
    ...me.hand,
    ...me.monsterDeck,
    ...Object.values(me.zones).flat(2),
  ];
  return cards.some((c) => stackWants(cardOf(state, c)).some((n) => under < n));
}

/** Rule 4: the counter is made with this strategy and the counter-only ones still playable. */
function counterMadeWith(
  state: GameState,
  action: Action,
  player: PlayerId,
): boolean {
  let s = advanceToDecision(applyAction(state, action));
  if (s.result !== null) return true;
  for (let n = 0; n < 4 && !counters(s, player); n++) {
    if (s.pendingChoice) break;
    const [me] = players(s, player);
    const next = getLegalActions(s, player).find(
      (a) =>
        a.type === "activateStrategy" &&
        counterOnly(cardOf(s, handCard(me, a.cardInstanceId))),
    );
    if (!next) break;
    s = advanceToDecision(applyAction(s, next));
    if (s.result !== null) return true;
  }
  return counters(s, player);
}

/** Rule 6's exception: your zone 8 has no battle card and the opponent's monster can reach it next turn. */
function zone8Exposed(
  state: GameState,
  me: PlayerState,
  opponent: PlayerState,
) {
  const blocked = me.zones[8].some((stack) =>
    isBattle(cardOf(state, topOf(stack))),
  );
  return !blocked && (opponent.monsterPosition ?? 1) >= 6;
}

export interface RuleVerdict {
  /** Root action keys left out (hard rules), as long as another action stays. */
  dead: Set<string>;
  /** Root action keys with a prior bonus (soft rules). */
  bonus: Map<string, number>;
}

/** Paul's rules on the root's actions for `player` (#175). */
export function applyRules(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
  keyOf: (action: Action) => string,
): RuleVerdict {
  const dead = new Set<string>();
  const bonus = new Map<string, number>();
  const choice = state.pendingChoice;
  // #189, rule 2 in choices: a cost paid by discarding from hand (5.7.1) leaves the held cards
  // while another option stays (another card, or declining the cost).
  if (choice) {
    if (choice.player !== player || choice.rule !== "5.7.1")
      return { dead, bonus };
    const [me] = players(state, player);
    const held = heldCards(state, me);
    for (const a of actions)
      if (a.type === "choose" && held.has(a.optionId)) dead.add(keyOf(a));
    const alive = actions.filter((a) => !dead.has(keyOf(a)));
    return { dead: alive.length > 0 ? dead : new Set(), bonus };
  }
  if (state.turnPlayer !== player) return { dead, bonus };
  const [me, opponent] = players(state, player);
  const held = heldCards(state, me);
  const monster = (a: Action) => cardOf(state, handCard(me, actionCard(a)));
  const add = (a: Action) => bonus.set(keyOf(a), RULE_BONUS);

  // Rule 2: a held card isn't paid for rage, nor for an invasion while another card can pay.
  const invades = actions.filter((a) => a.type === "invade");
  for (const a of actions) {
    const id = actionCard(a);
    if (!id || !held.has(id)) continue;
    if (a.type === "gainRage") dead.add(keyOf(a));
    if (
      a.type === "invade" &&
      invades.some((b) => !held.has(actionCard(b) ?? ""))
    )
      dead.add(keyOf(a));
  }
  // Rules 1 and 2: stacking, when a card wants the stack size or the card is held for its ability.
  const wanted = stackWanted(state, me);
  for (const a of actions)
    if (a.type === "playMonster" && (wanted || held.has(a.cardInstanceId)))
      add(a);
  // Rule 3: no pass while a monster card that isn't held can go to rage.
  if (
    actions.some(
      (a) =>
        a.type === "gainRage" &&
        monster(a)?.type === "Monster" &&
        !held.has(a.cardInstanceId),
    )
  )
    for (const a of actions) if (a.type === "pass") dead.add(keyOf(a));
  // Rule 4: a counter-only strategy is held while the counter isn't made, even with the others
  // still playable (a prune); when it is made, playing it is preferred (a prior: early on, the
  // search may still build the board first, Paul). #189: while the turn's invasion is still
  // legal, it waits for it (the invasion can crush the cards that make the counter), and the
  // prior goes to the invasion instead.
  const invasions = actions.filter(
    (a) => a.type === "invade" || a.type === "invadeFromDeck",
  );
  for (const a of actions) {
    if (a.type !== "activateStrategy" || !counterOnly(monster(a))) continue;
    if (!counterMadeWith(state, a, player)) dead.add(keyOf(a));
    else if (invasions.length === 0) add(a);
    else {
      dead.add(keyOf(a));
      for (const i of invasions) add(i);
    }
  }
  // Rule 5: same-column cards in the opponent's monster column (the next one if a copy holds it).
  const oppAt = opponent.monsterPosition;
  if (oppAt !== null)
    for (const a of actions) {
      if (a.type !== "playBattle" || !columnCard(monster(a))) continue;
      const number = monster(a)?.deckCardNumber;
      const inColumn = (zone: ZoneNumber, at: ZoneNumber) =>
        sameColumn({ player, zone }, { player: opponent.id, zone: at });
      const copyThere = Object.entries(me.zones).some(
        ([z, stacks]) =>
          inColumn(Number(z) as ZoneNumber, oppAt) &&
          stacks.some(
            (s) => cardOf(state, topOf(s))?.deckCardNumber === number,
          ),
      );
      const target = (copyThere ? Math.min(8, oppAt + 1) : oppAt) as ZoneNumber;
      const plays = actions.filter(
        (b) => b.type === "playBattle" && monster(b)?.deckCardNumber === number,
      ) as Extract<Action, { type: "playBattle" }>[];
      if (
        plays.some((b) => inColumn(b.zone, target)) &&
        !inColumn(a.zone, target)
      )
        dead.add(keyOf(a));
    }
  // Rule 6: zone-boosted cards toward their zone (a prior), but never away from an open zone 8.
  const exposed = zone8Exposed(state, me, opponent);
  for (const a of actions) {
    if (a.type !== "playBattle") continue;
    const zones = boostedZones(monster(a));
    if (zones.length === 0 || !zones.includes(a.zone)) continue;
    if (exposed && a.zone !== 8) continue;
    add(a);
  }
  // Every hard rule leaves at least one action.
  const alive = actions.filter((a) => !dead.has(keyOf(a)));
  return { dead: alive.length > 0 ? dead : new Set(), bonus };
}

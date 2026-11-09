import { getCardAbilities } from "@gojisim/cards";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  cloneState,
  counterPowerOf,
  type GameState,
  getCounterPower,
  getRank,
  getThreat,
  isBattle,
  type PlayerId,
  type PlayerState,
  type ZoneNumber,
} from "@gojisim/engine";
import { makesCounter } from "./cfPlan";

/**
 * Paul's Monster X plan (`mxPlan=1`, Nov 7, 2026), part of the Hard rules layer, active only when
 * the bot's monster deck is Monster X. Every prune keeps one move; numbers are the plan's rules.
 * - 1: on turn 1, a battle card into your zones comes before any other play.
 * - 2: battle cards: one that adds a new color in your zones over higher counter power, to 4.
 * - 3: invading, pay with a battle card of a color not yet in your discard pile, to 4.
 * - 4: turns 1-3, rank 3 or lower battle cards before rank 4 or higher.
 * - 5, 6: Entangling Fear when the end-phase advance would take the monster from zone 5 to 6
 *   (stay in zones 3-5); never on a turn it invades.
 * - 7: Godzilla Final Wars only with 1 or fewer battle cards in your zones, or with a [final-wars]
 *   battle card left in the deck stronger than the weakest of them (it can cover it).
 * - 8: no rage discards, except a monster card ranked below the monster's current rank.
 * - 9: invade only when (a) the invasion wins the game this turn, (b) late, with the opponent
 *   knocked back, (c) in a race you can't stop, or (d) invading wins sooner (`invadeReason`).
 * - 10: Godzilla Landing before the counter when the opponent's monster is in zone 7.
 * - 11: Godzilla Captured! only when the reset makes this turn's counter, and then before it.
 * - 12: no Evolution of the Monster X battle card into Kaizer Ghidorah while it is your only blue
 *   battle card in your zones.
 * - 13: Godzilla and its son on Monster Island only when zones 1-5 all hold battle cards.
 * - 14: vs King Ghidorah, keep the last removal that can hit Mecha-King Ghidorah until it lands.
 * Final Wars placement (Paul's ruling, Nov 7) is `finalWarsDead`, for every deck.
 */
const MONSTER_X = "Monster X";
const MONSTER_X_BATTLE = "EBP04-047";
const MONSTER_X_EVOLUTION = "EBP04-047#evolution";
const ENTANGLING_FEAR = "EBP04-081";
const FINAL_WARS = "EBP04-079";
const FINAL_WARS_PLAY = "EBP04-079#reveal-play";
const LANDING = "EBP01-030";
const CAPTURED = "EBP03-079";
const MONSTER_ISLAND = "EBP01-080";
const MECHA_KING = "EBP02-068";
/** Removal in the Monster X deck that can destroy Mecha-King Ghidorah (rule 14). */
const MECHA_KING_REMOVAL = new Set([
  "EBP01-064", // Godzilla vs. Megaguirus: the zone wipe, with 4+ battle cards
  "EBP04-035", // Kaizer Ghidorah (rank 4): the wipe from the lowest zone
]);
const TARGET_COLORS = 4;
const ZONES: readonly ZoneNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];
/** Choices a simulated action may answer before it gives up. */
const MAX_CHOICES = 30;

const cardData = (state: GameState, card: CardInstance | undefined) =>
  card ? state.cards[card.cardId] : undefined;

/** The battle card on top of each of a player's zones that holds one. */
function battleTops(
  state: GameState,
  player: PlayerState,
): { zone: ZoneNumber; card: CardInstance }[] {
  const out: { zone: ZoneNumber; card: CardInstance }[] = [];
  for (const zone of ZONES)
    for (const stack of player.zones[zone]) {
      const top = stack.at(-1);
      if (top && isBattle(cardData(state, top))) out.push({ zone, card: top });
    }
  return out;
}

/** The colors among a set of cards (White counts). */
function colorsOf(state: GameState, cards: CardInstance[]): Set<string> {
  return new Set(cards.flatMap((c) => cardData(state, c)?.colors ?? []));
}

/** The player's turn count: 1 on their first turn (the turns alternate). */
export function ownTurn(state: GameState): number {
  return Math.floor((state.turn + 1) / 2);
}

/** Whether a player's monster deck is Monster X: a [monster-x] rank 1 monster. */
export function isMonsterXDeck(state: GameState, player: PlayerState): boolean {
  return [...player.invadingMonsterZone, ...player.monsterDeck].some((c) => {
    const data = cardData(state, c);
    return data?.type === "Monster" && data.name === MONSTER_X;
  });
}

/** Plays an action out, answering its choices with the first option. */
function playOut(state: GameState, action: Action): GameState | null {
  try {
    let s = advanceToDecision(applyAction(state, action));
    for (let i = 0; i < MAX_CHOICES && s.pendingChoice && !s.result; i++) {
      const c = s.pendingChoice;
      const option = c.options.find((o) => o.id !== "done") ?? c.options[0];
      if (!option) break;
      s = advanceToDecision(
        applyAction(s, {
          type: "choose",
          player: c.player,
          choiceId: c.id,
          optionId: option.id,
        }),
      );
    }
    return s;
  } catch {
    return null;
  }
}

/**
 * Godzilla Final Wars' zone picks (Paul's ruling, Nov 7): the revealed cards go where the total
 * counter power is highest once all are played. Each option of the pick is played out with the
 * later picks on the weakest zone left (empty first); ties keep the most battle cards in zones.
 */
export function finalWarsDead(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
): Set<Action> {
  const dead = new Set<Action>();
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.player !== player ||
    choice.kind !== "zone" ||
    !choice.options.some((o) => o.abilityId === FINAL_WARS_PLAY)
  )
    return dead;
  const weakest = (s: GameState): string | undefined => {
    const c = s.pendingChoice;
    const me = s.players.find((p) => p.id === player);
    if (!c || !me) return undefined;
    let best: { id: string; power: number } | null = null;
    for (const o of c.options) {
      const zone = Number(o.id.split(":")[1]) as ZoneNumber;
      const tops = me.zones[zone]
        .map((st) => st.at(-1))
        .filter((t): t is CardInstance => !!t && isBattle(cardData(s, t)));
      // An empty zone first: covering a card loses a battle card in zones.
      const power =
        tops.length === 0
          ? -1
          : Math.min(...tops.map((t) => getCounterPower(s, t)));
      if (!best || power < best.power) best = { id: o.id, power };
    }
    return best?.id;
  };
  const scores = new Map<Action, [number, number]>();
  for (const action of actions) {
    if (action.type !== "choose") continue;
    try {
      let s = advanceToDecision(applyAction(state, action));
      for (
        let i = 0;
        i < MAX_CHOICES &&
        s.pendingChoice?.player === player &&
        s.pendingChoice.kind === "zone" &&
        s.pendingChoice.options.some((o) => o.abilityId === FINAL_WARS_PLAY);
        i++
      ) {
        const id = weakest(s);
        if (!id) break;
        s = advanceToDecision(
          applyAction(s, {
            type: "choose",
            player,
            choiceId: s.pendingChoice.id,
            optionId: id,
          }),
        );
      }
      const me = s.players.find((p) => p.id === player);
      if (me)
        scores.set(action, [counterPowerOf(s, me), battleTops(s, me).length]);
    } catch {
      // A pick that can't be played out stays for the search.
    }
  }
  const best = [...scores.values()].reduce<[number, number] | null>(
    (b, v) => (!b || v[0] > b[0] || (v[0] === b[0] && v[1] > b[1]) ? v : b),
    null,
  );
  if (!best) return dead;
  for (const [action, [power, cards]] of scores)
    if (power < best[0] || (power === best[0] && cards < best[1]))
      dead.add(action);
  return dead;
}

/** Whether a card's ability data has an effect that destroys an opponent's battle card. */
function destroysOpponentBattle(deckCardNumber: string): boolean {
  const data = getCardAbilities(deckCardNumber);
  if (data.status === "manual") return false;
  const text = JSON.stringify(data.abilities);
  return (
    text.includes('"effect":"destroy"') && text.includes('"owner":"opponent"')
  );
}

/**
 * Your threat at your next rank: the strongest next-rank monster in your monster deck put on top
 * of a copy of the game, at 0 rage (it resets, 7.2.4); at rank 4, your monster as it is.
 */
function threatAtNextRank(state: GameState, me: PlayerState): number {
  const rank = cardData(state, me.invadingMonsterZone.at(-1))?.rank ?? 0;
  const next = me.monsterDeck.filter((c) => {
    const data = cardData(state, c);
    return data?.type === "Monster" && data.rank === rank + 1;
  });
  const threats = (next.length > 0 ? next : [null]).map((card) => {
    const copy = cloneState(state);
    const p = copy.players.find((x) => x.id === me.id) as PlayerState;
    if (card) p.invadingMonsterZone = [...p.invadingMonsterZone, card];
    p.rage = 0;
    return getThreat(copy, me.id);
  });
  return Math.max(...threats);
}

/**
 * Your turns to win by invading: each turn the invasion advances the best invasion icon in your
 * hand, then the end phase 1 more up to zone 8 (7.5.2); it wins once an invasion steps out of
 * zone 8 (5.13.1.1.2). Never while the opponent's zone 8 holds a battle card.
 */
export function turnsToInvade(
  state: GameState,
  me: PlayerState,
  opponent: PlayerState,
): number {
  if (battleTops(state, opponent).some((t) => t.zone === 8)) return Infinity;
  const icon = Math.max(
    0,
    ...me.hand.map((c) => cardData(state, c)?.invadeZones ?? 0),
  );
  if (icon === 0 || me.monsterPosition === null) return Infinity;
  let zone: number = me.monsterPosition;
  for (let turns = 1; turns <= 10; turns++) {
    if (zone + icon > 8) return turns;
    zone = Math.min(8, zone + icon + 1);
  }
  return Infinity;
}

/**
 * Your turns to win by countering: a monster is out once its rank 4 is countered (5.15.1.2), so a
 * rank r monster needs 5 - r more counters, one a turn, plus a turn while your counter power
 * doesn't reach its threat yet (7.4.3).
 */
export function turnsToCounter(
  state: GameState,
  me: PlayerState,
  opponent: PlayerState,
): number {
  const rank = cardData(state, opponent.invadingMonsterZone.at(-1))?.rank ?? 1;
  const now = counterPowerOf(state, me) >= getThreat(state, opponent.id);
  return Math.max(1, 5 - rank) + (now ? 0 : 1);
}

/**
 * Rule 9's reasons to invade other than a win this turn (a): (b) late with the opponent knocked
 * back (your monster rank 3 or 4, theirs in zone 3 or lower); (c) a race: their 2 or more battle
 * cards' counter power already reaches your threat at your next rank and no card in your hand
 * destroys their battle cards; (d) invading wins in fewer of your turns than countering. Else `null`.
 */
export function invadeReason(
  state: GameState,
  me: PlayerState,
  opponent: PlayerState,
): "b" | "c" | "d" | null {
  const rank = cardData(state, me.invadingMonsterZone.at(-1))?.rank ?? 0;
  if (
    (rank === 3 || rank === 4) &&
    opponent.monsterPosition !== null &&
    opponent.monsterPosition <= 3
  )
    return "b";
  // A big board: 2 or more battle cards (with 1 or fewer, Monster X can't be countered).
  if (
    battleTops(state, opponent).length >= 2 &&
    counterPowerOf(state, opponent) >= threatAtNextRank(state, me) &&
    !me.hand.some((c) =>
      destroysOpponentBattle(cardData(state, c)?.deckCardNumber ?? ""),
    )
  )
    return "c";
  if (turnsToInvade(state, me, opponent) < turnsToCounter(state, me, opponent))
    return "d";
  return null;
}

/** The actions Paul's Monster X plan rules out. */
export function mxPlanDead(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
): Set<Action> {
  return new Set(mxPlanVerdict(state, actions, player).keys());
}

/**
 * The actions Paul's Monster X plan argues against, each with the first rule that does. The
 * search favors the others (a preference, not a prune: `ismcts.ts`).
 */
export function mxPlanVerdict(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
): Map<Action, number> {
  const dead = new Map<Action, number>();
  const kill = (a: Action, rule: number) => {
    if (!dead.has(a)) dead.set(a, rule);
  };
  const me = state.players.find((p) => p.id === player);
  const opponent = state.players.find((p) => p.id !== player);
  if (!me || !opponent || !isMonsterXDeck(state, me)) return dead;
  const tops = battleTops(state, me);
  const choice = state.pendingChoice;
  if (choice) {
    // Rule 12: Evolution (12.6) would cover the only blue battle card in your zones.
    const blue = tops.filter((t) =>
      (cardData(state, t.card)?.colors ?? []).includes("Blue"),
    );
    if (
      choice.player === player &&
      choice.kind === "confirm" &&
      choice.options.some((o) => o.abilityId === MONSTER_X_EVOLUTION) &&
      blue.length === 1 &&
      cardData(state, blue[0]?.card)?.deckCardNumber === MONSTER_X_BATTLE
    )
      for (const a of actions)
        if (a.type === "choose" && a.optionId === "yes") kill(a, 12);
    return dead;
  }
  if (state.turnPlayer !== player) return dead;
  const handCard = (id: string | undefined) =>
    me.hand.find((c) => c.instanceId === id);
  const numberOf = (id: string | undefined) =>
    cardData(state, handCard(id))?.deckCardNumber;
  const strategies = (number: string) =>
    actions.filter(
      (a) =>
        a.type === "activateStrategy" && numberOf(a.cardInstanceId) === number,
    );
  const turn = ownTurn(state);

  // Rule 9: invade only for (b), (c) or (d), or when the invasion wins the game this turn (a).
  const invades = actions.filter(
    (a) => a.type === "invade" || a.type === "invadeFromDeck",
  );
  if (invadeReason(state, me, opponent) === null)
    for (const a of invades)
      if (playOut(state, a)?.result?.winner !== player) kill(a, 9);
  // Rule 3: pay with a battle card of a color not yet in the discard pile, up to 4 colors.
  const discardColors = colorsOf(
    state,
    me.discard.filter((c) => isBattle(cardData(state, c))),
  );
  if (discardColors.size < TARGET_COLORS) {
    const live = invades.filter(
      (a): a is Extract<Action, { type: "invade" }> =>
        a.type === "invade" && !dead.has(a),
    );
    const adds = (a: Extract<Action, { type: "invade" }>) => {
      const data = cardData(state, handCard(a.cardInstanceId));
      return (
        isBattle(data) &&
        (data?.colors ?? []).some((c) => !discardColors.has(c))
      );
    };
    if (live.some(adds)) for (const a of live) if (!adds(a)) kill(a, 3);
  }

  // Rule 1: turn 1, a battle card before any other play.
  const plays = actions.filter(
    (a): a is Extract<Action, { type: "playBattle" }> =>
      a.type === "playBattle",
  );
  if (turn === 1 && tops.length === 0 && plays.length > 0)
    for (const a of actions)
      if (a.type !== "playBattle" && a.type !== "concede") kill(a, 1);

  // Rule 4: turns 1-3, rank 3 or lower battle cards before rank 4 or higher.
  const rankOf = (a: Extract<Action, { type: "playBattle" }>) => {
    const card = handCard(a.cardInstanceId);
    return card ? (getRank(state, card) ?? 0) : 0;
  };
  if (turn <= 3 && plays.some((a) => rankOf(a) <= 3))
    for (const a of plays) if (rankOf(a) >= 4) kill(a, 4);
  // Rule 2: a battle card that adds a new color in your zones, up to 4 colors.
  const colorsNow = colorsOf(
    state,
    tops.map((t) => t.card),
  );
  if (colorsNow.size < TARGET_COLORS) {
    const after = (a: Extract<Action, { type: "playBattle" }>) => {
      const card = handCard(a.cardInstanceId);
      // The played card tops its zone, on top or overloading (3.2.5, 11.5).
      const rest = tops.filter((t) => t.zone !== a.zone).map((t) => t.card);
      return colorsOf(state, card ? [...rest, card] : rest).size;
    };
    const live = plays.filter((a) => !dead.has(a));
    if (live.some((a) => after(a) > colorsNow.size))
      for (const a of live) if (after(a) <= colorsNow.size) kill(a, 2);
  }

  // Rule 7: Final Wars with 1 or fewer battle cards in zones, or a stronger card to cover with.
  const finalWars = strategies(FINAL_WARS);
  if (finalWars.length > 0 && tops.length > 1) {
    const weakest = Math.min(
      ...tops.map((t) => getCounterPower(state, t.card)),
    );
    const colors = Math.max(colorsNow.size, 1);
    const coverWith = me.deck
      .map((c) => cardData(state, c))
      .filter((d) => isBattle(d) && (d?.traits ?? []).includes("Final Wars"))
      // A Monster X's X counter power: 3,000 a color.
      .map((d) =>
        (d?.counterOrThreat ?? 0) < 0
          ? 3000 * colors
          : (d?.counterOrThreat ?? 0),
      );
    if (!coverWith.some((cp) => cp > weakest))
      for (const a of finalWars) kill(a, 7);
  }

  // Rules 5 and 6: Entangling Fear when the end-phase advance (7.5.2) would take the monster from
  // zone 5 to 6, and then before the main phase ends; never on a turn it invades.
  const fear = strategies(ENTANGLING_FEAR);
  const invading = invades.some((a) => !dead.has(a));
  const feared = me.strategyZones
    .flat()
    .some((x) => cardData(state, x.card)?.deckCardNumber === ENTANGLING_FEAR);
  if (fear.length > 0 && me.monsterPosition === 5 && !invading && !feared) {
    for (const a of actions) if (a.type === "pass") kill(a, 5);
  } else {
    for (const a of fear) kill(a, 5);
  }

  // Rule 8: no rage discards (8.4), except a monster card ranked below the monster's current rank,
  // which can't be stacked on it any more (8.5.1).
  const current = cardData(state, me.invadingMonsterZone.at(-1))?.rank ?? 0;
  for (const a of actions)
    if (
      a.type === "gainRage" &&
      (cardData(state, handCard(a.cardInstanceId))?.rank ?? 0) >= current
    )
      kill(a, 8);

  // Rule 10: Landing first when the opponent's monster is in 7 and the counter is made.
  const counters = counterPowerOf(state, me) >= getThreat(state, opponent.id);
  if (
    opponent.monsterPosition === 7 &&
    counters &&
    strategies(LANDING).length > 0
  )
    for (const a of actions) if (a.type === "pass") kill(a, 10);

  // Rule 11: Captured! only when the reset makes this turn's counter; then before the counter.
  for (const a of strategies(CAPTURED)) {
    if (!makesCounter(state, a, me)) {
      kill(a, 11);
      continue;
    }
    for (const b of actions) if (b.type === "pass") kill(b, 11);
  }

  // Rule 13: Monster Island only when zones 1-5 all hold battle cards.
  if (!([1, 2, 3, 4, 5] as const).every((z) => tops.some((t) => t.zone === z)))
    for (const a of strategies(MONSTER_ISLAND)) kill(a, 13);

  // Rule 14: vs King Ghidorah, the last removal that can hit Mecha-King Ghidorah stays in hand
  // until it lands.
  const vsKingGhidorah = opponent.invadingMonsterZone.some((c) =>
    (cardData(state, c)?.name ?? "").includes("King Ghidorah"),
  );
  const landed = ZONES.some((z) =>
    opponent.zones[z].some((st) =>
      st.some((c) => cardData(state, c)?.deckCardNumber === MECHA_KING),
    ),
  );
  const removal = me.hand.filter((c) =>
    MECHA_KING_REMOVAL.has(cardData(state, c)?.deckCardNumber ?? ""),
  );
  if (vsKingGhidorah && !landed && removal.length === 1) {
    const last = removal[0]?.instanceId;
    for (const a of actions)
      if (
        ("cardInstanceId" in a &&
          a.cardInstanceId === last &&
          // An invasion that wins (rule 9) may pay with it.
          !(a.type === "invade" && !dead.has(a))) ||
        (a.type === "playBattle" && a.costCardInstanceId === last)
      )
        kill(a, 14);
  }
  return dead;
}

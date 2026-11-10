import { getCardAbilities } from "@gojisim/cards";
import {
  type Action,
  type CardInstance,
  counterPowerOf,
  type GameState,
  getCounterPower,
  getThreat,
  isBattle,
  type PlayerId,
  type PlayerState,
} from "@gojisim/engine";
import { makesCounter } from "./cfPlan";
import {
  battleTops,
  CAPTURED,
  cardData,
  colorsOf,
  ENTANGLING_FEAR,
  FINAL_WARS,
  isMonsterXDeck,
  LANDING,
  MECHA_KING,
  MECHA_KING_REMOVAL,
  MONSTER_ISLAND,
  MONSTER_X_BATTLE,
  MONSTER_X_EVOLUTION,
  ownTurn,
  playOut,
  TARGET_COLORS,
  turnsToCounter,
  turnsToInvade,
  ZONES,
} from "./mxPlan";

/**
 * Paul's Monster X plan, v2 (`mxPlan=2`, Nov 9, 2026: the play guide's edit), in place of v1
 * where they differ. As v1, a preference, never a prune: each rule argues against moves, and the
 * search favors the others (`mxPlanFavored`). "Early" is the player's own turns 1-4.
 * - 1: early, play your hand: no pass while a battle card can be played; a battle card that adds
 *   a new color in your zones beats a stronger one, up to 4 colors.
 * - 2: don't destroy your own battle cards (a play onto an occupied zone), unless the covered card
 *   is weaker and its color is missing from your discard pile, or the new card's from your zones.
 * - 3: invading, pay with a battle card of a color not yet in your discard pile, up to 4, and not
 *   with a key card (the plan's strategy cards).
 * - 4, 5: Entangling Fear whenever it can be cast, to stay back (zones 3-5); never on a turn you
 *   invade.
 * - 6: early, discard monster cards for rage while you have them.
 * - 7: rank 4: Kaizer Ghidorah EBP04-035 only when its destruction is needed (it destroys 2+
 *   battle cards or the opponent's zone 8 card), then EBP04-036 back on top.
 * - 8: Godzilla Final Wars with 2 or fewer battle cards in your zones, or when your zones can't
 *   make this turn's counter.
 * - 9: Godzilla Landing whenever it can be cast.
 * - 10: Godzilla Captured! only when this turn's counter can't be made otherwise: no battle card or
 *   other strategy you can play makes it, and the reset does.
 * - 11: Kaizer Ghidorah EBP04-068 in zones 1-3 or 8; no Evolution of the Monster X battle card
 *   into it while that's your only blue battle card or has more counter power.
 * - 12: Godzilla and its son on Monster Island when zones 1-5 all hold battle cards, or ahead of an
 *   expected board wipe.
 * - 13: vs King Ghidorah, the last removal for Mecha-King Ghidorah stays until it lands; from
 *   their rank 3 (your next counter puts them on rank 4), Monster Island and Captured! stay for
 *   Thousand-Year Dragon King Ghidorah's wipe.
 * - 14: invade only when (a) it wins this turn, (b) from your turn 5 it reaches the zone a
 *   strategy card in hand needs, or (c) it wins in fewer of your turns than countering.
 */
const EARLY_TURNS = 4;
const KAIZER_WIPE = "EBP04-035";
const KAIZER_THREAT = "EBP04-036";
const KAIZER_BATTLE = "EBP04-068";
const KAIZER_BATTLE_ZONES = [1, 2, 3, 8];
/** The plan's strategy cards, not paid away for an invasion (rule 3). */
const KEY_CARDS = new Set([
  CAPTURED,
  FINAL_WARS,
  MONSTER_ISLAND,
  LANDING,
  ENTANGLING_FEAR,
  "EBP01-064",
]);
/** Simulated plays rule 10 tries before it gives up looking for another way to the counter. */
const MAX_TRIES = 40;

type Json = Record<string, unknown>;

/** Whether a card's ability data destroys 2 or more battle cards at once ("all", or a count). */
export function wipesBoard(deckCardNumber: string): boolean {
  const data = getCardAbilities(deckCardNumber);
  if (data.status === "manual") return false;
  const big = (count: unknown): boolean => {
    if (count === "all") return true;
    if (typeof count === "number") return count >= 2;
    if (!count || typeof count !== "object") return false;
    const c = count as Json;
    const n = c["exact"] ?? c["upTo"] ?? c["atMost"];
    // A computed count (colors among cards, ...) can reach 2.
    return typeof n === "number" ? n >= 2 : n !== undefined;
  };
  const walk = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(walk);
    if (!node || typeof node !== "object") return false;
    const o = node as Json;
    if (o["effect"] === "destroy") {
      const target = o["target"] as Json | undefined;
      if (big(target?.["count"])) return true;
      // A zone and its neighbors (Godzilla vs. Megaguirus's second mode).
      if (JSON.stringify(target ?? {}).includes('"relation"')) return true;
    }
    return Object.values(o).some(walk);
  };
  return walk(data.abilities);
}

/** Whether the opponent has shown a board wipe: a wiping card in their discard, zones or play. */
function wipeShown(state: GameState, opponent: PlayerState): boolean {
  const shown: CardInstance[] = [
    ...opponent.discard,
    ...opponent.invadingMonsterZone,
    ...ZONES.flatMap((z) => opponent.zones[z].flat()),
    ...opponent.strategyZones.flat().map((x) => x.card),
  ];
  return shown.some((c) =>
    wipesBoard(cardData(state, c)?.deckCardNumber ?? ""),
  );
}

const vsKingGhidorah = (state: GameState, opponent: PlayerState) =>
  opponent.invadingMonsterZone.some((c) =>
    (cardData(state, c)?.name ?? "").includes("King Ghidorah"),
  );

/** A battle card's counter power as printed; a Monster X's X as 3,000 a color in your zones. */
function printedPower(
  state: GameState,
  card: CardInstance | undefined,
  colors: number,
): number {
  const cp = cardData(state, card)?.counterOrThreat ?? 0;
  return cp < 0 ? 3000 * colors : cp;
}

/** The actions Paul's Monster X plan v2 argues against, each with the first rule that does. */
export function mxPlanV2Verdict(
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
  const colorsNow = colorsOf(
    state,
    tops.map((t) => t.card),
  );
  const discardColors = colorsOf(
    state,
    me.discard.filter((c) => isBattle(cardData(state, c))),
  );
  const choice = state.pendingChoice;
  if (choice) {
    // Rule 11: no Evolution into EBP04-068 over the only blue battle card, or a stronger one.
    if (
      choice.player === player &&
      choice.kind === "confirm" &&
      choice.options.some((o) => o.abilityId === MONSTER_X_EVOLUTION)
    ) {
      const blue = tops.filter((t) =>
        (cardData(state, t.card)?.colors ?? []).includes("Blue"),
      );
      const evolving = tops.filter(
        (t) => cardData(state, t.card)?.deckCardNumber === MONSTER_X_BATTLE,
      );
      const kaizerPower =
        getCardCounter(state, KAIZER_BATTLE) ?? Number.POSITIVE_INFINITY;
      const onlyBlue =
        blue.length === 1 &&
        cardData(state, blue[0]?.card)?.deckCardNumber === MONSTER_X_BATTLE;
      const stronger =
        evolving.length > 0 &&
        evolving.every((t) => getCounterPower(state, t.card) > kaizerPower);
      if (onlyBlue || stronger)
        for (const a of actions)
          if (a.type === "choose" && a.optionId === "yes") kill(a, 11);
    }
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
  const passes = actions.filter((a) => a.type === "pass");
  const turn = ownTurn(state);
  const early = turn <= EARLY_TURNS;
  const myRank = cardData(state, me.invadingMonsterZone.at(-1))?.rank ?? 0;
  const theirRank =
    cardData(state, opponent.invadingMonsterZone.at(-1))?.rank ?? 0;
  const countered = counterPowerOf(state, me) >= getThreat(state, opponent.id);
  const kg = vsKingGhidorah(state, opponent);
  const kgLate = kg && theirRank >= 3;

  // Rule 14: invade only for a win (a), a key strategy's zone (b) or when it's faster (c).
  const invades = actions.filter(
    (a) => a.type === "invade" || a.type === "invadeFromDeck",
  );
  const faster =
    turnsToInvade(state, me, opponent) < turnsToCounter(state, me, opponent);
  const needZone = Math.max(
    0,
    ...me.hand
      .map((c) => cardData(state, c))
      .filter((d) => d?.type === "Strategy")
      .map((d) => d?.rank ?? 0),
  );
  for (const a of invades) {
    const after = playOut(state, a);
    const wins = after?.result?.winner === player;
    const reaches =
      turn > EARLY_TURNS &&
      me.monsterPosition !== null &&
      needZone > me.monsterPosition &&
      (after?.players.find((p) => p.id === player)?.monsterPosition ?? 0) >=
        needZone;
    if (!wins && !reaches && !faster) kill(a, 14);
  }
  // Rule 13: vs King Ghidorah from their rank 3, Monster Island and Captured! stay in hand.
  if (kgLate)
    for (const a of actions)
      if (
        "cardInstanceId" in a &&
        [MONSTER_ISLAND, CAPTURED].includes(numberOf(a.cardInstanceId) ?? "") &&
        !(
          a.type === "activateStrategy" &&
          numberOf(a.cardInstanceId) === MONSTER_ISLAND
        )
      )
        kill(a, 13);
  // Rule 3: pay with a non-key card, of a color not yet in the discard pile, up to 4 colors.
  const live = invades.filter(
    (a): a is Extract<Action, { type: "invade" }> =>
      a.type === "invade" && !dead.has(a),
  );
  const keyPay = (a: Extract<Action, { type: "invade" }>) =>
    KEY_CARDS.has(numberOf(a.cardInstanceId) ?? "");
  if (live.some((a) => !keyPay(a)))
    for (const a of live) if (keyPay(a)) kill(a, 3);
  if (discardColors.size < TARGET_COLORS) {
    const left = live.filter((a) => !dead.has(a));
    const adds = (a: Extract<Action, { type: "invade" }>) => {
      const data = cardData(state, handCard(a.cardInstanceId));
      return (
        isBattle(data) &&
        (data?.colors ?? []).some((c) => !discardColors.has(c))
      );
    };
    if (left.some(adds)) for (const a of left) if (!adds(a)) kill(a, 3);
  }
  const invading = invades.some((a) => !dead.has(a));

  // Rule 2: no play onto your own battle card, unless it's weaker and a color is missing.
  const plays = actions.filter(
    (a): a is Extract<Action, { type: "playBattle" }> =>
      a.type === "playBattle",
  );
  for (const a of plays) {
    const covered = tops.find((t) => t.zone === a.zone)?.card;
    if (!covered) continue;
    const card = handCard(a.cardInstanceId);
    const weaker =
      getCounterPower(state, covered) <
      printedPower(state, card, Math.max(colorsNow.size, 1));
    const coveredColors = cardData(state, covered)?.colors ?? [];
    const newColors = cardData(state, card)?.colors ?? [];
    const missing =
      coveredColors.some((c) => !discardColors.has(c)) ||
      newColors.some((c) => !colorsNow.has(c));
    if (!weaker || !missing) kill(a, 2);
  }
  // Rule 11: Kaizer Ghidorah EBP04-068 in zones 1-3 or 8 only.
  for (const a of plays)
    if (
      numberOf(a.cardInstanceId) === KAIZER_BATTLE &&
      !KAIZER_BATTLE_ZONES.includes(a.zone)
    )
      kill(a, 11);
  // Rule 1: a battle card that adds a new color in your zones, up to 4 colors; early, no pass
  // while a battle card can still be played.
  if (colorsNow.size < TARGET_COLORS) {
    const after = (a: Extract<Action, { type: "playBattle" }>) => {
      const card = handCard(a.cardInstanceId);
      const rest = tops.filter((t) => t.zone !== a.zone).map((t) => t.card);
      return colorsOf(state, card ? [...rest, card] : rest).size;
    };
    const left = plays.filter((a) => !dead.has(a));
    if (left.some((a) => after(a) > colorsNow.size))
      for (const a of left) if (after(a) <= colorsNow.size) kill(a, 1);
  }
  if (early && plays.some((a) => !dead.has(a)))
    for (const a of passes) kill(a, 1);

  // Rules 4, 5: Entangling Fear whenever it can be cast; never on a turn you invade.
  const fear = strategies(ENTANGLING_FEAR);
  const feared = me.strategyZones
    .flat()
    .some((x) => cardData(state, x.card)?.deckCardNumber === ENTANGLING_FEAR);
  if (fear.length > 0 && !invading && !feared) {
    for (const a of passes) kill(a, 4);
  } else {
    for (const a of fear) kill(a, 4);
  }
  // Rule 6: early, discard monster cards for rage while you have them.
  if (early && actions.some((a) => a.type === "gainRage"))
    for (const a of passes) kill(a, 6);

  // Rule 7: rank 4, EBP04-035 only when its destruction is needed; then EBP04-036 back on top.
  const monsterPlays = actions.filter(
    (a): a is Extract<Action, { type: "playMonster" }> =>
      a.type === "playMonster",
  );
  for (const a of monsterPlays) {
    if (numberOf(a.cardInstanceId) !== KAIZER_WIPE || myRank < 4) continue;
    const after = playOut(state, a);
    const opp = after?.players.find((p) => p.id === opponent.id);
    const before = battleTops(state, opponent);
    const left = opp ? battleTops(after as GameState, opp) : before;
    const blocker = (list: { zone: number }[]) =>
      list.some((t) => t.zone === 8);
    const needed =
      before.length - left.length >= 2 || (blocker(before) && !blocker(left));
    if (!needed) kill(a, 7);
  }
  const active = cardData(state, me.invadingMonsterZone.at(-1))?.deckCardNumber;
  if (
    active === KAIZER_WIPE &&
    monsterPlays.some((a) => numberOf(a.cardInstanceId) === KAIZER_THREAT)
  )
    for (const a of passes) kill(a, 7);

  // Rule 8: Final Wars with 2 or fewer battle cards in zones, or when they can't make the counter.
  if (tops.length > 2 && countered)
    for (const a of strategies(FINAL_WARS)) kill(a, 8);

  // Rule 9: Landing whenever it can be cast.
  if (strategies(LANDING).length > 0) for (const a of passes) kill(a, 9);

  // Rule 10: Captured! only when nothing else you can play makes this turn's counter.
  for (const a of strategies(CAPTURED)) {
    if (dead.has(a)) continue;
    const otherWay = () =>
      actions
        .filter(
          (b) =>
            (b.type === "playBattle" ||
              (b.type === "activateStrategy" &&
                numberOf(b.cardInstanceId) !== CAPTURED)) &&
            !dead.has(b),
        )
        .slice(0, MAX_TRIES)
        .some((b) => makesCounter(state, b, me));
    if (countered || !makesCounter(state, a, me) || otherWay()) {
      kill(a, 10);
      continue;
    }
    for (const b of passes) kill(b, 10);
  }

  // Rule 12: Monster Island with zones 1-5 full, or ahead of an expected board wipe.
  const full = ([1, 2, 3, 4, 5] as const).every((z) =>
    tops.some((t) => t.zone === z),
  );
  const wipeAhead =
    wipeShown(state, opponent) || (kg && theirRank === 3 && countered);
  if (!full && !wipeAhead)
    for (const a of strategies(MONSTER_ISLAND)) kill(a, 12);

  // Rule 13: vs King Ghidorah, the last removal for Mecha-King Ghidorah stays until it lands.
  const landed = ZONES.some((z) =>
    opponent.zones[z].some((st) =>
      st.some((c) => cardData(state, c)?.deckCardNumber === MECHA_KING),
    ),
  );
  const removal = me.hand.filter((c) =>
    MECHA_KING_REMOVAL.has(cardData(state, c)?.deckCardNumber ?? ""),
  );
  if (kg && !landed && removal.length === 1) {
    const last = removal[0]?.instanceId;
    for (const a of actions)
      if (
        ("cardInstanceId" in a &&
          a.cardInstanceId === last &&
          !(a.type === "invade" && !dead.has(a))) ||
        (a.type === "playBattle" && a.costCardInstanceId === last)
      )
        kill(a, 13);
  }
  return dead;
}

/** A card's printed counter power, by deck card number, from any copy in the state's cards. */
function getCardCounter(
  state: GameState,
  deckCardNumber: string,
): number | null {
  const card = Object.values(state.cards).find(
    (c) => c.deckCardNumber === deckCardNumber,
  );
  const cp = card?.counterOrThreat;
  return typeof cp === "number" && cp >= 0 ? cp : null;
}

import { getCardAbilities } from "@gojisim/cards";
import {
  type Action,
  advanceToDecision,
  applyAction,
  counterPowerOf,
  type GameState,
  getThreat,
  type PlayerId,
  type PlayerState,
} from "@gojisim/engine";
import {
  CONSTRUCTED_FUTURE,
  simulateConstructedFuture,
  WORTH_IT,
} from "./cfPlay";

/**
 * Paul's Constructed Future plan (`cfPlan=1`, Nov 5, 2026), part of the Hard rules layer. Every
 * card fact is read from ability data or the engine's resolution; every prune keeps one move.
 * - Play it when it brings back a target: the main phase doesn't end (`pass`) while it could.
 * - Order: play it before the Crystals that rebuild after it: before rage discards while the
 *   monster makes Crystals when its rage goes up (Flying Form IV), before invading while it makes
 *   Crystals when it invades (EBP04-026, EBP02-053).
 * - Don't break the GoD counter: hold it when this turn's counter needs a Crystals bonus (God of
 *   Destruction's Counterattack, in play or in hand) and the Crystals can't get back to 3 after it.
 * - Stages: pay invade costs with the first King Ghidorah (2024) and the first Mecha-King
 *   Ghidorah (so it has a target), keep later copies; hold Gravity Beam unless King Ghidorah
 *   (2024)'s +20,000 makes this turn's counter or the opponent has 6+ cards in hand.
 * - Rank 8 ties (Nov 6): with a Gravity Beam in hand, Constructed Future's play takes King
 *   Ghidorah (2024) over another rank 8 card; without one, the search picks.
 */
const KG_2024 = "EBP01-074";
const MECHA_KING = "EBP02-068";
const GRAVITY_BEAM = "EPR-019";
const CONSTRUCTED_FUTURE_ABILITY = "SD05-005#constructed-future";
/** Choices a simulated Gravity Beam may answer before it gives up. */
const MAX_CHOICES = 30;

const numberOf = (state: GameState, cardId: number) =>
  state.cards[cardId]?.deckCardNumber;

/** Crystals in a player's zones (top cards). */
function crystalsIn(state: GameState, player: PlayerState): number {
  return Object.values(player.zones)
    .flat()
    .filter((st) => state.cards[st.at(-1)?.cardId ?? -1]?.name === "Crystals")
    .length;
}

/** Crystals a card makes on a trigger ("rageChanged" up, "invading"), from its ability data. */
export function crystalsOn(
  deckCardNumber: string,
  on: "rageChanged" | "invading",
): number {
  const data = getCardAbilities(deckCardNumber);
  if (data.status === "manual") return 0;
  let total = 0;
  for (const ability of data.abilities as unknown as Record<
    string,
    unknown
  >[]) {
    const trigger = ability["trigger"] as Record<string, unknown> | undefined;
    if (ability["kind"] !== "triggered" || trigger?.["on"] !== on) continue;
    if (on === "rageChanged" && trigger["change"] !== "increased") continue;
    for (const effect of (ability["effects"] as Record<string, unknown>[]) ??
      [])
      if (effect["effect"] === "createToken" && effect["name"] === "Crystals")
        total += typeof effect["count"] === "number" ? effect["count"] : 1;
  }
  return total;
}

/** A card's total counter power bonus that needs Crystals in your zones (GoD), from ability data. */
export function crystalBonus(
  deckCardNumber: string,
): { amount: number; need: number } | null {
  const data = getCardAbilities(deckCardNumber);
  if (data.status === "manual") return null;
  for (const ability of data.abilities as unknown as Record<
    string,
    unknown
  >[]) {
    if (ability["kind"] !== "continuous") continue;
    const condition = ability["condition"] as
      Record<string, unknown> | undefined;
    const count = condition?.["count"] as Record<string, unknown> | undefined;
    if (count?.["name"] !== "Crystals" || condition?.["op"] !== ">=") continue;
    for (const m of (ability["modifiers"] as Record<string, unknown>[]) ?? [])
      if (m["stat"] === "totalCounterPower" && typeof m["amount"] === "number")
        return { amount: m["amount"], need: Number(condition["value"]) };
  }
  return null;
}

/** A Constructed Future activation that brings back a target, with the state after it. */
function readyConstructedFuture(
  state: GameState,
  actions: readonly Action[],
  me: PlayerState,
): { action: Action; after: GameState | null } | null {
  for (const action of actions) {
    if (action.type !== "activateStrategy") continue;
    const card = me.hand.find((c) => c.instanceId === action.cardInstanceId);
    if (!card || numberOf(state, card.cardId) !== CONSTRUCTED_FUTURE) continue;
    const { plays, after } = simulateConstructedFuture(state, action);
    if (plays && WORTH_IT.has(plays)) return { action, after };
  }
  return null;
}

/**
 * Whether Constructed Future breaks the GoD counter: a Crystals bonus card (in play or in hand)
 * is what makes this turn's counter, and after Constructed Future the Crystals can't get back to
 * what it needs: rebuild = the monster's Crystals per rage increase × monster cards in hand (each
 * a rage discard, 8.4) + its invasion Crystals if the invasion is still unused (8.6.2).
 */
export function breaksGodCounter(
  state: GameState,
  me: PlayerState,
  after: GameState | null,
): boolean {
  const opponent = state.players.find((p) => p.id !== me.id);
  if (!opponent || !after) return false;
  const inPlay = me.strategyZones
    .flat()
    .map((x) => crystalBonus(numberOf(state, x.card.cardId) ?? ""))
    .find((b) => b !== null);
  const inHand = me.hand
    .map((c) => crystalBonus(numberOf(state, c.cardId) ?? ""))
    .find((b) => b !== null);
  const bonus = inPlay ?? inHand;
  if (!bonus) return false;
  const threat = getThreat(state, opponent.id);
  const power = counterPowerOf(state, me);
  const active = !!inPlay && crystalsIn(state, me) >= bonus.need;
  const without = active ? power - bonus.amount : power;
  // The counter needs the bonus: short without it, made with it (7.4.3).
  if (without >= threat || without + bonus.amount < threat) return false;
  const meAfter = after.players.find((p) => p.id === me.id);
  if (!meAfter) return false;
  const monster = meAfter.invadingMonsterZone.at(-1);
  const monsterNumber = monster ? (numberOf(after, monster.cardId) ?? "") : "";
  const monstersInHand = meAfter.hand.filter(
    (c) => after.cards[c.cardId]?.type === "Monster",
  ).length;
  const rebuild =
    crystalsOn(monsterNumber, "rageChanged") * monstersInHand +
    (after.turnFlags.invasionUsed ? 0 : crystalsOn(monsterNumber, "invading"));
  return crystalsIn(after, meAfter) + rebuild < bonus.need;
}

/**
 * An action played out (Gravity Beam, Godzilla Captured!), its choices answered with the first
 * option: whether it makes this turn's counter that wasn't made before (7.4.3).
 */
export function makesCounter(
  state: GameState,
  action: Action,
  me: PlayerState,
): boolean {
  const opponent = state.players.find((p) => p.id !== me.id);
  if (!opponent) return false;
  const threat = getThreat(state, opponent.id);
  if (counterPowerOf(state, me) >= threat) return false;
  try {
    let s = advanceToDecision(applyAction(state, action));
    for (let i = 0; i < MAX_CHOICES && s.pendingChoice; i++) {
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
    const meAfter = s.players.find((p) => p.id === me.id);
    return !!meAfter && counterPowerOf(s, meAfter) >= getThreat(s, opponent.id);
  } catch {
    return true;
  }
}

/** The actions Paul's Constructed Future plan rules out. */
export function cfPlanDead(
  state: GameState,
  actions: readonly Action[],
  player: PlayerId,
): Set<Action> {
  const dead = new Set<Action>();
  const me = state.players.find((p) => p.id === player);
  if (!me) return dead;
  // Rank 8 ties: Constructed Future's play pick (every option a card in the discard pile) takes
  // King Ghidorah (2024) when a Gravity Beam is in hand.
  const choice = state.pendingChoice;
  if (
    choice &&
    choice.player === player &&
    state.resolution?.standby.abilityId === CONSTRUCTED_FUTURE_ABILITY &&
    me.hand.some((c) => numberOf(state, c.cardId) === GRAVITY_BEAM)
  ) {
    const fromDiscard = choice.options.every(
      (o) => o.id === "done" || me.discard.some((c) => c.instanceId === o.id),
    );
    const kg = new Set(
      choice.options
        .filter(
          (o) => o.cardId !== null && numberOf(state, o.cardId) === KG_2024,
        )
        .map((o) => o.id),
    );
    if (fromDiscard && kg.size > 0)
      for (const a of actions)
        if (a.type === "choose" && !kg.has(a.optionId)) dead.add(a);
    return dead;
  }
  if (state.turnPlayer !== player || choice) return dead;
  const handNumber = (instanceId: string) => {
    const card = me.hand.find((c) => c.instanceId === instanceId);
    return card ? numberOf(state, card.cardId) : undefined;
  };
  const monster = me.invadingMonsterZone.at(-1);
  const monsterNumber = monster ? (numberOf(state, monster.cardId) ?? "") : "";

  // Play it when it brings back a target, before the Crystals rebuild; unless it breaks GoD.
  const ready = readyConstructedFuture(state, actions, me);
  if (ready && breaksGodCounter(state, me, ready.after)) dead.add(ready.action);
  else if (ready) {
    const rageCrystals = crystalsOn(monsterNumber, "rageChanged") > 0;
    const invadeCrystals = crystalsOn(monsterNumber, "invading") > 0;
    for (const a of actions)
      if (
        a.type === "pass" ||
        (a.type === "gainRage" && rageCrystals) ||
        (a.type === "invade" && invadeCrystals)
      )
        dead.add(a);
  }

  // Invade costs: the first King Ghidorah (2024) and Mecha-King Ghidorah pay, later copies stay.
  const futureLeft = [...me.hand, ...me.deck].some(
    (c) => numberOf(state, c.cardId) === CONSTRUCTED_FUTURE,
  );
  if (futureLeft) {
    const invades = actions.filter(
      (a): a is Extract<Action, { type: "invade" }> => a.type === "invade",
    );
    const inDiscard = (n: string) =>
      me.discard.some((c) => numberOf(state, c.cardId) === n);
    const first = [KG_2024, MECHA_KING].filter((n) => !inDiscard(n));
    const paysFirst = invades.filter((a) =>
      first.includes(handNumber(a.cardInstanceId) ?? ""),
    );
    for (const a of invades) {
      const n = handNumber(a.cardInstanceId) ?? "";
      if (paysFirst.length > 0 && !first.includes(n)) dead.add(a);
      else if (
        [KG_2024, MECHA_KING].includes(n) &&
        inDiscard(n) &&
        invades.some((b) => handNumber(b.cardInstanceId) !== n)
      )
        dead.add(a);
    }
  }

  // Gravity Beam: only when King Ghidorah (2024)'s +20,000 makes the counter, or as disruption.
  const opponent = state.players.find((p) => p.id !== player);
  for (const a of actions) {
    if (a.type !== "activateStrategy") continue;
    if (handNumber(a.cardInstanceId) !== GRAVITY_BEAM) continue;
    if ((opponent?.hand.length ?? 0) >= 6) continue;
    const kgInZones = Object.values(me.zones)
      .flat()
      .some((st) => numberOf(state, st.at(-1)?.cardId ?? -1) === KG_2024);
    if (!kgInZones || !makesCounter(state, a, me)) dead.add(a);
  }
  return dead;
}

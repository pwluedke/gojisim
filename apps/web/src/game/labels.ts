import {
  type Card,
  type Count,
  type Effect,
  getCardAbilities,
  getCardText,
  type Op,
  type Selector,
} from "@gojisim/cards";
import type { Action, CardInstance, GameState } from "@gojisim/engine";

export function cardData(
  state: GameState,
  card: CardInstance | { cardId: number },
): Card | undefined {
  return state.cards[card.cardId];
}

/** Every card instance in the game, by instance id (hand, monster deck, field, piles). */
export function findInstance(
  state: GameState,
  instanceId: string,
): CardInstance | undefined {
  for (const player of state.players) {
    const all = [
      ...player.hand,
      ...player.monsterDeck,
      ...player.deck,
      ...player.discard,
      ...player.invadingMonsterZone,
      ...Object.values(player.zones).flat(2),
      ...player.strategyZones.flat().map((p) => p.card),
    ];
    const found = all.find((c) => c.instanceId === instanceId);
    if (found) return found;
  }
  return state.resolutionArea.find((c) => c.instanceId === instanceId);
}

function nameOf(state: GameState, instanceId: string): string {
  const instance = findInstance(state, instanceId);
  const card = instance && cardData(state, instance);
  return card ? `${card.name} [${card.cardNumber}]` : instanceId;
}

/** A button label for an action, e.g. "Play Godzilla (2023) [ESD01-011] → zone 4". */
export function actionLabel(state: GameState, action: Action): string {
  switch (action.type) {
    case "playBattle": {
      // M2: on top of the card there (EBP03-051).
      const host = action.onTop
        ? state.players
            .find((p) => p.id === action.player)
            ?.zones[action.zone].at(-1)
            ?.at(-1)
        : undefined;
      return host
        ? `Play ${nameOf(state, action.cardInstanceId)} on top of ${nameOf(state, host.instanceId)} → zone ${action.zone}`
        : `Play ${nameOf(state, action.cardInstanceId)} → zone ${action.zone}`;
    }
    case "activateStrategy":
      return `Activate ${nameOf(state, action.cardInstanceId)} → strategy zone ${action.strategyZone}`;
    case "gainRage":
      return `Discard ${nameOf(state, action.cardInstanceId)} for +1 rage`;
    case "playMonster":
      return `Play monster ${nameOf(state, action.cardInstanceId)}`;
    case "invade": {
      const instance = findInstance(state, action.cardInstanceId);
      const icon = (instance && cardData(state, instance)?.invadeZones) ?? 0;
      return `Invade: discard ${nameOf(state, action.cardInstanceId)} (icon ${icon})`;
    }
    case "invadeFromDeck":
      // E21 (EBP03-004): the top card of the deck pays instead; its icon shows once it's sent.
      return "Invade: send the top card of your deck to the discard pile";
    case "pass":
      return "Pass";
    case "choose": {
      const choice = state.pendingChoice;
      const option = choice?.options.find((o) => o.id === action.optionId);
      const card =
        option && option.cardId !== null
          ? state.cards[option.cardId]
          : undefined;
      if (choice?.kind === "standbyOrder")
        return `Resolve ${option?.abilityId ?? "?"} (${card?.name ?? "?"})`;
      if (choice?.kind === "zone") {
        // An optional move's Done (5.2.1, e.g. ESD01-012) leaves the card where it is.
        if (action.optionId === "done")
          return choice.rule === "5.2.1" ? "Don't move the card" : "Done";
        const [player, zone] = action.optionId.split(":");
        return `Choose ${player}'s zone ${zone}`;
      }
      if (choice?.kind === "manual") return "Done (close the manual override)";
      if (choice?.kind === "option")
        return optionText(state, Number(action.optionId));
      if (choice?.kind === "replacementOrder")
        return `Apply ${action.optionId} (${choice.rule})`;
      if (choice?.kind === "confirm")
        return `${action.optionId === "yes" ? "Yes" : "No"} (${option?.abilityId ?? "?"}, ${choice.rule})`;
      const named = card
        ? `${card.name} [${card.cardNumber}]`
        : action.optionId;
      // Hand and deck choices say what happens to the card.
      switch (choice?.rule) {
        case "5.7.2":
          return `Discard ${named}`;
        case "5.7.1":
          return `Discard ${named}`;
        case "5.8.1":
        case "12.6.2":
          return action.optionId === "done" ? "Find nothing" : `Take ${named}`;
        case "5.17":
          return `Evolve ${named}`;
        case "10.5.3":
          return action.optionId === "done"
            ? "Stop choosing"
            : `Target ${named}`;
      }
      if (action.optionId === "done") return "Stop choosing (or find nothing)";
      return `Choose ${named}`;
    }
    case "concede":
      return "Concede";
    case "manual":
      return `Manual: ${action.op.kind}`;
  }
}

/**
 * The words of a "choose one of the following" option (E7): its "●" line on the source card,
 * without the bullet; the option number if the text has no such line.
 */
export function optionText(state: GameState, index: number): string {
  const source = state.resolution
    ? state.cards[state.resolution.standby.sourceCardId]
    : undefined;
  const bullets = source
    ? getCardText(source)
        .text.split("\n")
        .filter((line) => line.trim().startsWith("●"))
        .map((line) => line.trim().replace(/^●\s*/, ""))
    : [];
  return bullets[index] ?? `Option ${index + 1}`;
}

/** The effect a paused ability is performing (format.md), from its card's ability data. */
function currentEffect(state: GameState): Effect | undefined {
  const r = state.resolution;
  if (!r) return undefined;
  const [number, id] = r.standby.abilityId.split("#");
  const ability = getCardAbilities(number ?? "").abilities.find(
    (a) => "id" in a && a.id === id,
  );
  if (!ability || ability.kind !== "triggered") return undefined;
  let effects =
    r.stage === "cost" ? (ability.cost?.effects ?? []) : ability.effects;
  let effect: Effect | undefined;
  for (const index of r.path) {
    effect = effects[index];
    if (!effect) return undefined;
    effects = "effects" in effect ? effect.effects : [];
  }
  return effect;
}

/** What the chooser of the pending choice is doing, e.g. "searching their deck for Heat Ray". */
function choiceWhat(state: GameState): string {
  const choice = state.pendingChoice;
  if (!choice) return "";
  const who = choice.player;
  const source = state.resolution
    ? (state.cards[state.resolution.standby.sourceCardId]?.name ?? "")
    : "";
  const by = source ? ` for ${source}` : "";
  switch (choice.kind) {
    case "standbyOrder":
      return "choosing which ability resolves first";
    case "nextMonster":
      return "choosing their next monster";
    case "zone":
      return `choosing a zone${by}`;
    case "confirm": {
      // "Your opponent may discard cards until ..." (EBP02-070): the opponent decides.
      // An optional replacement asked during a step (E21, EBP02-012 at 7.2.3).
      if (choice.rule === "10.9") {
        const option = choice.options[0];
        const card =
          option?.cardId === null || option?.cardId === undefined
            ? undefined
            : state.cards[option.cardId];
        const number = option?.abilityId?.split("#")[0];
        const source = Object.values(state.cards).find(
          (c) => c.deckCardNumber === number,
        );
        return `deciding whether ${source?.name ?? "a card"}'s replacement applies to ${card?.name ?? "a card"}`;
      }
      const effect = currentEffect(state);
      if (choice.rule === "5.7.2" && effect?.effect === "discardDownTo")
        return `deciding whether to discard down to ${effect.size} cards${by}`;
      return `deciding whether to use${source ? ` ${source}'s` : ""} ability`;
    }
    case "replacementOrder":
      return "choosing which replacement applies";
    case "manual":
      return "resolving a card by hand (manual override)";
    case "option":
      return `choosing one of the options${by}`;
  }
  const effect = currentEffect(state);
  if (choice.rule === "5.7.2" && effect?.effect === "discardDownTo") {
    const picked = state.resolution?.chosen.length ?? 0;
    const hand = state.players.find((p) => p.id === who)?.hand.length ?? 0;
    const left = hand - effect.size - picked;
    return `choosing what to discard${by}, down to ${effect.size} card${effect.size === 1 ? "" : "s"} (discard ${left} more)`;
  }
  if (choice.rule === "5.7.1") return `choosing a card to discard${by}`;
  if (choice.rule === "5.8.1" || choice.rule === "12.6.2")
    return `searching their deck${by}`;
  if (choice.rule === "5.17") return "choosing a card to evolve";
  if (choice.rule === "5.11.1") return `choosing a card to play${by}`;
  // M12c-1: the card cards go under (picked first), then the cards that go under it (E4).
  if (choice.rule === "3.2" && effect?.effect === "placeUnder")
    return state.resolution?.subject === null
      ? `choosing the card to put cards under${by}`
      : `choosing a card to put under it${by}`;
  if (choice.rule === "5.10") return `choosing a revealed card to take${by}`;
  if (choice.rule === "5.11.2")
    return `choosing a monster card to play from their monster deck${by}`;
  if (choice.rule === "5.2.1" && effect?.effect === "putOnDeck")
    return `choosing a card to put on their deck${by}`;
  return `choosing a target${by}`;
}

/**
 * Who is deciding and what, e.g. "P2 is choosing which cards to keep (the rest are discarded)
 * during P1's turn". A choice can belong to the player whose turn it isn't.
 */
export function decisionHeading(state: GameState): string {
  if (state.result) return "Game over";
  if (!state.pendingChoice)
    return `${state.turnPlayer}'s turn: choose an action`;
  return choiceHeading(state, (id) => id);
}

/**
 * The choice modal's heading (M5c, PR #19 pattern): who is choosing, what for, and during whose
 * turn, with seat names from `name` ("You", "Bot", "P2"), e.g. "You are choosing what to discard
 * for Godzilla (2023), down to 6 cards (discard 1 more) during Bot's turn".
 */
export function choiceHeading(
  state: GameState,
  name: (playerId: string) => string,
): string {
  const choice = state.pendingChoice;
  if (!choice) return "";
  const who = name(choice.player);
  const you = who === "You";
  const what = choiceWhat(state);
  const turn = name(state.turnPlayer);
  const during =
    choice.player === state.turnPlayer
      ? ""
      : ` during ${turn === "You" ? "your" : `${turn}'s`} turn`;
  return `${who} ${you ? "are" : "is"} ${you ? what.replace(/\btheir\b/g, "your") : what}${during}`;
}

/** The card (or rule) that caused the pending choice, for the modal's source line (M5c). */
export function choiceSource(state: GameState): string | null {
  const choice = state.pendingChoice;
  if (!choice) return null;
  const named = (cardId: number | null | undefined) => {
    const card =
      cardId === null || cardId === undefined ? undefined : state.cards[cardId];
    return card ? `${card.name} [${card.cardNumber}]` : null;
  };
  if (state.resolution) return named(state.resolution.standby.sourceCardId);
  if (choice.kind === "manual") return named(choice.options[0]?.cardId);
  if (choice.kind === "nextMonster") return "The counter (5.15.1.2)";
  if (choice.kind === "standbyOrder")
    return "Abilities waiting to resolve (10.4.3.2)";
  return null;
}

/** A card in the game by its deck card number (the first print in the catalog). */
export function cardByNumber(
  state: GameState,
  deckCardNumber: string,
): Card | undefined {
  return Object.values(state.cards).find(
    (c) => c.deckCardNumber === deckCardNumber,
  );
}

/**
 * The printed text of one ability (M5e ability-order modal), e.g. ESD01-011's "When this card
 * is [destroy], place this card on the bottom of your deck instead." for `ESD01-011#bottom-instead`.
 * A card's text has one line per ability, in ability-data order; keyword abilities the engine
 * expands (Evolution) use their keyword's line. Falls back to the whole text.
 */
export function abilityText(state: GameState, abilityId: string): string {
  const [number = "", id = ""] = abilityId.split("#");
  const card = cardByNumber(state, number);
  if (!card) return "";
  const text = getCardText(card).text;
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const keyword = lines.find((l) => l.toLowerCase().includes(`[${id}`));
  if (keyword) return keyword;
  const ids = getCardAbilities(number).abilities.flatMap((a) =>
    "id" in a ? [a.id] : [],
  );
  const index = ids.indexOf(id);
  return index >= 0 && lines.length >= ids.length
    ? (lines[index] as string)
    : text;
}

const KIND_WORDS: Record<string, string> = {
  Battle: "battle card",
  Monster: "monster card",
  Strategy: "strategy card",
};

const RANK_WORDS: Record<Op, (rank: number) => string> = {
  "<": (r) => `below rank ${r}`,
  "<=": (r) => `of rank ${r} or lower`,
  "=": (r) => `of rank ${r}`,
  "!=": (r) => `not of rank ${r}`,
  ">=": (r) => `of rank ${r} or higher`,
  ">": (r) => `above rank ${r}`,
};

/**
 * What a search looks for (M5e search modal), from the `search` log entry's filter and count,
 * e.g. "up to 1 card named Godzilla (2023) of rank 3 with Burst".
 */
export function describeSearch(filter: Selector, count: Count): string {
  const amount =
    count === "all"
      ? "all"
      : count === "anyNumber"
        ? "any number of"
        : "upTo" in count
          ? `up to ${count.upTo}`
          : String(count.exact);
  const parts = [`${amount} ${filter.type ? KIND_WORDS[filter.type] : "card"}`];
  if (filter.name) parts.push(`named ${filter.name}`);
  if (filter.traits?.length)
    parts.push(`with the ${filter.traits.join(" and ")} trait`);
  if (filter.rank && typeof filter.rank.value === "number")
    parts.push(RANK_WORDS[filter.rank.op](filter.rank.value));
  if (filter.keyword)
    parts.push(
      `with ${filter.keyword.charAt(0).toUpperCase()}${filter.keyword.slice(1)}`,
    );
  if (filter.colors?.length) parts.push(`(${filter.colors.join(" or ")})`);
  return parts.join(" ");
}

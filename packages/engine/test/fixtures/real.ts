import type { Card } from "@gojisim/cards";
import { getAllCards } from "@gojisim/cards/test-decks";
import type {
  CardInstance,
  GameState,
  PlayerState,
  ZoneNumber,
} from "../../src";
import { addCard, newGame, runTo } from "./state";

/** The base print of a real card (lowest id), by card number. */
export function real(deckCardNumber: string): Card {
  const card = getAllCards()
    .filter((c) => c.deckCardNumber === deckCardNumber && c.parentId === null)
    .sort((a, b) => a.id - b.id)[0];
  if (!card) throw new Error(`No card ${deckCardNumber}`);
  return card;
}

/** A game at the turn player's main phase play timing. */
export const atPlayTiming = () => runTo(newGame(), "7.3.2");

export function place(
  state: GameState,
  player: PlayerState,
  card: Card,
  zone: ZoneNumber,
): CardInstance {
  const instance = addCard(state, card, player.id);
  player.zones[zone].push([instance]);
  return instance;
}

/** Makes `card` the player's invading monster, in `zone`. */
export function monster(
  state: GameState,
  player: PlayerState,
  card: Card,
  zone: ZoneNumber,
): CardInstance {
  const instance = addCard(state, card, player.id);
  player.invadingMonsterZone = [instance];
  player.monsterPosition = zone;
  return instance;
}

export function inHand(
  state: GameState,
  player: PlayerState,
  card: Card,
): CardInstance {
  const instance = addCard(state, card, player.id);
  player.hand.push(instance);
  return instance;
}

/** Puts a card on top of the player's deck. */
export function onDeck(
  state: GameState,
  player: PlayerState,
  card: Card,
): CardInstance {
  const instance = addCard(state, card, player.id);
  player.deck.unshift(instance);
  return instance;
}

export function inDiscard(
  state: GameState,
  player: PlayerState,
  card: Card,
): CardInstance {
  const instance = addCard(state, card, player.id);
  player.discard.push(instance);
  return instance;
}

/** Top card ids per occupied zone, e.g. `{ "2": [961011] }`. */
export const zoneCardIds = (player: PlayerState) =>
  Object.fromEntries(
    Object.entries(player.zones)
      .filter(([, stacks]) => stacks.length > 0)
      .map(([zone, stacks]) => [zone, stacks.map((s) => s.at(-1)?.cardId)]),
  );

import type { Card } from "./schema";
import tokens from "../data/tokens.json";

/**
 * Token cards (9.1), from `data/tokens.json`: the base print of every Token in `cards.json`, so
 * the engine can create tokens without the full card list (decision 33). A test keeps the two in
 * step.
 */
export const TOKENS: readonly Card[] = tokens as Card[];

/** Tokens added at runtime (a card set registered after load, `registerCards`). */
const registered: Card[] = [];

/** Adds runtime tokens; a name already known is skipped. */
export function registerTokens(cards: readonly Card[]): void {
  for (const card of cards)
    if (
      card.type === "Token" &&
      ![...TOKENS, ...registered].some(
        (t) => t.name.toLowerCase() === card.name.toLowerCase(),
      )
    )
      registered.push(card);
}

/** A token by name (9.1.2.2), ignoring case: card text writes "Conductorless train bombers". */
export function getTokenCard(name: string): Card {
  const token = [...TOKENS, ...registered].find(
    (t) => t.name.toLowerCase() === name.toLowerCase(),
  );
  if (!token) throw new Error(`No token named ${name}`);
  return token;
}

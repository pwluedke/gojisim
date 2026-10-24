import type { Card } from "./schema";
import tokens from "../data/tokens.json";

/**
 * Token cards (9.1), from `data/tokens.json`: the base print of every Token in `cards.json`, so
 * the engine can create tokens without the full card list (decision 33). A test keeps the two in
 * step.
 */
export const TOKENS: readonly Card[] = tokens as Card[];

/** A token by name (9.1.2.2), ignoring case: card text writes "Conductorless train bombers". */
export function getTokenCard(name: string): Card {
  const token = TOKENS.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (!token) throw new Error(`No token named ${name}`);
  return token;
}

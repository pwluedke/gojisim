import type { DecklogDeck } from "@gojisim/cards/decklog";

/** The Decklog route (`apps/server/src/decklog.ts`, served by the Vite dev server now). */
export const DECKLOG_ROUTE = "/api/decklog/";

/**
 * Fetches a Decklog deck through GojiSim's route. Returns the deck, or the message to show: deck
 * not found, Decklog unreachable, or no route (a page served without GojiSim's server).
 */
export async function fetchDecklogDeck(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ deck: DecklogDeck } | { error: string }> {
  let res: Response;
  let body: unknown;
  try {
    res = await fetchImpl(`${DECKLOG_ROUTE}${encodeURIComponent(code)}`);
    body = await res.json();
  } catch {
    return {
      error:
        "Decklog import needs GojiSim's server (`pnpm --filter @gojisim/web dev` runs it), and it didn't answer.",
    };
  }
  const message = (body as { message?: unknown } | null)?.message;
  if (!res.ok)
    return {
      error:
        res.status === 502
          ? "Decklog can't be reached right now. Try again later."
          : typeof message === "string"
            ? `${message}.`
            : `Decklog import failed (HTTP ${res.status}).`,
    };
  return { deck: body as DecklogDeck };
}

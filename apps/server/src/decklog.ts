import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Decklog import: `GET /api/decklog/<code>` fetches a deck from Bushiroad's Decklog. The browser
 * can't call Decklog itself (no CORS headers), so the route runs on a server: the Vite dev
 * server's middleware now, and `apps/server` at M9. Both use this module.
 *
 * Decklog's own deck page loads the deck with `POST <DECKLOG_VIEW_API><code>` (body `{}`); its
 * response has `title`, `list` (main deck), `p_list` (monster deck) and `sub_list`. An unknown code
 * answers 200 with `[]`.
 */

export const DECKLOG_VIEW_API =
  "https://decklog-en.bushiroad.com/system/app/api/view/";

/** Decklog's `game_title_id` for the Godzilla Card Game. */
export const GODZILLA_GAME_TITLE = 7;

/** A deck code as Decklog writes them (`1STAP`): letters and digits only. */
const CODE = /^[A-Za-z0-9]{3,12}$/;

export interface DecklogEntry {
  card_number: string;
  num: number;
}

/** What the route answers for a found deck: Decklog's fields GojiSim reads, nothing else. */
export interface DecklogDeck {
  code: string;
  title: string;
  list: DecklogEntry[];
  p_list: DecklogEntry[];
  sub_list: DecklogEntry[];
}

export type DecklogErrorCode =
  "invalid-code" | "not-found" | "not-godzilla" | "unreachable";

export interface DecklogResult {
  status: number;
  body: DecklogDeck | { error: DecklogErrorCode; message: string };
}

const fail = (
  status: number,
  error: DecklogErrorCode,
  message: string,
): DecklogResult => ({ status, body: { error, message } });

function entries(value: unknown): DecklogEntry[] | null {
  if (!Array.isArray(value)) return value == null ? [] : null;
  const out: DecklogEntry[] = [];
  for (const item of value as unknown[]) {
    const { card_number, num } = (item ?? {}) as Record<string, unknown>;
    if (typeof card_number !== "string" || !Number.isInteger(Number(num)))
      return null;
    out.push({ card_number: card_number.trim(), num: Number(num) });
  }
  return out;
}

/**
 * Fetches deck `code` from Decklog. Errors: 400 for a code Decklog can't have, 404 when Decklog has
 * no such deck, 422 for another game's deck, 502 when Decklog can't be reached or answers
 * something unreadable.
 */
export async function fetchDecklog(
  code: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<DecklogResult> {
  if (!CODE.test(code))
    return fail(400, "invalid-code", `"${code}" isn't a Decklog deck code`);
  let data: unknown;
  try {
    const res = await fetchImpl(`${DECKLOG_VIEW_API}${code}`, {
      method: "POST",
      headers: {
        // Decklog answers `[]` (as for an unknown code) unless the request names the deck's own
        // view page, as its deck page does.
        referer: `https://decklog-en.bushiroad.com/view/${code}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent":
          "GojiSim deck import (+https://github.com/pwluedke/gojisim)",
      },
      body: "{}",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch {
    return fail(502, "unreachable", "Decklog can't be reached right now");
  }
  if (Array.isArray(data) || data === null || typeof data !== "object")
    return fail(404, "not-found", `Decklog has no deck ${code}`);
  const deck = data as Record<string, unknown>;
  if (
    deck["game_title_id"] !== undefined &&
    Number(deck["game_title_id"]) !== GODZILLA_GAME_TITLE
  )
    return fail(
      422,
      "not-godzilla",
      `Decklog deck ${code} is for another game, not the Godzilla Card Game`,
    );
  const list = entries(deck["list"]);
  const pList = entries(deck["p_list"]);
  const subList = entries(deck["sub_list"]);
  if (!list || !pList || !subList)
    return fail(502, "unreachable", "Decklog answered something unreadable");
  return {
    status: 200,
    body: {
      code: String(deck["deck_id"] ?? code),
      title: typeof deck["title"] === "string" ? deck["title"].trim() : "",
      list,
      p_list: pList,
      sub_list: subList,
    },
  };
}

/** The route's path prefix. */
export const DECKLOG_ROUTE = "/api/decklog/";

/**
 * Connect-style middleware for `GET /api/decklog/<code>` (Vite's dev server, `apps/server`).
 * Other requests go to `next`.
 */
export function decklogMiddleware(fetchImpl: typeof fetch = fetch) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    // Mounted with a prefix (Vite's `use(prefix, fn)`) the prefix is already stripped.
    const code = path.startsWith(DECKLOG_ROUTE)
      ? path.slice(DECKLOG_ROUTE.length)
      : null;
    if (code === null || req.method !== "GET") return next();
    let decoded = code;
    try {
      decoded = decodeURIComponent(code);
    } catch {
      // A malformed escape stays as typed and fails the code check.
    }
    void fetchDecklog(decoded, fetchImpl).then((result) => {
      res.writeHead(result.status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(result.body));
    });
  };
}

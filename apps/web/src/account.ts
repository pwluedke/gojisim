/**
 * The signed-in player (#150), from `GET /api/me`: Discord sign-in (or the dev sign-in) answers
 * it; the password gate and no gate answer 404, and the app shows no player.
 */
export interface Me {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** The player from `/api/me`'s answer, or `null` for anything else. */
export function meFrom(body: unknown): Me | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b["id"] !== "string" || typeof b["name"] !== "string") return null;
  return {
    id: b["id"],
    name: b["name"],
    avatarUrl: typeof b["avatarUrl"] === "string" ? b["avatarUrl"] : null,
  };
}

let me: Promise<Me | null> | null = null;

/** The signed-in player, read once per page load. */
export function fetchMe(fetchImpl: typeof fetch = fetch): Promise<Me | null> {
  me ??= fetchImpl("/api/me", { headers: { accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : null))
    .then(meFrom)
    .catch(() => null);
  return me;
}

/** For tests: forget the page load's player. */
export function resetMe(): void {
  me = null;
}

/** One of the player's games in their history (#151), as `GET /api/games/mine` lists it. */
export interface MyGame {
  gameId: string;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  result: "win" | "loss" | "draw" | null;
  botLevel: string | null;
  deckNames: string | null;
}

/** The player's games, newest first; `null` without accounts (or when the list can't be read). */
export async function fetchMyGames(
  fetchImpl: typeof fetch = fetch,
): Promise<MyGame[] | null> {
  try {
    const res = await fetchImpl("/api/games/mine", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { games?: unknown };
    return Array.isArray(body.games) ? (body.games as MyGame[]) : null;
  } catch {
    return null;
  }
}

/** One of the player's games' record (JSON text) to load, or `null`. */
export async function fetchMyGame(
  gameId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`/api/games/${encodeURIComponent(gameId)}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

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

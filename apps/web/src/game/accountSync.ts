import type { SavedDeck } from "./deckStore";

/**
 * My decks and Settings follow the signed-in player (#152). The server keeps a copy per player
 * (`/api/me/decks`, `/api/me/settings`); this browser keeps its own as an offline cache. After
 * sign-in the server's copy wins, except where this browser edited later (the newest edit wins).
 * A browser's decks the account doesn't have yet are offered once for upload (`uploadPlan`).
 * The mat image stays in this browser.
 */

/** A deck as the server keeps it: a deleted one is a tombstone, so other browsers drop it too. */
export interface AccountDeck {
  id: string;
  name: string;
  list: string;
  updatedAt: string;
  deleted: boolean;
}

/** When a saved deck was last edited (its save time for decks from before #152). */
export const editedAt = (deck: SavedDeck) => deck.updatedAt ?? deck.savedAt;

const later = (a: string, b: string) => Date.parse(a) > Date.parse(b);

export interface DeckMerge {
  /** What this browser keeps and shows. */
  decks: SavedDeck[];
  /** This browser's edits newer than the account's: to send. */
  push: SavedDeck[];
  /** This browser's decks the account doesn't have (offered once for upload). */
  localOnly: SavedDeck[];
}

/**
 * The account's decks merged into this browser's: the account wins for a deck both have unless
 * this browser edited it later; a tombstone drops the deck here unless this browser edited it
 * after the delete. Decks only this browser has stay (nothing is lost) and are returned to offer.
 */
export function mergeDecks(
  local: readonly SavedDeck[],
  remote: readonly AccountDeck[],
): DeckMerge {
  const byId = new Map(remote.map((d) => [d.id, d]));
  const decks: SavedDeck[] = [];
  const push: SavedDeck[] = [];
  const localOnly: SavedDeck[] = [];
  const seen = new Set<string>();
  for (const mine of local) {
    const theirs = byId.get(mine.id);
    seen.add(mine.id);
    if (!theirs) {
      decks.push(mine);
      localOnly.push(mine);
    } else if (later(editedAt(mine), theirs.updatedAt)) {
      decks.push(mine);
      push.push(mine);
    } else if (!theirs.deleted) {
      decks.push(fromAccount(theirs, mine.savedAt));
    }
  }
  for (const theirs of remote)
    if (!seen.has(theirs.id) && !theirs.deleted)
      decks.push(fromAccount(theirs));
  return { decks, push, localOnly };
}

/** An account deck as a saved deck in this browser. */
export function fromAccount(
  deck: AccountDeck,
  savedAt = deck.updatedAt,
): SavedDeck {
  return {
    id: deck.id,
    name: deck.name,
    list: deck.list,
    savedAt,
    updatedAt: deck.updatedAt,
  };
}

/** Normalized list text, to tell a real name clash from the same deck saved twice. */
const sameList = (a: string, b: string) =>
  a
    .replace(/\r\n/g, "\n")
    .replace(/^\[deck\].*$/m, "")
    .trim() ===
  b
    .replace(/\r\n/g, "\n")
    .replace(/^\[deck\].*$/m, "")
    .trim();

export interface UploadPlan {
  /** Decks to upload as they are. */
  upload: SavedDeck[];
  /** This browser's decks whose name the account already uses for a different deck: ask. */
  clashes: { local: SavedDeck; account: SavedDeck }[];
  /** This browser's decks the account already has under the same name and list: nothing to do. */
  same: SavedDeck[];
}

/** The first sign-in's offer: this browser's decks merged into the account's by name. */
export function uploadPlan(
  localOnly: readonly SavedDeck[],
  account: readonly SavedDeck[],
): UploadPlan {
  const plan: UploadPlan = { upload: [], clashes: [], same: [] };
  for (const mine of localOnly) {
    const named = account.find(
      (d) => d.name.trim().toLowerCase() === mine.name.trim().toLowerCase(),
    );
    if (!named) plan.upload.push(mine);
    else if (sameList(named.list, mine.list)) plan.same.push(mine);
    else plan.clashes.push({ local: mine, account: named });
  }
  return plan;
}

/** How a name clash is settled: keep both (this browser's renamed), or one of the two. */
export type ClashChoice = "both" | "account" | "browser";

/** A name not in `taken`: "Name (this browser)", then "(this browser 2)" … */
export function freeName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const candidate =
      n === 1 ? `${name} (this browser)` : `${name} (this browser ${n})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Whether this browser already answered the upload offer for this player. */
export const offerKey = (playerId: string) => `gojisim.accountSync.${playerId}`;

export function offerAnswered(
  playerId: string,
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): boolean {
  try {
    return storage?.getItem(offerKey(playerId)) === "answered";
  } catch {
    return false;
  }
}

export function answerOffer(
  playerId: string,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(offerKey(playerId), "answered");
  } catch {
    // Blocked storage: the offer may show again next visit; nothing is lost.
  }
}

/** The account API (only answers with Discord sign-in; 404 otherwise). */
export interface AccountApi {
  decks(): Promise<AccountDeck[] | null>;
  putDeck(deck: SavedDeck): Promise<AccountDeck | null>;
  deleteDeck(id: string, at: string): Promise<AccountDeck | null>;
  settings(): Promise<{
    settings: Record<string, unknown> | null;
    updatedAt: string | null;
  } | null>;
  putSettings(
    settings: Record<string, unknown>,
    at: string,
  ): Promise<{ settings: Record<string, unknown>; updatedAt: string } | null>;
}

export function accountApi(
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): AccountApi {
  const json = async <T>(res: Promise<Response>): Promise<T | null> => {
    try {
      const r = await res;
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const send = (method: string, path: string, body: unknown) =>
    fetchImpl(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    decks: async () =>
      (await json<{ decks: AccountDeck[] }>(fetchImpl("/api/me/decks")))
        ?.decks ?? null,
    putDeck: async (deck) =>
      (
        await json<{ deck: AccountDeck }>(
          send("PUT", `/api/me/decks/${encodeURIComponent(deck.id)}`, {
            name: deck.name,
            list: deck.list,
            updatedAt: editedAt(deck),
          }),
        )
      )?.deck ?? null,
    deleteDeck: async (id, at) =>
      (
        await json<{ deck: AccountDeck }>(
          send("DELETE", `/api/me/decks/${encodeURIComponent(id)}`, {
            updatedAt: at,
          }),
        )
      )?.deck ?? null,
    settings: () => json(fetchImpl("/api/me/settings")),
    putSettings: (settings, at) =>
      json(send("PUT", "/api/me/settings", { settings, updatedAt: at })),
  };
}

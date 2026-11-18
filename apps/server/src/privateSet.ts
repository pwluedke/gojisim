import { readdir, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { CardListSchema } from "@gojisim/cards";
import { requestPlayer } from "./discordAuth.js";
import type { Player } from "./players.js";

/*
 * Paul's private card set (approved Nov 17): cards only some accounts see until they're made
 * public. Their data lives in a private repo, checked out as `private/` (`PRIVATE_SET_DIR`), with
 * the public repo's paths. `GET /api/private-set` sends the cards, their abilities and the decks
 * that use them to the accounts in `PRIVATE_SET_OWNERS` (Discord ids) and answers 404 to everyone
 * else, the same 404 as when there's no private set, so the route says nothing about whether one
 * exists. The owners are a server setting, never written in the public code.
 */

export interface PrivateSet {
  cards: unknown[];
  /** Every ability file in the set, merged: card number → abilities entry. */
  abilities: Record<string, unknown>;
  decks: { name: string; list: string }[];
}

/** The `PRIVATE_SET_OWNERS` Discord ids. */
export function privateSetOwnersFrom(
  env: Record<string, string | undefined>,
): ReadonlySet<string> {
  return new Set(
    (env["PRIVATE_SET_OWNERS"] ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^\d{1,30}$/.test(id)),
  );
}

export function isPrivateSetOwner(
  player: Pick<Player, "discordId"> | null,
  owners: ReadonlySet<string>,
): boolean {
  return !!player?.discordId && owners.has(player.discordId);
}

const DATA = join("packages", "cards", "data");

/** The private set in `dir`, or null when there's none (no folder, or no cards file). */
export async function readPrivateSet(dir: string): Promise<PrivateSet | null> {
  let raw: string;
  try {
    raw = await readFile(join(dir, DATA, "private-cards.json"), "utf8");
  } catch {
    return null;
  }
  const cards = CardListSchema.parse(JSON.parse(raw));
  const abilities: Record<string, unknown> = {};
  const abilityDir = join(dir, DATA, "abilities");
  for (const file of (await readdir(abilityDir).catch(() => [])).sort())
    if (file.endsWith(".json"))
      Object.assign(
        abilities,
        JSON.parse(await readFile(join(abilityDir, file), "utf8")) as object,
      );
  const decks: PrivateSet["decks"] = [];
  const deckDir = join(dir, DATA, "decks");
  for (const file of (await readdir(deckDir).catch(() => [])).sort())
    if (file.endsWith(".txt")) {
      const list = await readFile(join(deckDir, file), "utf8");
      const name = /^\[deck\]\s*(.+)$/m.exec(list)?.[1]?.trim() ?? file;
      decks.push({ name, list });
    }
  return { cards, abilities, decks };
}

/** The set's card numbers, for telling a record or a deck that holds one. */
export function privateCardNumbers(
  set: PrivateSet | null,
): ReadonlySet<string> {
  return new Set(
    (set?.cards ?? []).map(
      (c) => (c as { deckCardNumber: string }).deckCardNumber,
    ),
  );
}

export function privateSetMiddleware({
  dir,
  owners,
}: {
  /** The private checkout (`PRIVATE_SET_DIR`; `private` at the repo root by default). */
  dir: string;
  owners: ReadonlySet<string>;
}) {
  // Read once, on first use: the set changes only with a new build.
  let set: Promise<PrivateSet | null> | null = null;
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path !== "/api/private-set") {
      next();
      return;
    }
    set ??= readPrivateSet(dir).catch(() => null);
    const data = isPrivateSetOwner(requestPlayer(req), owners)
      ? await set
      : null;
    if (!data || req.method !== "GET") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    });
    res.end(JSON.stringify(data));
  };
}

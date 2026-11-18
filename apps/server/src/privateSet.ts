import { readdir, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { CardListSchema } from "@gojisim/cards";
import { requestPlayer } from "./discordAuth.js";
import type { Player } from "./players.js";
import { IMAGE_FILE, IMAGES } from "./privatePull.js";

/*
 * Paul's private card set (approved Nov 17): cards only some accounts see until they're made
 * public. Their data lives in a private repo, checked out as `private/` (`PRIVATE_SET_DIR`), with
 * the public repo's paths. `GET /api/private-set` sends the cards, their abilities and the decks
 * that use them to the accounts in `PRIVATE_SET_OWNERS` (Discord ids) and answers 404 to everyone
 * else, the same 404 as when there's no private set, so the route says nothing about whether one
 * exists. The owners are a server setting, never written in the public code.
 *
 * Its card pictures, where the set has them, go the same way: `images` in that answer lists the
 * card numbers with one, and `GET /api/private-set/image/<card number>` sends it to the owners
 * only (the same 404 otherwise). They're never in the public build or `/cards/`.
 */

export interface PrivateSet {
  cards: unknown[];
  /** Every ability file in the set, merged: card number → abilities entry. */
  abilities: Record<string, unknown>;
  decks: { name: string; list: string }[];
  /** The card numbers that have a picture (`/api/private-set/image/<card number>`). */
  images?: string[];
}

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** The set's pictures in `dir`: card number → file name. */
export async function readPrivateImages(
  dir: string,
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const file of (await readdir(join(dir, IMAGES)).catch(() => [])).sort())
    if (IMAGE_FILE.test(file)) found.set(file.replace(/\.[^.]+$/, ""), file);
  return found;
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
    const picture =
      /^\/api\/private-set\/image\/([A-Za-z0-9]+-[A-Za-z0-9]+)$/.exec(
        path,
      )?.[1];
    if (path !== "/api/private-set" && !picture) {
      next();
      return;
    }
    const notFound = () => {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
    };
    set ??= readPrivateSet(dir).catch(() => null);
    const data = isPrivateSetOwner(requestPlayer(req), owners)
      ? await set
      : null;
    if (!data || req.method !== "GET") {
      notFound();
      return;
    }
    // Pulled in the background after the start, so read on each request.
    const images = await readPrivateImages(dir);
    if (picture) {
      const file = images.get(picture);
      const type = file && IMAGE_TYPES[file.split(".").pop()!.toLowerCase()];
      const bytes =
        file && type
          ? await readFile(join(dir, IMAGES, file)).catch(() => null)
          : null;
      if (!bytes || !type) {
        notFound();
        return;
      }
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "private, max-age=3600",
      });
      res.end(bytes);
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    });
    res.end(JSON.stringify({ ...data, images: [...images.keys()] }));
  };
}

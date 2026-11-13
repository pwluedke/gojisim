import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "./db/db.js";
import type { Player } from "./players.js";

/*
 * #279: accounts in the Vite dev server (local work and the e2e tests), from the dev sign-in's
 * players (`/auth/dev?as=<name>`): one database next to the dev server's records, shared by the
 * game collection (My games: `GET /api/games/mine`, `GET /api/games/<id>`, uploads indexed per
 * player) and the head to head rooms. `vite.config.ts` makes it in `configureServer`, which a
 * build never runs; the deployed server has Discord sign-in and its own database.
 */
export interface DevAccounts {
  db: DatabaseSync;
  /** The request's dev player as a `Player` (its row made on first sight), or `null`. */
  playerOf: (req: IncomingMessage) => Player | null;
}

export function devAccounts(
  devPlayerOf: (req: IncomingMessage) => { id: string; name: string } | null,
  recordsDir: string,
): DevAccounts {
  const db = openDb(join(recordsDir, "dev-accounts.sqlite"), { log: () => {} });
  const add = db.prepare(
    "INSERT INTO players (id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, last_seen_at = excluded.last_seen_at",
  );
  return {
    db,
    playerOf: (req) => {
      const dev = devPlayerOf(req);
      if (!dev) return null;
      const now = Date.now();
      add.run(dev.id, dev.name, now, now);
      return {
        id: dev.id,
        discordId: null,
        displayName: dev.name,
        avatarUrl: null,
        createdAt: now,
        lastSeenAt: now,
        rolesCheckedAt: null,
      };
    },
  };
}

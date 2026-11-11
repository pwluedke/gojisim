import type { Server as HttpServer, IncomingMessage } from "node:http";
import { openDb } from "../db/db.js";
import type { Player } from "../players.js";
import { attachH2h, type H2h } from "./socket.js";

/*
 * Head to head in the Vite dev server (M9b, local work and the e2e tests): the same rooms and
 * socket on the dev server's port, with an in-memory database and the dev sign-in's players
 * (`/auth/dev?as=<name>`). `vite.config.ts` loads it in `configureServer`, which a build never
 * runs; the deployed server attaches `socket.ts` itself with Discord sign-in.
 */
export function attachDevH2h(
  server: HttpServer,
  {
    devPlayerOf,
    roomsDir,
    recordsDir,
  }: {
    devPlayerOf: (req: IncomingMessage) => { id: string; name: string } | null;
    roomsDir: string;
    recordsDir: string;
  },
): H2h {
  const db = openDb(":memory:", { log: () => {} });
  const add = db.prepare(
    "INSERT INTO players (id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name",
  );
  return attachH2h(server, {
    db,
    playerOf: (req): Player | null => {
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
    roomsDir,
    recordsDir,
  });
}

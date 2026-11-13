import type { Server as HttpServer } from "node:http";
import type { DevAccounts } from "../devAccounts.js";
import { replayMiddleware } from "./replayRoute.js";
import { attachH2h, type H2h } from "./socket.js";

/*
 * Head to head in the Vite dev server (M9b, local work and the e2e tests): the same rooms and
 * socket on the dev server's port, with the dev accounts (#279: the dev sign-in's players and the
 * database My games reads, `devAccounts.ts`). `vite.config.ts` loads it in `configureServer`, which a build never
 * runs; the deployed server attaches `socket.ts` itself with Discord sign-in.
 */
export function attachDevH2h(
  server: HttpServer,
  {
    accounts,
    roomsDir,
    recordsDir,
    claimAfterMs,
  }: {
    accounts: DevAccounts;
    roomsDir: string;
    recordsDir: string;
    /** Playwright shortens the claim time (`H2H_CLAIM_MS`). */
    claimAfterMs?: number | undefined;
  },
): {
  h2h: H2h;
  /** M9c: Replay of finished games, for the dev server's middlewares. */
  replay: ReturnType<typeof replayMiddleware>;
} {
  const { db } = accounts;
  const h2h = attachH2h(server, {
    db,
    playerOf: accounts.playerOf,
    roomsDir,
    recordsDir,
    ...(claimAfterMs ? { claimAfterMs } : {}),
  });
  const replay = replayMiddleware({
    db,
    recordsDir,
    playerOf: (req) => {
      const player = accounts.playerOf(req);
      return player ? { id: player.id } : null;
    },
  });
  return { h2h, replay };
}

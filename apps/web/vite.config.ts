import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { decklogMiddleware } from "../server/src/decklog.js";
import {
  gamesMiddleware,
  siteConfig,
  uploadsPerMinuteFrom,
} from "../server/src/games.js";
import { join } from "node:path";
import { devAccounts, type DevAccounts } from "../server/src/devAccounts.js";
import { devDeckResults } from "./devDeckResults";
import { devPlayerOf, devSignIn } from "./devSignIn";

/** The dev server's records folder (Playwright sets `RECORDS_DIR`). */
const recordsDir = () =>
  process.env["RECORDS_DIR"] ??
  new URL("../../records", import.meta.url).pathname;

/**
 * #279: the dev accounts, made once when the dev server starts (a build never calls this): the
 * dev sign-in's players and one database for My games and head to head, next to the records.
 */
let accounts: DevAccounts | null = null;
const devAccountsOnce = () =>
  (accounts ??= devAccounts(devPlayerOf, recordsDir()));

export default defineConfig({
  plugins: [
    react(),
    {
      // Decklog import: the dev server answers `GET /api/decklog/<code>` with the same route
      // `apps/server` serves (Decklog has no CORS headers, so the browser can't fetch it).
      name: "gojisim-decklog",
      configureServer(server) {
        server.middlewares.use(decklogMiddleware());
      },
    },
    {
      // #150: the dev sign-in, in the dev server only (a build never runs `configureServer`);
      // the deployed server has no such route.
      name: "gojisim-dev-sign-in",
      configureServer(server) {
        server.middlewares.use(devSignIn());
      },
    },
    {
      // Paul, Nov 9: the bot results next to a deck tagged Meta, from the local `bot-reports/`,
      // in the dev server only (Paul's Mac); the deployed server has no such route.
      name: "gojisim-dev-deck-results",
      configureServer(server) {
        const root = new URL("../..", import.meta.url).pathname;
        server.middlewares.use(
          devDeckResults(
            process.env["GOJISIM_BOT_REPORTS"] ?? join(root, "bot-reports"),
            root,
          ),
        );
      },
    },
    {
      // M9b: head to head on the dev server's port (before the game collection, whose
      // `/api/games/` routes would answer M9c's replay route first), with the dev sign-in's players. The room
      // module loads through Vite (it imports the engine's TypeScript source) once the server is
      // up; rooms go to a gitignored folder (Playwright sets `H2H_ROOMS_DIR`), records with the
      // uploads.
      name: "gojisim-h2h",
      configureServer(server) {
        const http = server.httpServer;
        if (!http) return;
        const root = new URL("../..", import.meta.url).pathname;
        // M9c: Replay of finished online games, once the module has loaded.
        let replay:
          | ReturnType<
              typeof import("../server/src/h2h/dev.js").attachDevH2h
            >["replay"]
          | null = null;
        server.middlewares.use((req, res, next) => {
          if (replay) void replay(req, res, next);
          else next();
        });
        http.once("listening", () => {
          void server
            .ssrLoadModule(
              new URL("../server/src/h2h/dev.ts", import.meta.url).pathname,
            )
            .then((mod) => {
              const attached = (
                mod as typeof import("../server/src/h2h/dev.js")
              ).attachDevH2h(http as import("node:http").Server, {
                accounts: devAccountsOnce(),
                roomsDir:
                  process.env["H2H_ROOMS_DIR"] ?? join(root, "records-rooms"),
                recordsDir: recordsDir(),
                claimAfterMs:
                  Number(process.env["H2H_CLAIM_MS"] ?? 0) || undefined,
              });
              replay = attached.replay;
            });
        });
      },
    },
    {
      // Game collection (M13b): `GET /api/config` and `POST /api/games`, as `apps/server` serves
      // them. Uploads go to the repository's gitignored `records/` (Playwright sets
      // `RECORDS_DIR`); `GOJISIM_TEST_SITE=off` turns the Test Site off here too. #279: with the
      // dev sign-in's player and the dev accounts' database, so My games (`GET /api/games/mine`,
      // `GET /api/games/<id>`) works for a dev sign-in as it does on the server.
      name: "gojisim-games",
      configureServer(server) {
        const { db, playerOf } = devAccountsOnce();
        server.middlewares.use(
          gamesMiddleware({
            config: siteConfig(process.env),
            recordsDir: recordsDir(),
            uploadsPerMinute: uploadsPerMinuteFrom(process.env),
            playerOf,
            db,
          }),
        );
      },
    },
  ],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { decklogMiddleware } from "../server/src/decklog.js";
import {
  gamesMiddleware,
  siteConfig,
  uploadsPerMinuteFrom,
} from "../server/src/games.js";
import { join } from "node:path";
import { devDeckResults } from "./devDeckResults";
import { devPlayerOf, devSignIn } from "./devSignIn";

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
      // Game collection (M13b): `GET /api/config` and `POST /api/games`, as `apps/server` serves
      // them. Uploads go to the repository's gitignored `records/` (Playwright sets
      // `RECORDS_DIR`); `GOJISIM_TEST_SITE=off` turns the Test Site off here too.
      name: "gojisim-games",
      configureServer(server) {
        server.middlewares.use(
          gamesMiddleware({
            config: siteConfig(process.env),
            recordsDir:
              process.env["RECORDS_DIR"] ??
              new URL("../../records", import.meta.url).pathname,
            uploadsPerMinute: uploadsPerMinuteFrom(process.env),
          }),
        );
      },
    },
    {
      // M9b: head to head on the dev server's port, with the dev sign-in's players. The room
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
                devPlayerOf,
                roomsDir:
                  process.env["H2H_ROOMS_DIR"] ?? join(root, "records-rooms"),
                recordsDir:
                  process.env["RECORDS_DIR"] ??
                  new URL("../../records", import.meta.url).pathname,
                claimAfterMs:
                  Number(process.env["H2H_CLAIM_MS"] ?? 0) || undefined,
              });
              replay = attached.replay;
            });
        });
      },
    },
  ],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

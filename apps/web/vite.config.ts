import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { decklogMiddleware } from "../server/src/decklog.js";
import {
  gamesMiddleware,
  siteConfig,
  uploadsPerMinuteFrom,
} from "../server/src/games.js";
import { devSignIn } from "./devSignIn";

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
  ],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

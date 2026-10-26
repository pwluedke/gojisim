import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { decklogMiddleware } from "../server/src/decklog.js";
import { localDecksPlugin } from "./localDecksPlugin";

// Development decks: the repository's `local-decks/` in the dev server (Paul's machine only; the
// folder is gitignored). Unit tests read the e2e fixture folder instead, never Paul's files.
const localDecks = process.env["VITEST"]
  ? new URL("./e2e/fixtures/local-decks", import.meta.url).pathname
  : new URL("../../local-decks", import.meta.url).pathname;

export default defineConfig({
  plugins: [
    react(),
    localDecksPlugin(localDecks),
    {
      // Decklog import: the dev server answers `GET /api/decklog/<code>` with the same route
      // `apps/server` serves (Decklog has no CORS headers, so the browser can't fetch it).
      name: "gojisim-decklog",
      configureServer(server) {
        server.middlewares.use(decklogMiddleware());
      },
    },
  ],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

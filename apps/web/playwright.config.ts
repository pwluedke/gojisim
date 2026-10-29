import { defineConfig, devices } from "@playwright/test";

const PORT = 5179;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI runs the specs in 3 shards; each keeps a blob report, merged into one HTML report when a
  // shard fails (ci.yml).
  reporter: process.env.CI ? [["github"], ["blob"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Card animations and sound are off in every spec unless it says otherwise (M5f): the m5f spec
    // tests animations, sound.spec.ts the sounds.
    storageState: "e2e/animation-off.json",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // The development decks come from a fixture folder of made-up decks, never Paul's files.
    // Uploads (M13b) go to a gitignored folder the specs read, never the repository's records/.
    env: {
      GOJISIM_LOCAL_DECKS: "e2e/fixtures/local-decks",
      RECORDS_DIR: "e2e-records",
    },
  },
});

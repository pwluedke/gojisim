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
    // Uploads (M13b) go to a gitignored folder the specs read, never the repository's records/.
    env: {
      RECORDS_DIR: "e2e-records",
      // #123: every worker uploads from one IP to this one server; production keeps 30 a minute.
      GOJISIM_UPLOADS_PER_MINUTE: "1000",
      // #134: the What's new tag comes from a path the specs route, never GitHub's API.
      VITE_RELEASES_API: "/__e2e/releases/latest",
    },
  },
});

import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

/**
 * The production build behind the testers' password (deploy for testers): `pnpm build` first,
 * then `pnpm --filter @gojisim/web e2e:prod` runs `e2e-prod/` against `apps/server` serving
 * `apps/web/dist` with the gate on. The card folder holds a made-up placeholder, never a real
 * card image.
 */
export default defineConfig({
  testDir: "./e2e-prod",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node ../server/dist/index.js",
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      GOJISIM_PASSWORD: "e2e testers only",
      SESSION_SECRET: "e2e-session-secret-0123456789abcdef",
      CARDS_DIR: "e2e-prod/cards",
      // Uploads (M13b) go to a throwaway folder, never the volume path.
      RECORDS_DIR: "test-results/prod-records",
    },
  },
});

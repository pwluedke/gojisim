import { defineConfig, devices } from "@playwright/test";

/**
 * The post-deploy smoke check against the live site (#92): `SMOKE_URL` (the Smoke check workflow
 * sets https://gojisim.somanygames.app) and `SMOKE_PASSWORD` (the `SITE_PASSWORD` secret). Traces,
 * videos and Playwright's screenshots are off, since they would record the password being typed;
 * the spec takes its own failure screenshot once past the login page. The JSON report names the
 * failed step for the Slack message (`pnpm smoke report`).
 */
export default defineConfig({
  testDir: "./e2e-prod",
  testMatch: "smoke.spec.ts",
  retries: 1,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "smoke-results/results.json" }]],
  outputDir: "smoke-results/output",
  use: {
    baseURL: process.env.SMOKE_URL,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

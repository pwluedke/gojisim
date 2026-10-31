import { defineRailway, github, project, service, volume } from "railway/iac";

/*
 * GojiSim's Railway service as Infrastructure as Code (#79). It replaces `railway.json`, which
 * Railway stops reading on 2026-12-01. Generated with `railway config migrate --variables=unmanaged`
 * and `railway config pull --json`, then checked by hand against `railway.json`:
 *
 * - build: `pnpm build` with Railpack, watching every path (railway.json's; the dashboard's older
 *   `pnpm --filter @gojisim/server build` was never used while railway.json was read);
 * - start: `node apps/server/dist/index.js`; healthcheck `/healthz` with a 100 s timeout;
 * - restart policy: railway.json's ON_FAILURE with 10 retries is Railway's default, so it isn't set;
 * - deploys only from the `release` branch, which only Paul moves (docs/deploy.md);
 * - the card image volume is declared as it is, so nothing is detached or resized: never remove it
 *   from this file, since this partial would then delete it;
 * - variables stay unmanaged (`managed: false`): values live only in Railway's dashboard, and a plan
 *   or apply can't change or delete them. The service reads CARDS_DIR, GOJISIM_PASSWORD,
 *   GOJISIM_TEST_SITE, RECORDS_DIR and SESSION_SECRET.
 *
 * Paul plans and applies it (docs/deploy.md); nothing in CI reads this file.
 */

// This repository manages only its own resources in the environment.
export const partial = "gojisim-server";

export default defineRailway(() => {
  const data = volume("@gojisim/server-volume", {
    region: "us-west2",
    sizeMB: 5000,
  });
  const server = service("@gojisim/server", {
    source: github("pwluedke/gojisim", {
      branch: "release",
      checkSuites: true,
      rootDirectory: "/",
    }),
    build: {
      buildCommand: "pnpm build",
      buildEnvironment: "V3",
      builder: "RAILPACK",
      watchPatterns: ["**"],
    },
    start: "node apps/server/dist/index.js",
    healthcheck: "/healthz",
    healthcheckTimeout: 100,
    replicas: { "us-west2": 1 },
    domains: ["gojisim.somanygames.app"],
    networking: { privateNetworkEndpoint: "gojisimserver" },
    volumeMounts: { "/data": data },
  });

  return project("exemplary-cooperation", {
    variables: { managed: false },
    resources: [server, data],
  });
});

// M9a: the server imports @gojisim/engine and @gojisim/cards, which publish TypeScript source,
// so tsc's per-file output can't run them. esbuild bundles each entry into dist/ (the same paths
// as before, so Railway's start command and `pnpm accounts:reset-history` don't change); npm
// packages stay external and load from node_modules.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts", "src/resetHistory.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: ["socket.io", "zod"],
  logLevel: "warning",
});

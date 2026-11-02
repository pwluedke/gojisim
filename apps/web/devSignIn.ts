import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The dev sign-in (#150): only the Vite dev server (local work and the e2e tests) mounts it, from
 * `vite.config.ts`'s `configureServer`, which a build never runs, and never with
 * `NODE_ENV=production`. `apps/server` has no such route, so the deployed site can't have it
 * (`e2e-prod/accounts.spec.ts` checks the built server).
 *
 * - `GET /auth/dev?next=/play` signs in as "Dev Tester" (a plain cookie, nothing secret).
 * - `GET /api/me` answers that player while signed in, else 404 like the password-gated server.
 * - `POST /auth/logout` signs out.
 */
export const DEV_COOKIE = "gojisim_dev_player";
export const DEV_PLAYER = { id: "dev", name: "Dev Tester", avatarUrl: null };

const signedIn = (req: IncomingMessage) =>
  (req.headers.cookie ?? "")
    .split(";")
    .some((part) => part.trim() === `${DEV_COOKIE}=1`);

/** A local path for `next`, as the server's `safeNext` allows. */
const localPath = (next: string | null) =>
  next && /^\/(?!\/)[^\\\s]*$/.test(next) ? next : "/";

export function devSignIn(
  env: Record<string, string | undefined> = process.env,
) {
  if (env["NODE_ENV"] === "production")
    throw new Error(
      "The dev sign-in is never mounted with NODE_ENV=production.",
    );
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/auth/dev" && req.method === "GET") {
      res.writeHead(303, {
        location: localPath(url.searchParams.get("next")),
        "set-cookie": `${DEV_COOKIE}=1; Path=/; SameSite=Lax`,
      });
      res.end();
      return;
    }
    if (url.pathname === "/auth/logout" && req.method === "POST") {
      res.writeHead(303, {
        location: "/",
        "set-cookie": `${DEV_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`,
      });
      res.end();
      return;
    }
    if (url.pathname === "/api/me" && req.method === "GET") {
      res.writeHead(signedIn(req) ? 200 : 404, {
        "content-type": "application/json",
      });
      res.end(
        JSON.stringify(signedIn(req) ? DEV_PLAYER : { error: "no-accounts" }),
      );
      return;
    }
    next();
  };
}

import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The dev sign-in (#150): only the Vite dev server (local work and the e2e tests) mounts it, from
 * `vite.config.ts`'s `configureServer`, which a build never runs, and never with
 * `NODE_ENV=production`. `apps/server` has no such route, so the deployed site can't have it
 * (`e2e-prod/accounts.spec.ts` checks the built server).
 *
 * - `GET /auth/dev?next=/play` signs in as "Dev Tester" (a plain cookie, nothing secret).
 * - `GET /auth/dev?as=Bob&next=/play` (M9a) signs in as a player named Bob (id `dev-bob`), so one
 *   test can sign two browsers in as two players for a head to head game. A name is 1 to 24
 *   letters, digits, spaces, `-` or `_`; anything else signs in as Dev Tester.
 * - `GET /api/me` answers that player while signed in, else 404 like the password-gated server.
 * - `POST /auth/logout` signs out.
 */
export const DEV_COOKIE = "gojisim_dev_player";
export const DEV_PLAYER = {
  id: "dev",
  name: "Dev Tester",
  avatarUrl: null,
  // #153: as the server says until the launch reset.
  season: "beta",
};

const DEV_NAME = /^[A-Za-z0-9 _-]{1,24}$/;

/** A `?as=` name's player: its id is the name in lower case, spaces as dashes. */
export function devPlayerNamed(name: string): typeof DEV_PLAYER {
  return {
    ...DEV_PLAYER,
    id: `dev-${name.toLowerCase().replace(/ /g, "-")}`,
    name,
  };
}

/**
 * The dev player a request is signed in as, or `null`: the cookie is `1` for Dev Tester, or a
 * `?as=` name (URL-encoded). The head to head dev server (M9b) signs sockets in with this too.
 */
export function devPlayerOf(req: IncomingMessage): typeof DEV_PLAYER | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== DEV_COOKIE) continue;
    const value = rest.join("=");
    if (value === "1") return DEV_PLAYER;
    let name: string;
    try {
      name = decodeURIComponent(value);
    } catch {
      return null;
    }
    return DEV_NAME.test(name) ? devPlayerNamed(name) : null;
  }
  return null;
}

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
      const as = url.searchParams.get("as");
      const value = as && DEV_NAME.test(as) ? encodeURIComponent(as) : "1";
      res.writeHead(303, {
        location: localPath(url.searchParams.get("next")),
        "set-cookie": `${DEV_COOKIE}=${value}; Path=/; SameSite=Lax`,
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
      const player = devPlayerOf(req);
      res.writeHead(player ? 200 : 404, {
        "content-type": "application/json",
      });
      res.end(JSON.stringify(player ?? { error: "no-accounts" }));
      return;
    }
    next();
  };
}

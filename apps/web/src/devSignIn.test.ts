import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { DEV_COOKIE, devSignIn } from "../devSignIn";

/*
 * The dev sign-in's `?as=<name>` (M9a): two browsers signed in as two players, in the dev server
 * only. The production build and `apps/server` never have it (`e2e-prod/accounts.spec.ts`,
 * `apps/server/src/h2h/appServer.test.ts`).
 */

let close: (() => void) | null = null;
afterEach(() => {
  close?.();
  close = null;
});

async function serve() {
  const middleware = devSignIn({});
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise<void>((r) => server.listen(0, r));
  close = () => server.close();
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const signIn = async (query: string) => {
    const res = await fetch(`${base}/auth/dev?${query}`, {
      redirect: "manual",
    });
    return /^[^;]+/.exec(res.headers.get("set-cookie") ?? "")?.[0] ?? "";
  };
  const me = async (cookie: string) => {
    const res = await fetch(`${base}/api/me`, { headers: { cookie } });
    return {
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
    };
  };
  return { signIn, me };
}

describe("the dev sign-in (#150, M9a ?as=)", () => {
  it("?as=<name> signs in as that player; two names are two players", async () => {
    const { signIn, me } = await serve();
    const bob = await signIn("as=Bob&next=/play");
    const ann = await signIn("as=Ann%20Lee");
    expect(await me(bob)).toEqual({
      status: 200,
      body: { id: "dev-bob", name: "Bob", avatarUrl: null, season: "beta" },
    });
    expect((await me(ann)).body).toMatchObject({
      id: "dev-ann-lee",
      name: "Ann Lee",
    });
  });

  it("without ?as=, or with a name it doesn't allow, it's Dev Tester as before", async () => {
    const { signIn, me } = await serve();
    expect(await signIn("next=/")).toBe(`${DEV_COOKIE}=1`);
    expect(await signIn("as=%3Cscript%3E")).toBe(`${DEV_COOKIE}=1`);
    expect(await signIn(`as=${"x".repeat(25)}`)).toBe(`${DEV_COOKIE}=1`);
    expect((await me(`${DEV_COOKIE}=1`)).body).toMatchObject({
      id: "dev",
      name: "Dev Tester",
    });
    expect((await me(`${DEV_COOKIE}=%3Cb%3E`)).status).toBe(404);
  });

  it("is never mounted with NODE_ENV=production", () => {
    expect(() => devSignIn({ NODE_ENV: "production" })).toThrow();
  });
});

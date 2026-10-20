import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createAppServer } from "./index.js";

describe("@gojisim/server", () => {
  const server = createAppServer();

  afterEach(() => {
    server.close();
  });

  it("responds with ok status", async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

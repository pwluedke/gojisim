import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const USER_AGENT =
  "GojiSim-scraper (personal project; contact pwluedke)";

export interface FetcherOptions {
  cacheDir: string;
  /** Minimum gap between network requests. The site asked for at most 1 request per second. */
  minIntervalMs?: number;
  log?: (message: string) => void;
}

/** Rate-limited HTTP client that caches every successful response body on disk. */
export class PoliteFetcher {
  private readonly cacheDir: string;
  private readonly minIntervalMs: number;
  private readonly log: (message: string) => void;
  private readonly cookies = new Map<string, string>();
  private lastRequestAt = 0;
  networkRequests = 0;

  constructor(options: FetcherOptions) {
    this.cacheDir = options.cacheDir;
    this.minIntervalMs = options.minIntervalMs ?? 1100;
    this.log = options.log ?? (() => {});
  }

  async readCache(cacheKey: string): Promise<string | null> {
    try {
      return await readFile(join(this.cacheDir, cacheKey), "utf8");
    } catch {
      return null;
    }
  }

  async writeCache(cacheKey: string, body: string): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(join(this.cacheDir, cacheKey), body);
  }

  /** GET `url`, served from the cache when `cacheKey` is given and present. */
  async get(url: string, cacheKey?: string): Promise<string> {
    if (cacheKey) {
      const cached = await this.readCache(cacheKey);
      if (cached !== null) return cached;
    }
    const body = await this.request(url, { method: "GET" });
    if (cacheKey) await this.writeCache(cacheKey, body);
    return body;
  }

  async postForm(
    url: string,
    form: URLSearchParams,
    headers: Record<string, string>,
  ): Promise<string> {
    return this.request(url, {
      method: "POST",
      body: form,
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...headers,
      },
    });
  }

  private async request(url: string, init: RequestInit): Promise<string> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
    this.networkRequests++;
    this.log(`${init.method} ${url}`);

    const headers = new Headers(init.headers);
    headers.set("user-agent", USER_AGENT);
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    const res = await fetch(url, { ...init, headers });
    for (const setCookie of res.headers.getSetCookie()) {
      const [pair = ""] = setCookie.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0)
        this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    if (!res.ok) {
      throw new Error(`${init.method} ${url} failed: HTTP ${res.status}`);
    }
    return res.text();
  }
}

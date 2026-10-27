import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/** The file under `root` for a URL path, or null if the path would leave `root`. */
export function fileUnder(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const file = normalize(join(root, decoded));
  const base = root.endsWith(sep) ? root : root + sep;
  return file.startsWith(base) ? file : null;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function send(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  cacheControl: string,
): void {
  res.writeHead(200, {
    "content-type":
      TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": cacheControl,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  // A file that goes away mid-read cuts the response off instead of stopping the server.
  createReadStream(file)
    .on("error", (error) => {
      console.error("File read failed:", error);
      res.destroy();
    })
    .pipe(res);
}

/**
 * Serves `/cards/<file>` from `cardsDir` (the card image volume, docs/deploy.md). Card images
 * don't change once made, so browsers keep them for 30 days.
 */
export function cardImages(cardsDir: string) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/cards/")) return next();
    const file = fileUnder(cardsDir, path.slice("/cards/".length));
    if (!file || !(await isFile(file))) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("No such card image.");
      return;
    }
    send(req, res, file, "public, max-age=2592000");
  };
}

/**
 * Serves the built web app from `distDir`. Vite's hashed files under `/assets/` are cached for a
 * year; everything else is checked on every visit. A path with no file extension is an app route
 * (`/play`, `/debug`): it gets `index.html`, and the app's path router takes over.
 */
export function webApp(distDir: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" });
      res.end();
      return;
    }
    const file = fileUnder(distDir, path === "/" ? "index.html" : path);
    if (file && (await isFile(file))) {
      send(
        req,
        res,
        file,
        path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      return;
    }
    if (!extname(path)) {
      send(req, res, join(distDir, "index.html"), "no-cache");
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found.");
  };
}

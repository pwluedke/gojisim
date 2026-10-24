import { createServer, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { decklogMiddleware } from "./decklog.js";

/** The app server: `GET /api/decklog/<code>` (Decklog import), and an ok status otherwise. */
export function createAppServer(fetchImpl: typeof fetch = fetch): Server {
  const decklog = decklogMiddleware(fetchImpl);
  return createServer((req, res) => {
    decklog(req, res, () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    });
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT ?? 3000);
  createAppServer().listen(port, () => {
    console.log(`GojiSim server listening on http://localhost:${port}`);
  });
}

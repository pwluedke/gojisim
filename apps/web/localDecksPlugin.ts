import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Plugin } from "vite";

/** The virtual module the web app imports the development deck files from. */
export const LOCAL_DECKS_MODULE = "virtual:gojisim-local-decks";
const RESOLVED = `\0${LOCAL_DECKS_MODULE}`;

/** One development deck file: its name and its deck list text. */
export interface LocalDeckFile {
  file: string;
  text: string;
}

/**
 * The deck list files in `dir` (`*.txt`, sorted by name). A missing or unreadable folder (anyone
 * else's clone) is no files and no error.
 */
export function readLocalDeckFiles(dir: string): LocalDeckFile[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".txt"));
  } catch {
    return [];
  }
  return names.sort().flatMap((file) => {
    try {
      return [{ file, text: readFileSync(resolve(dir, file), "utf8") }];
    } catch {
      return [];
    }
  });
}

/**
 * The development decks (Monarch, Oct 25, 2026): in the Vite dev server only, every
 * `local-decks/*.txt` is served as `virtual:gojisim-local-decks`, read at startup and again
 * (with a page reload) whenever a file there is added, changed or removed. A production build
 * gets an empty list, so no deck text from the folder ever reaches the bundle. `dir` is the
 * repository's `local-decks/` unless `GOJISIM_LOCAL_DECKS` names another folder (the e2e and
 * unit tests point it at a fixture folder of made-up decks).
 */
export function localDecksPlugin(dir: string): Plugin {
  const folder = resolve(process.env["GOJISIM_LOCAL_DECKS"] ?? dir);
  let serving = false;
  return {
    name: "gojisim-local-decks",
    configResolved(config) {
      serving = config.command === "serve";
    },
    resolveId(id) {
      return id === LOCAL_DECKS_MODULE ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      const files = serving ? readLocalDeckFiles(folder) : [];
      return `export const files = ${JSON.stringify(files)};`;
    },
    configureServer(server) {
      server.watcher.add(folder);
      const changed = (path: string) => {
        if (resolve(path, "..") !== folder || !path.endsWith(".txt")) return;
        const module = server.moduleGraph.getModuleById(RESOLVED);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
        server.config.logger.info(
          `local-decks: ${basename(path)} changed, reloading`,
          { timestamp: true },
        );
      };
      server.watcher.on("add", changed);
      server.watcher.on("change", changed);
      server.watcher.on("unlink", changed);
    },
  };
}

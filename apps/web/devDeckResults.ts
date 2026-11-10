import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, join } from "node:path";

/**
 * The bot results next to a deck's name (Paul, Nov 9), on Paul's Mac only: the Vite dev server
 * answers `GET /api/dev/deck-results` from the local, gitignored `bot-reports/` (a build never
 * runs `configureServer`, and `apps/server` has no such route, so the public site can't have it).
 * Each run plan's matchups with a report give the study deck's (seat a's) win rate against the
 * opponent deck; the latest report per opponent card list wins. A matchup with the same deck on
 * both sides (a level check, a mirror) says nothing about the deck and is left out.
 */
export const DECK_RESULTS_ROUTE = "/api/dev/deck-results";

export interface DeckResult {
  /** The opponent deck's card list (`deckSignature`), for matching by cards, not name. */
  signature: string;
  /** "T7 65%": the study deck's short name and its win rate against this deck. */
  label: string;
  /** The report's time, newest first wins. */
  at: number;
}

/** A deck as this route needs it: its name, old names and card-list signature. */
interface FileDeck {
  name: string;
  was: string[];
  signature: string;
}

/**
 * Deck list text read just far enough for a signature. The Vite config loads this file directly,
 * so it can't import `@gojisim/cards` (its source imports have no extensions); the signature is
 * built as `deckSignature` builds it: each section's card numbers, prints ignored, sorted.
 */
export function readDecks(text: string): FileDeck[] {
  const decks: {
    name: string;
    was: string[];
    monster: string[];
    main: string[];
  }[] = [];
  let section: "monster" | "main" | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (header) {
      const tag = (header[1] ?? "").trim().toLowerCase();
      if (tag === "deck") {
        decks.push({
          name: (header[2] ?? "").trim(),
          was: [],
          monster: [],
          main: [],
        });
        section = null;
      } else if (tag === "monster deck") section = "monster";
      else if (tag === "main deck") section = "main";
      continue;
    }
    const deck = decks.at(-1);
    const was = /^#\s*was:\s*(.*)$/i.exec(line);
    if (deck && was?.[1]?.trim()) deck.was.push(was[1].trim());
    const entry = /^([1-9]\d*)\s+(\S+)$/.exec(line);
    if (!deck || !section || !entry) continue;
    for (let i = 0; i < Number(entry[1]); i++)
      deck[section].push((entry[2] ?? "").replace(/\+.*$/, ""));
  }
  return decks.map((d) => ({
    name: d.name,
    was: d.was,
    signature: `${[...d.monster].sort().join(",")}|${[...d.main].sort().join(",")}`,
  }));
}

interface PlanMatchup {
  id?: string;
  aDeck?: string;
  bDeck?: string;
}

/** A deck from `<file>#<name>`, the file read once; `null` when it isn't there. */
function deckFrom(
  spec: string,
  root: string,
  files: Map<string, FileDeck[]>,
): FileDeck | null {
  const cut = spec.indexOf("#");
  if (cut < 0) return null;
  const file = spec.slice(0, cut);
  const name = spec.slice(cut + 1).trim();
  const path = isAbsolute(file) ? file : join(root, file);
  if (!files.has(path))
    files.set(
      path,
      existsSync(path) ? readDecks(readFileSync(path, "utf8")) : [],
    );
  const decks = files.get(path) ?? [];
  return (
    decks.find((d) => d.name.trim() === name) ??
    decks.find((d) => d.was.some((w) => w.endsWith(`#${name}`))) ??
    null
  );
}

/** The short name a result shows: the deck name after its last "/" ("TECH/T7" is "T7"). */
const shortName = (name: string) =>
  name.slice(name.lastIndexOf("/") + 1).trim();

/** Every opponent deck's latest result, read from `reportsDir` (the repository's `bot-reports/`). */
export function deckResults(reportsDir: string, root: string): DeckResult[] {
  if (!existsSync(reportsDir)) return [];
  const files = new Map<string, FileDeck[]>();
  const latest = new Map<string, DeckResult>();
  for (const entry of readdirSync(reportsDir)) {
    if (!entry.endsWith("-plan.json")) continue;
    let plan: { name?: string; matchups?: PlanMatchup[] };
    try {
      plan = JSON.parse(readFileSync(join(reportsDir, entry), "utf8"));
    } catch {
      continue;
    }
    for (const m of plan.matchups ?? []) {
      if (!plan.name || !m.id || !m.aDeck || !m.bDeck) continue;
      const report = join(reportsDir, "plans", plan.name, `${m.id}.json`);
      if (!existsSync(report)) continue;
      const a = deckFrom(m.aDeck, root, files);
      const b = deckFrom(m.bDeck, root, files);
      if (!a || !b || a.signature === b.signature) continue;
      let games: { winner?: string }[];
      try {
        games = JSON.parse(readFileSync(report, "utf8")).games ?? [];
      } catch {
        continue;
      }
      if (games.length === 0) continue;
      const won = games.filter((g) => g.winner === "a").length;
      const result: DeckResult = {
        signature: b.signature,
        label: `${shortName(a.name)} ${Math.round((100 * won) / games.length)}%`,
        at: statSync(report).mtimeMs,
      };
      const seen = latest.get(result.signature);
      if (!seen || result.at > seen.at) latest.set(result.signature, result);
    }
  }
  return [...latest.values()];
}

/** The dev server's route: `{ results }` for `GET /api/dev/deck-results`. */
export function devDeckResults(reportsDir: string, root: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== DECK_RESULTS_ROUTE || req.method !== "GET") return next();
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ results: deckResults(reportsDir, root) }));
  };
}

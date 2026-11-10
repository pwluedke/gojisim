import { useEffect, useState } from "react";

/**
 * Paul, Nov 9: the latest study-deck result against each deck, by card list (`deckSignature`), as
 * the dev server reads it from Paul's local `bot-reports/` (`devDeckResults.ts`). Only a dev build
 * asks; the public site has no such route, so it stays `null` there.
 */
export function useDeckResults(): Map<string, string> | null {
  const [results, setResults] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let live = true;
    fetch("/api/dev/deck-results")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (body: { results?: { signature: string; label: string }[] } | null) => {
          if (live && body?.results)
            setResults(
              new Map(body.results.map((r) => [r.signature, r.label])),
            );
        },
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return results;
}

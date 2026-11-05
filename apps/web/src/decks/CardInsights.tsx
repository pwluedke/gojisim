import type { NamedDeck } from "@gojisim/cards/deck-lists";
import { useMemo, useState } from "react";
import type { SavedDeck } from "../game/deckStore";
import {
  archetypesWithCard,
  combosWithCard,
  copiesLabel,
  decksWithCard,
} from "./insightLookups";
import styles from "./CardInsights.module.css";

/**
 * #166 (Paul's OK, Nov 4, 2026): under the card text in the card detail, where the card is used:
 * in My decks (click one to load it), in the deck recognizer's archetypes, and in combos. Folded
 * by default; open or folded is remembered per browser, like Stats.
 */
const OPEN_KEY = "gojisim.deckbuilder.insightsOpen";
/** My decks listed before "and N more". */
const MAX_DECKS = 6;

function loadOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

function saveOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "true" : "false");
  } catch {
    // Storage blocked: the section still opens for this page view.
  }
}

export function CardInsights({
  deckCardNumber,
  saved,
  onLoad,
}: {
  deckCardNumber: string;
  saved: readonly SavedDeck[];
  onLoad: (deck: NamedDeck, id: string) => void;
}) {
  const [open, setOpen] = useState(loadOpen);
  const decks = useMemo(
    () => decksWithCard(saved, deckCardNumber),
    [saved, deckCardNumber],
  );
  const archetypes = useMemo(
    () => archetypesWithCard(deckCardNumber),
    [deckCardNumber],
  );
  const combos = useMemo(
    () => combosWithCard(deckCardNumber),
    [deckCardNumber],
  );
  const toggle = () => {
    setOpen(!open);
    saveOpen(!open);
  };
  const empty =
    decks.length === 0 && archetypes.length === 0 && combos.length === 0;
  return (
    <section className={styles.insights} data-testid="db-insights">
      <button
        type="button"
        className={styles.toggle}
        data-testid="db-insights-toggle"
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? "▾" : "▸"} Card insights
      </button>
      {open && (
        <div className={styles.body} data-testid="db-insights-body">
          {empty && (
            <p className={styles.none} data-testid="db-insights-none">
              No decks, archetypes or combos use it yet.
            </p>
          )}
          {decks.length > 0 && (
            <div data-testid="db-insights-decks">
              <h3 className={styles.title}>In your decks</h3>
              <ul className={styles.decks}>
                {decks.slice(0, MAX_DECKS).map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={styles.deck}
                      data-small
                      title={d.folder ? `Folder: ${d.folder}` : "No folder"}
                      onClick={() => onLoad(d.deck, d.id)}
                    >
                      {d.name}
                    </button>{" "}
                    <span className={styles.count}>×{d.copies}</span>
                  </li>
                ))}
              </ul>
              {decks.length > MAX_DECKS && (
                <p className={styles.more} data-testid="db-insights-more">
                  and {decks.length - MAX_DECKS} more
                </p>
              )}
            </div>
          )}
          {archetypes.length > 0 && (
            <div data-testid="db-insights-archetypes">
              <h3 className={styles.title}>In archetypes</h3>
              <ul className={styles.list}>
                {archetypes.map((a) => (
                  <li key={a.archetype}>
                    {a.role === "Rank I" ? "Rank I monster" : a.role} in{" "}
                    {a.archetype}
                    {a.count && (
                      <span className={styles.count}>
                        {" "}
                        ({copiesLabel(a.count)})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {combos.length > 0 && (
            <div data-testid="db-insights-combos">
              <h3 className={styles.title}>In combos</h3>
              <ul className={styles.list}>
                {combos.map((c) => (
                  <li key={c.name} title={c.steps}>
                    {c.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

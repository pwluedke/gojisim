import type { Card } from "@gojisim/cards";
import type { NamedDeck } from "@gojisim/cards/deck-lists";
import { useEffect, useMemo, useState } from "react";
import { importStatus } from "../game/importDeck";
import styles from "./Board.module.css";
import newGame from "./NewGame.module.css";

const FORMAT_NAMES = {
  gojisim: "GojiSim deck list",
  godzillatcgdb: "godzillatcgdb.com printable deck list",
} as const;

/** "2 × Name [number]" lines, one per run of the same card, in the deck's order. */
function cardLines(cards: readonly Card[]): string[] {
  const lines: { card: Card; count: number }[] = [];
  for (const card of cards) {
    const last = lines[lines.length - 1];
    if (last && last.card.cardNumber === card.cardNumber) last.count++;
    else lines.push({ card, count: 1 });
  }
  return lines.map(
    ({ card, count }) => `${count} × ${card.name} [${card.cardNumber}]`,
  );
}

/**
 * The Import deck modal (M7a): paste a deck list in any format GojiSim reads (its own text, or a
 * copy of godzillatcgdb.com's printable deck list). It shows the parsed deck; unknown card
 * numbers and unreadable lines are errors and block saving, legality problems are warnings and
 * don't (Paul's ruling, Oct 21, 2026). The name defaults to the list's name.
 */
export function ImportDeck({
  onSave,
  onClose,
}: {
  onSave: (deck: NamedDeck, name: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const parsed = useMemo(() => importStatus(text, choice), [text, choice]);
  const { deck, warnings } = parsed;
  const shownName = name ?? deck?.name ?? "";
  const canSave = parsed.canSave(shownName);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={styles.modalBackdrop} data-testid="import-deck">
      <div className={`${styles.modal} ${newGame.importModal}`} role="dialog">
        <div className={styles.modalHeading}>Import deck</div>
        <p className={styles.muted}>
          Paste a GojiSim deck list, or copy a deck&apos;s printable list on
          godzillatcgdb.com (Print deck list) and paste it here.
        </p>
        <textarea
          className={newGame.importText}
          data-testid="import-text"
          value={text}
          rows={8}
          placeholder={
            "[deck] My Deck\n[monster deck]\n1 ESD01-001\n[main deck]\n4 ESD01-005"
          }
          onChange={(e) => {
            setText(e.target.value);
            setChoice(0);
          }}
        />
        {parsed.format && (
          <div className={styles.muted} data-testid="import-format">
            Read as: {FORMAT_NAMES[parsed.format]}
          </div>
        )}
        {parsed.errors.length > 0 && (
          <ul className={newGame.importErrors} data-testid="import-errors">
            {parsed.errors.map((e) => (
              <li key={`${e.line}-${e.reason}`}>
                Line {e.line}: {e.reason}
              </li>
            ))}
          </ul>
        )}
        {parsed.decks.length > 1 && (
          <label>
            Deck{" "}
            <select
              data-testid="import-choice"
              value={choice}
              onChange={(e) => {
                setChoice(Number(e.target.value));
                setName(null);
              }}
            >
              {parsed.decks.map((d, i) => (
                <option key={i} value={i}>
                  {d.name}
                </option>
              ))}
            </select>{" "}
            <span className={styles.muted}>
              ({parsed.decks.length} decks in the text)
            </span>
          </label>
        )}
        {deck && (
          <>
            <div data-testid="import-counts">
              Monster deck {deck.monsterDeck.length} · Main deck{" "}
              {deck.mainDeck.length}
            </div>
            {warnings.length > 0 && (
              <ul
                className={newGame.importWarnings}
                data-testid="import-warnings"
              >
                {warnings.map((w) => (
                  <li key={`${w.rule}-${w.message}`}>
                    Warning ({w.rule}): {w.message}
                  </li>
                ))}
              </ul>
            )}
            <div className={newGame.importLists} data-testid="import-cards">
              <div>
                <strong>Monster deck</strong>
                {cardLines(deck.monsterDeck).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
              <div>
                <strong>Main deck</strong>
                {cardLines(deck.mainDeck).map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
            <label>
              Name{" "}
              <input
                data-testid="import-name"
                value={shownName}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  // The modal sits inside the new-game form: Enter saves the deck instead of
                  // starting a game.
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (canSave && deck) onSave(deck, shownName.trim());
                }}
              />
            </label>
          </>
        )}
        <div className={styles.modalButtons}>
          <button
            type="button"
            className={styles.button}
            data-testid="import-save"
            disabled={!canSave}
            onClick={() => deck && onSave(deck, shownName.trim())}
          >
            Save deck
          </button>
          <button
            type="button"
            className={styles.choiceButton}
            data-testid="import-cancel"
            onClick={onClose}
          >
            Cancel [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}

import type { Card } from "@gojisim/cards";
import type { NamedDeck } from "@gojisim/cards/deck-lists";
import { decklogCode, decklogDeckList } from "@gojisim/cards/decklog";
import { useEffect, useMemo, useState } from "react";
import { fetchDecklogDeck } from "../game/decklog";
import {
  freeName,
  type ImportAll,
  importAll,
  importStatus,
  type MyDeck,
} from "../game/importDeck";
import styles from "./Board.module.css";
import newGame from "./NewGame.module.css";

const FORMAT_NAMES = {
  gojisim: "GojiSim or godzilla-sim deck list",
  "godzillatcgdb-page": "godzillatcgdb.com deck page",
  "godzillatcgdb-print": "godzillatcgdb.com printable deck list",
} as const;

/** How to copy a deck in each format GojiSim reads (M7a review: one line per format). */
const HOW_TO_COPY: [string, string][] = [
  [
    "Decklog",
    "paste the deck's URL (decklog-en.bushiroad.com/view/…) or its deck code above and click Fetch.",
  ],
  [
    "godzillatcgdb.com deck page",
    "open the deck, press Cmd+A (Ctrl+A on Windows), then Cmd+C (Ctrl+C), and paste here.",
  ],
  [
    "godzillatcgdb.com printable list",
    "on the deck page click Print deck list, select all of that page, copy and paste.",
  ],
  [
    "godzilla-sim",
    "in the Deck Builder, use Export to Clipboard (one deck) or Export All Decks, then paste.",
  ],
  ["GojiSim", "use Copy on a saved deck, or paste a GojiSim deck list file."],
];

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
 * don't (Paul's ruling, Oct 21, 2026). The name defaults to the list's name. A Decklog URL or
 * deck code is fetched through GojiSim's route and becomes deck list text in the box, so the same
 * preview, errors and warnings apply.
 */
export function ImportDeck({
  mine,
  onSave,
  onSaveAll,
  onReplace,
  onClose,
}: {
  /** My decks, so Import all skips a deck already saved and asks about a name clash (#167). */
  mine: readonly MyDeck[];
  onSave: (deck: NamedDeck, name: string) => void;
  /** Import all: the decks to save, already named; the modal stays open with its report. */
  onSaveAll: (decks: ImportAll["saved"]) => void;
  /** Import all's Replace: the saved deck `id` takes the imported deck's list. */
  onReplace: (id: string, deck: NamedDeck) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [allReport, setAllReport] = useState<ImportAll | null>(null);
  // Import all's name clashes answered so far, by name: "replaced" or the kept copy's name.
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [decklogInput, setDecklogInput] = useState("");
  const [decklog, setDecklog] = useState<{
    busy: boolean;
    note: string | null;
    error: string | null;
  }>({ busy: false, note: null, error: null });
  const fetchDecklog = async () => {
    const code = decklogCode(decklogInput);
    if (!code) {
      setDecklog({
        busy: false,
        note: null,
        error:
          "Paste a Decklog URL (decklog-en.bushiroad.com/view/…) or a deck code like 1STAP.",
      });
      return;
    }
    setDecklog({
      busy: true,
      note: `Fetching ${code} from Decklog…`,
      error: null,
    });
    const result = await fetchDecklogDeck(code);
    if ("error" in result) {
      setDecklog({ busy: false, note: null, error: result.error });
      return;
    }
    const list = decklogDeckList(result.deck);
    setText(list.text);
    setChoice(0);
    setName(null);
    const notes = [`Fetched ${result.deck.code} from Decklog.`];
    if (list.fallbacks.length > 0)
      notes.push(
        `Read as the base card: ${list.fallbacks.map(([from, to]) => `${from} → ${to}`).join(", ")}.`,
      );
    if (list.ignored > 0)
      notes.push(`Left out ${list.ignored} cards from Decklog's side list.`);
    setDecklog({
      busy: false,
      note: notes.join(" "),
      error:
        list.unknown.length > 0
          ? `GojiSim doesn't know ${list.unknown.length === 1 ? "this card number" : "these card numbers"} yet: ${list.unknown.join(", ")}. The card data may need a refresh (pnpm scrape).`
          : null,
    });
  };
  const parsed = useMemo(() => importStatus(text, choice), [text, choice]);
  const { deck, warnings } = parsed;
  const shownName = name ?? parsed.suggestedName;
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
        <ul className={newGame.importHelp} data-testid="import-help">
          {HOW_TO_COPY.map(([source, how]) => (
            <li key={source}>
              <strong>{source}:</strong> {how}
            </li>
          ))}
        </ul>
        <div className={newGame.decklogRow}>
          <label>
            Decklog URL or deck code{" "}
            <input
              data-testid="decklog-input"
              value={decklogInput}
              placeholder="https://decklog-en.bushiroad.com/view/1STAP"
              onChange={(e) => setDecklogInput(e.target.value)}
              onKeyDown={(e) => {
                // Inside the new-game form: Enter fetches instead of starting a game.
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (!decklog.busy) void fetchDecklog();
              }}
            />
          </label>{" "}
          <button
            type="button"
            className={styles.choiceButton}
            data-testid="decklog-fetch"
            disabled={decklog.busy || decklogInput.trim() === ""}
            onClick={() => void fetchDecklog()}
          >
            Fetch
          </button>
        </div>
        {decklog.note && (
          <div className={styles.muted} data-testid="decklog-note">
            {decklog.note}
          </div>
        )}
        {decklog.error && (
          <div className={newGame.importErrors} data-testid="decklog-error">
            {decklog.error}
          </div>
        )}
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
            setAllReport(null);
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
            </span>{" "}
            <button
              type="button"
              className={styles.choiceButton}
              data-testid="import-all"
              // Once it has saved, a second click would save the same decks again as " (2)";
              // a change to the text clears the report and the button.
              disabled={!!allReport}
              onClick={() => {
                const report = importAll(text, mine);
                if (report.saved.length > 0) onSaveAll(report.saved);
                setAllReport(report);
                setAnswered({});
              }}
            >
              Import all
            </button>
          </label>
        )}
        {allReport && (
          <div data-testid="import-all-result">
            <div>
              Saved {allReport.saved.length} of {parsed.decks.length} decks
              {allReport.saved.length > 0 &&
                `: ${allReport.saved.map((d) => d.name).join(", ")}`}
              .
            </div>
            {allReport.same.length > 0 && (
              <div data-testid="import-all-same">
                Already in My decks: {allReport.same.join(", ")}.
              </div>
            )}
            {allReport.clashes.length > 0 && (
              <ul data-testid="import-clashes">
                {allReport.clashes.map((clash) => {
                  const answer = answered[clash.name];
                  return (
                    <li
                      key={clash.name}
                      data-testid="import-clash"
                      data-deck-name={clash.name}
                    >
                      My decks already has a different &quot;{clash.name}&quot;.{" "}
                      {answer === undefined ? (
                        <>
                          <button
                            type="button"
                            data-testid="import-clash-replace"
                            onClick={() => {
                              onReplace(clash.existing.id, clash.deck);
                              setAnswered((a) => ({ ...a, [clash.name]: "" }));
                            }}
                          >
                            Replace
                          </button>{" "}
                          <button
                            type="button"
                            data-testid="import-clash-keep"
                            onClick={() => {
                              const taken = new Set([
                                ...mine.map((d) => d.name),
                                ...allReport.saved.map((d) => d.name),
                                ...Object.values(answered),
                              ]);
                              const name = freeName(clash.name, taken);
                              onSaveAll([{ deck: clash.deck, name }]);
                              setAnswered((a) => ({
                                ...a,
                                [clash.name]: name,
                              }));
                            }}
                          >
                            Keep both
                          </button>
                        </>
                      ) : answer === "" ? (
                        "Replaced."
                      ) : (
                        `Kept both: saved as "${answer}".`
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {(allReport.failed.length > 0 || allReport.stray.length > 0) && (
              <ul className={newGame.importErrors}>
                {allReport.failed.map((f, i) => (
                  <li key={i}>
                    Not saved, {f.name}: {f.reasons.join("; ")}
                  </li>
                ))}
                {allReport.stray.map((e) => (
                  <li key={`stray-${e.line}`}>
                    Line {e.line}, outside any deck: {e.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
            {allReport?.saved.length ? "Close" : "Cancel"} [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}

import { PRESETS } from "@gojisim/bot";
import type { MatchMode } from "@gojisim/engine";
import { useState } from "react";
import { difficultyName, type SeatConfig } from "../game/bots";
import {
  type DeckOption,
  loadImportedDecks,
  optionLegality,
  playDeckOptions,
  tournamentProblems,
} from "../game/decks";
import {
  backupJson,
  deckOf,
  readBackup,
  type SavedDeck,
  savedDeck,
} from "../game/deckStore";
import {
  downloadText,
  PLAYER_IDS,
  type PlayerId,
  randomSeed,
} from "../game/session";
import { useMyDecks } from "../game/useMyDecks";
import { ImportDeck } from "./ImportDeck";
import styles from "./NewGame.module.css";

/**
 * The preset seats (M5a): P1 Human vs P2 Bot Medium. `/play` is human vs bot (M5h removed
 * hotseat): only P1 can be human, and P1 can be a bot too, to watch two bots play.
 */
export function presetSeats(): Record<PlayerId, SeatConfig> {
  return {
    P1: { kind: "human" },
    P2: { kind: "bot", difficulty: PRESETS.medium },
  };
}

function Legality({
  legality,
}: {
  legality: ReturnType<typeof optionLegality>;
}) {
  if ("error" in legality)
    return <span className={styles.illegal}>{legality.error}</span>;
  // Legality problems are warnings in Casual: an illegal deck still plays (Paul's ruling, Oct 21,
  // 2026). Tournament games don't offer it.
  return legality.legal ? (
    <span className={styles.legal} data-testid="legality">
      Legal
    </span>
  ) : (
    <span
      className={styles.warning}
      data-testid="legality"
      title={tournamentProblems(legality).join("\n")}
    >
      Warnings: {legality.failures.map((f) => f.rule).join(", ")}
    </span>
  );
}

/**
 * The `/play` new-game screen (M5a): a deck for each seat (the official starters, random test
 * decks, and decks imported in `/debug`, with a legality badge), Human or Bot per seat, and the
 * difficulty slider with its presets. M5e: Casual (undo allowed) or Tournament (no undo), stored
 * in the game record. Tournament games take legal decks only: an illegal deck can't be picked, and
 * the seat says why. Casual games play it with a warning on the board.
 */
export function NewGame({
  onStart,
  onLoad,
}: {
  /** Loads an exported game record (M5c); returns an error message, or `null`. */
  onLoad: (file: File) => Promise<string | null>;
  onStart: (
    seed: number,
    picked: [DeckOption, DeckOption],
    seats: Record<PlayerId, SeatConfig>,
    matchMode: MatchMode,
    showOpponentHand: boolean,
  ) => void;
}) {
  // M7a: the starters, My decks (saved in this browser), then the development decks.
  const my = useMyDecks();
  const mine = my.decks.flatMap((saved) => {
    const deck = deckOf(saved);
    return deck ? [{ id: saved.id, name: saved.name, deck }] : [];
  });
  const options = playDeckOptions(mine, loadImportedDecks());
  const [importing, setImporting] = useState(false);
  const [keys, setKeys] = useState<Record<PlayerId, string>>({
    P1: "official:ESD01",
    P2: "official:ESD02",
  });
  const [seats, setSeats] = useState(presetSeats);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => String(randomSeed()));
  const [matchMode, setMatchMode] = useState<MatchMode>("casual");
  const [showOpponentHand, setShowOpponentHand] = useState(false);
  const byKey = (key: string) =>
    options.find((o) => o.key === key) ?? (options[0] as DeckOption);
  const tournament = matchMode === "tournament";
  // Random test decks depend on the seed: check the deck the game would get.
  const legality = new Map(
    options.map((o) => [o.key, optionLegality(o, Number(seed) || 0)]),
  );
  const problemsOf = (key: string) =>
    tournamentProblems(
      legality.get(byKey(key).key) as ReturnType<typeof optionLegality>,
    );
  const blocked = tournament
    ? PLAYER_IDS.filter((id) => problemsOf(keys[id]).length > 0)
    : [];
  return (
    <form
      className={styles.screen}
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked.length > 0) return;
        onStart(
          Number(seed),
          [byKey(keys.P1), byKey(keys.P2)],
          seats,
          matchMode,
          showOpponentHand && seats.P1.kind === "human",
        );
      }}
    >
      <h1 className={styles.title}>Play vs bot</h1>
      <div className={styles.seats}>
        {PLAYER_IDS.map((id) => {
          const seat = seats[id];
          return (
            <div
              key={id}
              className={styles.seat}
              data-testid={`seat-panel-${id}`}
            >
              <strong>{id}</strong>
              <div className={styles.row}>
                <label>
                  Deck{" "}
                  <select
                    data-testid={`deck-${id}`}
                    value={keys[id]}
                    onChange={(e) =>
                      setKeys((k) => ({ ...k, [id]: e.target.value }))
                    }
                  >
                    {(
                      [
                        ["Starters", ["official"]],
                        ["My decks", ["mine"]],
                        ["Development", ["random", "imported"]],
                      ] as const
                    ).map(([group, kinds]) => {
                      const inGroup = options.filter((o) =>
                        (kinds as readonly string[]).includes(o.kind),
                      );
                      return inGroup.length ? (
                        <optgroup key={group} label={group}>
                          {inGroup.map((o) => {
                            const illegal =
                              tournament && problemsOf(o.key).length > 0;
                            return (
                              <option
                                key={o.key}
                                value={o.key}
                                disabled={illegal}
                              >
                                {o.label}
                                {illegal ? " (illegal)" : ""}
                              </option>
                            );
                          })}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                </label>{" "}
                <Legality
                  legality={
                    legality.get(byKey(keys[id]).key) as ReturnType<
                      typeof optionLegality
                    >
                  }
                />
              </div>
              {blocked.includes(id) && (
                <div
                  className={styles.illegal}
                  data-testid={`tournament-blocked-${id}`}
                >
                  Not allowed in a Tournament game:
                  <ul className={styles.problems}>
                    {problemsOf(keys[id]).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className={styles.row}>
                {id === "P1" ? (
                  <label>
                    Seat{" "}
                    <select
                      data-testid={`seat-${id}`}
                      value={seat.kind}
                      onChange={(e) =>
                        setSeats((s) => ({
                          ...s,
                          [id]:
                            e.target.value === "bot"
                              ? { kind: "bot", difficulty: PRESETS.medium }
                              : { kind: "human" },
                        }))
                      }
                    >
                      <option value="human">Human</option>
                      <option value="bot">Bot</option>
                    </select>
                  </label>
                ) : (
                  // The other seat is always a bot (M5h: no hotseat until M9's online play).
                  <span data-testid={`seat-${id}`} data-seat="bot">
                    Seat: Bot
                  </span>
                )}
              </div>
              {seat.kind === "bot" && (
                <div className={styles.row}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    data-testid={`difficulty-${id}`}
                    value={seat.difficulty}
                    onChange={(e) =>
                      setSeats((s) => ({
                        ...s,
                        [id]: {
                          kind: "bot",
                          difficulty: Number(e.target.value),
                        },
                      }))
                    }
                  />{" "}
                  <span data-testid={`difficulty-value-${id}`}>
                    {seat.difficulty} ({difficultyName(seat.difficulty)})
                  </span>
                  <div>
                    {(Object.entries(PRESETS) as [string, number][]).map(
                      ([name, level]) => (
                        <button
                          key={name}
                          type="button"
                          className={styles.preset}
                          data-testid={`preset-${id}-${name}`}
                          onClick={() =>
                            setSeats((s) => ({
                              ...s,
                              [id]: { kind: "bot", difficulty: level },
                            }))
                          }
                        >
                          {difficultyName(level)}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <MyDecks
        my={my}
        onImport={() => setImporting(true)}
        onSaved={(deck) => setKeys((k) => ({ ...k, P1: `mine:${deck.id}` }))}
      />
      {importing && (
        <ImportDeck
          onClose={() => setImporting(false)}
          onSave={(deck, name) => {
            const saved = savedDeck(deck, name);
            my.add(saved);
            // The new deck is ready to play in P1's seat.
            setKeys((k) => ({ ...k, P1: `mine:${saved.id}` }));
            setImporting(false);
          }}
        />
      )}
      <div className={styles.row}>
        <label>
          Seed{" "}
          <input
            data-testid="seed-input"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
      </div>
      <div className={styles.row} role="radiogroup" aria-label="Match type">
        {(
          [
            ["casual", "Casual", "undo allowed"],
            ["tournament", "Tournament", "no undo, legal decks only"],
          ] as const
        ).map(([value, label, note]) => (
          <label key={value}>
            <input
              type="radio"
              name="match-mode"
              data-testid={`match-mode-${value}`}
              checked={matchMode === value}
              onChange={() => setMatchMode(value)}
            />{" "}
            {label} <span className={styles.note}>({note})</span>
          </label>
        ))}
      </div>
      {seats.P1.kind === "human" && (
        <div className={styles.row}>
          <label>
            <input
              type="checkbox"
              data-testid="show-opponent-hand"
              checked={showOpponentHand}
              onChange={(e) => setShowOpponentHand(e.target.checked)}
            />{" "}
            Show opponent&apos;s hand{" "}
            <span className={styles.note}>
              (practice: the game won&apos;t count in statistics)
            </span>
          </label>
        </div>
      )}
      <button
        type="submit"
        className={styles.start}
        data-testid="start-game"
        disabled={blocked.length > 0}
      >
        Start
      </button>
      {blocked.length > 0 && (
        <div className={styles.illegal} data-testid="start-blocked">
          Tournament games need legal decks: pick another deck for{" "}
          {blocked.join(" and ")}, or play Casual.
        </div>
      )}
      <div>
        <label>
          Or load a game record{" "}
          <input
            type="file"
            accept="application/json,.json"
            data-testid="load-record"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setLoadError(await onLoad(file));
            }}
          />
        </label>
        {loadError && (
          <div className={styles.illegal} data-testid="load-error">
            {loadError}
          </div>
        )}
      </div>
    </form>
  );
}

/**
 * My decks (M7a): the decks saved in this browser, each with its legality badge, Rename, Copy
 * (plain text) and Delete, plus Import deck and a JSON backup of all of them.
 */
function MyDecks({
  my,
  onImport,
  onSaved,
}: {
  my: ReturnType<typeof useMyDecks>;
  onImport: () => void;
  onSaved: (deck: SavedDeck) => void;
}) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copyText, setCopyText] = useState<string | null>(null);
  const copy = async (deck: SavedDeck) => {
    try {
      await navigator.clipboard.writeText(deck.list);
      setNote(`Copied ${deck.name} as plain text.`);
      setCopyText(null);
    } catch {
      // No clipboard access (an insecure page, or denied): show the text to copy by hand.
      setCopyText(deck.list);
    }
  };
  return (
    <section
      className={styles.myDecks}
      data-testid="my-decks"
      data-decks-stored={my.stored ? "true" : "false"}
    >
      <div className={styles.myDecksHead}>
        <strong>My decks</strong>{" "}
        <button
          type="button"
          className={styles.preset}
          data-testid="import-deck"
          onClick={onImport}
        >
          Import deck
        </button>
        <button
          type="button"
          className={styles.preset}
          data-testid="export-decks"
          disabled={my.decks.length === 0}
          onClick={() =>
            downloadText(backupJson(my.decks), "gojisim-my-decks.json")
          }
        >
          Export all (JSON)
        </button>
        <label className={styles.preset}>
          Import backup{" "}
          <input
            type="file"
            accept="application/json,.json"
            data-testid="import-backup"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const { decks, problems } = readBackup(await file.text());
              my.add(...decks);
              const last = decks[decks.length - 1];
              if (last) onSaved(last);
              setNote(
                [
                  `Imported ${decks.length} deck${decks.length === 1 ? "" : "s"}.`,
                  ...problems,
                ].join(" "),
              );
            }}
          />
        </label>
      </div>
      {!my.persistent && (
        <div className={styles.illegal} data-testid="decks-session-only">
          This browser can&apos;t store decks: imported decks last for this
          visit only.
        </div>
      )}
      {note && (
        <div className={styles.note} data-testid="decks-note">
          {note}
        </div>
      )}
      {copyText && (
        <textarea
          className={styles.importText}
          data-testid="copy-text"
          readOnly
          rows={5}
          value={copyText}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {my.decks.length === 0 ? (
        <div className={styles.note}>
          No saved decks yet. Import one to play it here.
        </div>
      ) : (
        <ul className={styles.deckRows}>
          {my.decks.map((saved) => {
            const deck = deckOf(saved);
            return (
              <li
                key={saved.id}
                className={styles.deckRow}
                data-testid="my-deck"
                data-deck-name={saved.name}
              >
                {renaming?.id === saved.id ? (
                  // Not a <form>: My decks sits inside the new-game form, and forms can't nest.
                  <span className={styles.renameRow}>
                    <input
                      data-testid="rename-input"
                      value={renaming.name}
                      autoFocus
                      onChange={(e) =>
                        setRenaming({ id: saved.id, name: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          my.rename(saved.id, renaming.name);
                          setRenaming(null);
                        }
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />{" "}
                    <button
                      type="button"
                      data-testid="rename-save"
                      onClick={() => {
                        my.rename(saved.id, renaming.name);
                        setRenaming(null);
                      }}
                    >
                      Save
                    </button>{" "}
                    <button type="button" onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <>
                    <span data-testid="my-deck-name">{saved.name}</span>{" "}
                    {deck && (
                      <Legality
                        legality={optionLegality(
                          {
                            key: saved.id,
                            label: saved.name,
                            kind: "mine",
                            build: () => deck,
                          },
                          0,
                        )}
                      />
                    )}
                    <span className={styles.deckActions}>
                      <button
                        type="button"
                        data-testid="rename-deck"
                        onClick={() =>
                          setRenaming({ id: saved.id, name: saved.name })
                        }
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        data-testid="copy-deck"
                        onClick={() => void copy(saved)}
                      >
                        Copy
                      </button>
                      {deleting === saved.id ? (
                        <>
                          <button
                            type="button"
                            data-testid="delete-confirm"
                            onClick={() => {
                              my.remove(saved.id);
                              setDeleting(null);
                            }}
                          >
                            Delete {saved.name}?
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(null)}
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          data-testid="delete-deck"
                          onClick={() => setDeleting(saved.id)}
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

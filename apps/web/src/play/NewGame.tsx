import { PRESETS } from "@gojisim/bot";
import type { MatchMode } from "@gojisim/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { difficultyName, type SeatConfig } from "../game/bots";
import {
  type DeckOption,
  loadImportedDecks,
  optionLegality,
  pickerGroups,
  playDeckOptions,
  randomDeckKey,
  STARTER_PICKS,
  badgeReasons,
  deckReasons,
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
import { Tooltip } from "./Tooltip";

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

/** Deck names in the picker are cut to this many characters plus "…" (M5h overflow fix). */
const LABEL_MAX = 40;

export const shortLabel = (label: string) =>
  label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX).trimEnd()}…` : label;

/** An illegal deck's badge (M13b): up to 3 plain reasons and "+N more"; the tooltip has them all. */
function LegalityWarning({ reasons }: { reasons: string[] }) {
  const { shown, more } = badgeReasons(reasons);
  return (
    <span
      className={styles.warning}
      data-testid="legality"
      title={reasons.join("\n")}
    >
      Warnings: {shown.join("; ")}
      {more > 0 && ` +${more} more`}
    </span>
  );
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
    <LegalityWarning reasons={deckReasons(legality)} />
  );
}

/**
 * The `/play` new-game screen (M5a): a deck for each seat (the official starters, random test
 * decks, and decks imported in `/debug`, with a legality badge), Human or Bot per seat, and the
 * difficulty slider with its presets. M5e: Casual (undo allowed) or Tournament (no undo), stored
 * in the game record. Tournament games take legal decks only: an illegal deck can't be picked, and
 * the seat says why. Casual games play it with a warning on the board.
 *
 * The whole screen fits at 1280×800 with no page scroll (Monarch, Oct 26, 2026): compact 36 px
 * controls, the seats side by side, My decks collapsed, and the game options in one block at the
 * bottom. Each seat's Randomize picks a deck from its filtered list; switching the match type
 * resets both seats to the starters.
 */
export function NewGame({
  onStart,
  onLoad,
  skipFirstPick,
  onSkipFirstPick,
}: {
  /** The saved "Skip First / Second pick" setting, and its change. */
  skipFirstPick: boolean;
  onSkipFirstPick: (skip: boolean) => void;
  /** Loads an exported game record (M5c); returns an error message, or `null`. */
  onLoad: (file: File) => Promise<string | null>;
  onStart: (
    seed: number,
    picked: [DeckOption, DeckOption],
    seats: Record<PlayerId, SeatConfig>,
    matchMode: MatchMode,
  ) => void;
}) {
  // M7a: the starters, My decks (saved in this browser), then the development decks.
  const my = useMyDecks();
  // Read once: the stored imports can be hundreds of decks.
  const [imported] = useState(loadImportedDecks);
  const options = useMemo(() => {
    const mine = my.decks.flatMap((saved) => {
      const deck = deckOf(saved);
      return deck ? [{ id: saved.id, name: saved.name, deck }] : [];
    });
    return playDeckOptions(mine, imported);
  }, [my.decks, imported]);
  // Type-to-filter for the development groups (Monarch, Oct 25, 2026).
  const [filter, setFilter] = useState("");
  const [importing, setImporting] = useState(false);
  // My decks starts collapsed; saving or restoring a deck opens it to show the new deck.
  const [decksOpen, setDecksOpen] = useState(false);
  const [keys, setKeys] = useState<Record<PlayerId, string>>({
    ...STARTER_PICKS,
  });
  const [seats, setSeats] = useState(presetSeats);
  const [loadError, setLoadError] = useState<string | null>(null);
  const recordInput = useRef<HTMLInputElement>(null);
  const [recordName, setRecordName] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => String(randomSeed()));
  const [matchMode, setMatchMode] = useState<MatchMode>("casual");
  const byKey = (key: string) =>
    options.find((o) => o.key === key) ?? (options[0] as DeckOption);
  const tournament = matchMode === "tournament";
  // Random test decks depend on the seed: check the deck the game would get.
  const legality = useMemo(
    () =>
      new Map(
        options.map((o) => [o.key, optionLegality(o, Number(seed) || 0)]),
      ),
    [options, seed],
  );
  const problemsOf = (key: string) =>
    tournamentProblems(
      legality.get(byKey(key).key) as ReturnType<typeof optionLegality>,
    );
  const blocked = tournament
    ? PLAYER_IDS.filter((id) => problemsOf(keys[id]).length > 0)
    : [];
  // Randomize draws from what the filter shows (Starters, My decks, the matching development
  // decks), legal decks only in a Tournament game.
  const randomCandidates = pickerGroups(options, filter)
    .flatMap((group) => group.options)
    .filter((o) => !tournament || problemsOf(o.key).length === 0)
    .map((o) => o.key);
  const randomize = (id: PlayerId) => {
    const key = randomDeckKey(randomCandidates, keys[id]);
    if (key) setKeys((k) => ({ ...k, [id]: key }));
  };
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
        );
      }}
    >
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Play vs bot</h1>
        {options.some((o) => o.kind === "file" || o.kind === "imported") && (
          <label className={styles.filter}>
            Find a development deck{" "}
            <input
              type="search"
              data-testid="dev-deck-filter"
              placeholder="Name, file or folder"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                // Enter filters; it never starts the game from here.
                if (e.key === "Enter") e.preventDefault();
              }}
            />
          </label>
        )}
      </div>
      <div className={styles.seats}>
        {PLAYER_IDS.map((id) => {
          const seat = seats[id];
          return (
            <div
              key={id}
              className={styles.seat}
              data-testid={`seat-panel-${id}`}
            >
              <div className={styles.seatHead}>
                <strong>{id}</strong>
                <Legality
                  legality={
                    legality.get(byKey(keys[id]).key) as ReturnType<
                      typeof optionLegality
                    >
                  }
                />
                <span className={styles.seatKind}>
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
                </span>
              </div>
              <div className={styles.line}>
                <label className={styles.grow}>
                  <span className={styles.srOnly}>{id} deck</span>
                  <select
                    data-testid={`deck-${id}`}
                    value={keys[id]}
                    onChange={(e) =>
                      setKeys((k) => ({ ...k, [id]: e.target.value }))
                    }
                  >
                    {pickerGroups(options, filter, [keys[id]]).map(
                      ({ label: group, options: inGroup }) => (
                        <optgroup key={group} label={group}>
                          {inGroup.map((o) => {
                            const illegal =
                              tournament && problemsOf(o.key).length > 0;
                            return (
                              <option
                                key={o.key}
                                value={o.key}
                                disabled={illegal}
                                title={o.label}
                              >
                                {shortLabel(o.label)}
                                {illegal ? " (illegal)" : ""}
                              </option>
                            );
                          })}
                        </optgroup>
                      ),
                    )}
                  </select>
                </label>
                {randomCandidates.length > 0 ? (
                  <button
                    type="button"
                    data-control
                    data-testid={`randomize-${id}`}
                    onClick={() => randomize(id)}
                  >
                    Randomize
                  </button>
                ) : (
                  // Only a Tournament game can leave nothing to pick (the starters are legal).
                  <Tooltip
                    tip="No legal deck in this list for a Tournament game"
                    testId={`randomize-tip-${id}`}
                    className={styles.disabledTip}
                  >
                    <button
                      type="button"
                      data-control
                      data-testid={`randomize-${id}`}
                      disabled
                    >
                      Randomize
                    </button>
                  </Tooltip>
                )}
              </div>
              {byKey(keys[id]).label.length > LABEL_MAX && (
                <div
                  className={styles.deckName}
                  data-testid={`deck-name-${id}`}
                >
                  {byKey(keys[id]).label}
                </div>
              )}
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
              {seat.kind === "bot" && (
                <div className={styles.line}>
                  <span>Bot level</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    aria-label={`${id} bot level`}
                    className={styles.level}
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
                  />
                  <span data-testid={`difficulty-value-${id}`}>
                    {seat.difficulty} ({difficultyName(seat.difficulty)})
                  </span>
                  <span className={styles.presets}>
                    {(Object.entries(PRESETS) as [string, number][]).map(
                      ([name, level]) => (
                        <button
                          key={name}
                          type="button"
                          data-control
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
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <MyDecks
        my={my}
        open={decksOpen}
        onOpen={setDecksOpen}
        onImport={() => setImporting(true)}
        onSaved={(deck) => {
          setKeys((k) => ({ ...k, P1: `mine:${deck.id}` }));
          setDecksOpen(true);
        }}
      />
      {importing && (
        <ImportDeck
          existingNames={my.decks.map((d) => d.name)}
          onClose={() => setImporting(false)}
          onSaveAll={(decks) => {
            const now = Date.now();
            const saved = decks.map(({ deck, name }, i) =>
              savedDeck(deck, name, new Date(now + i)),
            );
            my.add(...saved);
            // The last saved deck is ready to play in P1's seat (decision 292).
            const last = saved[saved.length - 1];
            if (last) setKeys((k) => ({ ...k, P1: `mine:${last.id}` }));
            setDecksOpen(true);
          }}
          onSave={(deck, name) => {
            const saved = savedDeck(deck, name);
            my.add(saved);
            // The new deck is ready to play in P1's seat.
            setKeys((k) => ({ ...k, P1: `mine:${saved.id}` }));
            setDecksOpen(true);
            setImporting(false);
          }}
        />
      )}
      <div className={styles.options} data-testid="game-options">
        <div className={styles.line}>
          <label>
            Seed{" "}
            <input
              className={styles.seed}
              data-testid="seed-input"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
          <span
            className={styles.modes}
            role="radiogroup"
            aria-label="Match type"
          >
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
                  onChange={() => {
                    setMatchMode(value);
                    // Every switch starts both seats over on the starters (Monarch, Oct 26, 2026;
                    // replaces decision 347's "doesn't change by itself").
                    setKeys({ ...STARTER_PICKS });
                  }}
                />{" "}
                {label} <span className={styles.note}>({note})</span>
              </label>
            ))}
          </span>
        </div>
        <div className={styles.line}>
          {/* Off by default; with it on, the 6.3.1.4 RNG draw picks the first player (decision 246). */}
          <label>
            <input
              type="checkbox"
              data-testid="skip-first-pick"
              checked={skipFirstPick}
              onChange={(e) => onSkipFirstPick(e.target.checked)}
            />{" "}
            Skip First / Second pick{" "}
            <span className={styles.note}>(random first player)</span>
          </label>
        </div>
        <div className={styles.line}>
          <button
            type="submit"
            className={styles.start}
            data-primary
            data-testid="start-game"
            disabled={blocked.length > 0}
          >
            Start
          </button>
          {/* A button like Import backup's; the file's name shows only once one is picked. */}
          <button
            type="button"
            data-control
            data-testid="load-record-button"
            onClick={() => recordInput.current?.click()}
          >
            Load a game record
          </button>
          <input
            ref={recordInput}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="load-record"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setRecordName(file.name);
              setLoadError(await onLoad(file));
            }}
          />
          {recordName && (
            <span className={styles.note} data-testid="load-record-name">
              {recordName}
            </span>
          )}
        </div>
        {blocked.length > 0 && (
          <div className={styles.illegal} data-testid="start-blocked">
            Tournament games need legal decks: pick another deck for{" "}
            {blocked.join(" and ")}, or play Casual.
          </div>
        )}
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
 * My decks (M7a): the decks saved in this browser, each with its legality badge and one "⋯" menu
 * (Rename, Copy as plain text, Delete), plus Import deck and a JSON backup of all of them. The
 * list is collapsed by default ("My decks (6)"); open, it scrolls inside a box 4 rows tall.
 */
function MyDecks({
  my,
  open,
  onOpen,
  onImport,
  onSaved,
}: {
  my: ReturnType<typeof useMyDecks>;
  open: boolean;
  onOpen: (open: boolean) => void;
  onImport: () => void;
  onSaved: (deck: SavedDeck) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  // Import backup is a button like its neighbors; it opens this hidden file picker.
  const backupInput = useRef<HTMLInputElement>(null);
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
      data-open={open ? "true" : "false"}
    >
      <div className={styles.myDecksHead}>
        <button
          type="button"
          className={styles.toggle}
          data-testid="my-decks-toggle"
          aria-expanded={open}
          aria-controls="my-decks-list"
          onClick={() => onOpen(!open)}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span> My decks (
          {my.decks.length})
        </button>
        <span className={styles.myDecksActions}>
          <button
            type="button"
            data-control
            data-testid="import-deck"
            data-primary
            onClick={onImport}
          >
            Import deck
          </button>
          <button
            type="button"
            data-control
            data-testid="export-decks"
            disabled={my.decks.length === 0}
            onClick={() =>
              downloadText(backupJson(my.decks), "gojisim-my-decks.json")
            }
          >
            Export all
          </button>
          <button
            type="button"
            data-control
            data-testid="import-backup-button"
            onClick={() => backupInput.current?.click()}
          >
            Import backup
          </button>
          <input
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            hidden
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
        </span>
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
          rows={3}
          value={copyText}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {open &&
        (my.decks.length === 0 ? (
          <div className={styles.note} id="my-decks-list">
            No saved decks yet. Import one to play it here.
          </div>
        ) : (
          <ul
            className={styles.deckRows}
            id="my-decks-list"
            data-testid="my-decks-list"
          >
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
                      />
                      <button
                        type="button"
                        data-control
                        data-testid="rename-save"
                        onClick={() => {
                          my.rename(saved.id, renaming.name);
                          setRenaming(null);
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        data-control
                        onClick={() => setRenaming(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : deleting === saved.id ? (
                    <span className={styles.renameRow}>
                      <button
                        type="button"
                        data-control
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
                        data-control
                        onClick={() => setDeleting(null)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <>
                      <span
                        className={styles.deckRowName}
                        data-testid="my-deck-name"
                      >
                        {saved.name}
                      </span>
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
                      <DeckMenu
                        name={saved.name}
                        open={menu === saved.id}
                        onOpen={(o) => setMenu(o ? saved.id : null)}
                        onRename={() =>
                          setRenaming({ id: saved.id, name: saved.name })
                        }
                        onCopy={() => void copy(saved)}
                        onDelete={() => setDeleting(saved.id)}
                      />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}

/**
 * A saved deck's "⋯" menu: Rename, Copy and Delete. It closes on a pick, Esc, or a click
 * anywhere else.
 */
function DeckMenu({
  name,
  open,
  onOpen,
  onRename,
  onCopy,
  onDelete,
}: {
  name: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  onRename: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, onOpen]);
  const item = (testId: string, label: string, act: () => void) => (
    <button
      type="button"
      role="menuitem"
      className={styles.menuItem}
      data-testid={testId}
      onClick={() => {
        onOpen(false);
        act();
      }}
    >
      {label}
    </button>
  );
  return (
    <span ref={box} className={styles.menuBox}>
      <button
        type="button"
        data-control
        className={styles.menuButton}
        data-testid="deck-menu"
        aria-label={`${name}: more actions`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <span className={styles.menu} role="menu" data-testid="deck-menu-list">
          {item("rename-deck", "Rename", onRename)}
          {item("copy-deck", "Copy", onCopy)}
          {item("delete-deck", "Delete", onDelete)}
        </span>
      )}
    </span>
  );
}

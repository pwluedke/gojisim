import "../theme.css";
import { type Card, getCardText, getCardTraits } from "@gojisim/cards";
import { getAllCards } from "@gojisim/cards/all-cards";
import { useEffect, useMemo, useRef, useState } from "react";
import { backupJson, deckOf, readBackup, savedDeck } from "../game/deckStore";
import { deckOptions } from "../game/decks";
import { downloadText } from "../game/session";
import { useMyDecks } from "../game/useMyDecks";
import type { NamedDeck } from "@gojisim/cards/deck-lists";
import { ImportDeck } from "../play/ImportDeck";
import { applyTheme, loadSettings } from "../play/settings";
import { PlayerBadge } from "../PlayerBadge";
import { SyncOffer } from "./SyncOffer";
import {
  applyFilter,
  buildPool,
  CARD_TYPES,
  type CardFilter,
  facets,
  filterFromQuery,
  filterToQuery,
  NO_FILTER,
  type PoolEntry,
} from "./cardPool";
import styles from "./Deckbuilder.module.css";
import {
  addCard,
  asDeck,
  copyName,
  type DeckDraft,
  type DeckZone,
  draftOf,
  draftText,
  emptyDraft,
  legality,
  MAIN_DECK_SIZE,
  MONSTER_DECK_SIZE,
  removeCard,
  rows,
} from "./deckDraft";

/** A card cell's size in the grid, image and art row included (px). */
const CELL_W = 132;
const CELL_H = 212;
const GAP = 8;
/** The drag data: a print's id, dropped onto the deck panel's monster or main deck. */
const DRAG_TYPE = "application/x-gojisim-card";
/** Rows drawn above and below the visible ones, so a fast scroll doesn't show gaps. */
const OVERSCAN = 2;

/**
 * The Deckbuilder (#157): every supported card in a searchable, filterable grid, with the full
 * preview on hover and an art choice for cards with parallel prints. The header has Import and My
 * decks. #158: a click (or a drag onto the deck panel) adds the shown print to the deck, which is
 * checked live with `validateDeck`, saved to My decks, edited, copied and exported.
 */
export function Deckbuilder() {
  useEffect(() => applyTheme(loadSettings().theme), []);
  const pool = useMemo(() => buildPool(getAllCards()), []);
  const values = useMemo(() => facets(pool), [pool]);
  const [filter, setFilter] = useState<CardFilter>(() =>
    filterFromQuery(window.location.search),
  );
  const shown = useMemo(() => applyFilter(pool, filter), [pool, filter]);
  const [hovered, setHovered] = useState<PoolEntry | null>(null);
  // The chosen print of each card (its index in `prints`); #158 puts its number in the deck.
  const [art, setArt] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState(false);
  const [decksOpen, setDecksOpen] = useState(false);
  const my = useMyDecks();
  // #158: the deck being built, the saved deck it edits (if any), and its text when last saved,
  // so leaving with changes asks first.
  const [draft, setDraft] = useState<DeckDraft>(() => emptyDraft());
  const [editing, setEditing] = useState<string | null>(null);
  const [savedText, setSavedText] = useState(() => draftText(emptyDraft()));
  const [panelNote, setPanelNote] = useState<string | null>(null);
  const dirty = draftText(draft) !== savedText;
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);
  /** Whether unsaved changes may be dropped (asks only when there are some). */
  const mayLeave = () =>
    !dirty || window.confirm(`Discard the unsaved changes to "${draft.name}"?`);
  const openDraft = (next: DeckDraft, id: string | null) => {
    if (!mayLeave()) return false;
    setDraft(next);
    setEditing(id);
    setSavedText(draftText(next));
    setPanelNote(null);
    return true;
  };
  const save = () => {
    const deck = asDeck(draft);
    const named = { ...draft, name: deck.name };
    const existing = editing
      ? my.decks.find((d) => d.id === editing)
      : undefined;
    if (existing) {
      my.update({
        ...existing,
        name: deck.name,
        list: savedDeck(deck, deck.name).list,
      });
    } else {
      const saved = savedDeck(deck, deck.name);
      my.add(saved);
      setEditing(saved.id);
    }
    setDraft(named);
    setSavedText(draftText(named));
    setPanelNote(`Saved ${deck.name}.`);
  };
  const saveCopy = () => {
    const name = copyName(
      draft.name.trim() || "New deck",
      my.decks.map((d) => d.name),
    );
    const named = { ...draft, name };
    const saved = savedDeck(asDeck(named), name);
    my.add(saved);
    setDraft(named);
    setEditing(saved.id);
    setSavedText(draftText(named));
    setPanelNote(`Saved a copy as ${name}.`);
  };
  /** A print by its id, for drops onto the deck panel. */
  const printsById = useMemo(() => {
    const m = new Map<string, Card>();
    for (const e of pool)
      for (const print of e.prints) m.set(String(print.id), print);
    return m;
  }, [pool]);

  // The filters live in the URL, so a filtered view can be shared.
  useEffect(() => {
    const query = filterToQuery(filter);
    window.history.replaceState(null, "", `/decks${query ? `?${query}` : ""}`);
  }, [filter]);
  const set = (change: Partial<CardFilter>) =>
    setFilter((f) => ({ ...f, ...change }));
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const printOf = (e: PoolEntry) =>
    e.prints[art[e.deckCardNumber] ?? 0] ?? e.card;

  return (
    <div className={`gojisim ${styles.page}`}>
      <header className={styles.header}>
        <a className={styles.home} href="/">
          GojiSim
        </a>
        <h1 className={styles.title}>Deckbuilder</h1>
        <button
          type="button"
          data-testid="db-import"
          onClick={() => setImporting(true)}
        >
          Import
        </button>
        <button
          type="button"
          data-testid="db-my-decks"
          onClick={() => setDecksOpen(true)}
        >
          My decks ({my.decks.length})
        </button>
        <span className={styles.spacer} />
        <PlayerBadge />
      </header>

      {/* #152: the first sign-in's offer to keep this browser's decks with the account. */}
      {my.offer && (
        <div className={styles.offer}>
          <SyncOffer my={my} />
        </div>
      )}
      <div className={styles.body}>
        <aside
          className={styles.filters}
          data-testid="db-filters"
          aria-label="Filters"
        >
          <label className={styles.field}>
            Search
            <input
              type="search"
              data-testid="db-search"
              placeholder="Name or card text"
              value={filter.q}
              onChange={(e) => set({ q: e.target.value })}
            />
          </label>
          <fieldset className={styles.group}>
            <legend>Type</legend>
            {CARD_TYPES.map((t) => (
              <label key={t}>
                <input
                  type="checkbox"
                  data-testid={`db-type-${t}`}
                  checked={filter.types.includes(t)}
                  onChange={() => set({ types: toggle(filter.types, t) })}
                />{" "}
                {t}
              </label>
            ))}
          </fieldset>
          <fieldset className={styles.group}>
            <legend>Color</legend>
            {values.colors.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  data-testid={`db-color-${c}`}
                  checked={filter.colors.includes(c)}
                  onChange={() => set({ colors: toggle(filter.colors, c) })}
                />{" "}
                {c}
              </label>
            ))}
          </fieldset>
          <fieldset className={styles.group}>
            <legend>Set</legend>
            <div className={styles.sets}>
              {values.sets.map((s) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    data-testid={`db-set-${s}`}
                    checked={filter.sets.includes(s)}
                    onChange={() => set({ sets: toggle(filter.sets, s) })}
                  />{" "}
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.group}>
            <legend>Rank</legend>
            <span className={styles.range}>
              <input
                type="number"
                min={0}
                max={30}
                aria-label="Lowest rank"
                data-testid="db-rank-min"
                value={filter.rankMin ?? ""}
                onChange={(e) =>
                  set({
                    rankMin:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              to
              <input
                type="number"
                min={0}
                max={30}
                aria-label="Highest rank"
                data-testid="db-rank-max"
                value={filter.rankMax ?? ""}
                onChange={(e) =>
                  set({
                    rankMax:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </span>
          </fieldset>
          <label className={styles.field}>
            Trait
            <input
              list="db-traits"
              data-testid="db-trait"
              value={filter.trait}
              onChange={(e) => set({ trait: e.target.value })}
            />
            <datalist id="db-traits">
              {values.traits.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label className={styles.field}>
            Movie
            <input
              list="db-movies"
              data-testid="db-movie"
              placeholder="Any"
              value={filter.movie}
              onChange={(e) => set({ movie: e.target.value })}
            />
            <datalist id="db-movies">
              {values.movies.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className={styles.field}>
            Keyword
            <select
              data-testid="db-keyword"
              value={filter.keyword}
              onChange={(e) => set({ keyword: e.target.value })}
            >
              <option value="">Any</option>
              {values.keywords.map((k) => (
                <option key={k} value={k}>
                  {k[0]?.toUpperCase()}
                  {k.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="db-clear"
            onClick={() => setFilter(NO_FILTER)}
          >
            Clear
          </button>
        </aside>

        <section className={styles.results}>
          <div className={styles.count} data-testid="db-count">
            {shown.length} of {pool.length} cards
          </div>
          <CardGrid
            entries={shown}
            printOf={printOf}
            onAdd={(e) => setDraft((d) => addCard(d, printOf(e)))}
            onHover={setHovered}
            onArt={(e, step) =>
              setArt((a) => ({
                ...a,
                [e.deckCardNumber]:
                  ((a[e.deckCardNumber] ?? 0) + step + e.prints.length) %
                  e.prints.length,
              }))
            }
            artIndex={(e) => art[e.deckCardNumber] ?? 0}
          />
          {hovered && (
            <aside
              className={styles.detail}
              data-testid="db-detail"
              aria-live="polite"
            >
              <CardDetail card={printOf(hovered)} base={hovered.card} />
            </aside>
          )}
        </section>

        <DeckPanel
          draft={draft}
          dirty={dirty}
          note={panelNote}
          onChange={setDraft}
          onDrop={(id, zone) => {
            const card = printsById.get(id);
            if (card) setDraft((d) => addCard(d, card, zone));
          }}
          onSave={save}
          onSaveCopy={saveCopy}
          onNew={() => openDraft(emptyDraft(), null)}
        />
      </div>

      {importing && (
        <ImportDeck
          existingNames={my.decks.map((d) => d.name)}
          onClose={() => setImporting(false)}
          onSaveAll={(decks) => {
            const now = Date.now();
            my.add(
              ...decks.map(({ deck, name }, i) =>
                savedDeck(deck, name, new Date(now + i)),
              ),
            );
          }}
          onSave={(deck, name) => {
            my.add(savedDeck(deck, name));
            setImporting(false);
            setDecksOpen(true);
          }}
        />
      )}
      {decksOpen && (
        <DecksWindow
          my={my}
          onClose={() => setDecksOpen(false)}
          onLoad={(deck, id) => {
            if (openDraft(draftOf(deck), id)) setDecksOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * The card grid, virtualized: only the rows in view (and a couple each side) are drawn, so the
 * whole pool scrolls smoothly.
 */
function CardGrid({
  entries,
  printOf,
  onAdd,
  onHover,
  onArt,
  artIndex,
}: {
  entries: readonly PoolEntry[];
  printOf: (e: PoolEntry) => Card;
  onAdd: (e: PoolEntry) => void;
  onHover: (e: PoolEntry | null) => void;
  onArt: (e: PoolEntry, step: number) => void;
  artIndex: (e: PoolEntry) => number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 800, width: 800 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () =>
      setView({
        top: el.scrollTop,
        height: el.clientHeight,
        width: el.clientWidth,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // A new filter starts at the top.
  useEffect(() => {
    if (box.current) box.current.scrollTop = 0;
  }, [entries]);
  const columns = Math.max(1, Math.floor((view.width + GAP) / (CELL_W + GAP)));
  const rows = Math.ceil(entries.length / columns);
  const first = Math.max(0, Math.floor(view.top / (CELL_H + GAP)) - OVERSCAN);
  const last = Math.min(
    rows,
    Math.ceil((view.top + view.height) / (CELL_H + GAP)) + OVERSCAN,
  );
  const visible = entries.slice(first * columns, last * columns);
  return (
    <div
      ref={box}
      className={styles.grid}
      data-testid="db-grid"
      onScroll={(e) =>
        setView((v) => ({
          ...v,
          top: (e.currentTarget as HTMLDivElement).scrollTop,
        }))
      }
    >
      <div style={{ height: rows * (CELL_H + GAP), position: "relative" }}>
        {visible.map((entry, i) => {
          const index = first * columns + i;
          const card = printOf(entry);
          return (
            <div
              key={entry.deckCardNumber}
              className={styles.cell}
              data-testid="db-card"
              data-card-number={entry.deckCardNumber}
              style={{
                left: (index % columns) * (CELL_W + GAP),
                top: Math.floor(index / columns) * (CELL_H + GAP),
                width: CELL_W,
                height: CELL_H,
              }}
              tabIndex={0}
              role="button"
              aria-label={`Add ${entry.card.name}`}
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(DRAG_TYPE, String(card.id))
              }
              onClick={() => onAdd(entry)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAdd(entry);
                }
              }}
              onMouseEnter={() => onHover(entry)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(entry)}
            >
              <div className={styles.thumb}>
                <span className={styles.fallback}>{entry.card.name}</span>
                <img
                  src={`/cards/${card.id}-thumb.webp`}
                  alt={entry.card.name}
                  loading="lazy"
                  onError={(e) => {
                    // No image (as on CI): the card's name shows instead.
                    e.currentTarget.style.visibility = "hidden";
                    e.currentTarget.parentElement?.setAttribute(
                      "data-missing",
                      "true",
                    );
                  }}
                />
              </div>
              <div className={styles.cellName} title={entry.card.name}>
                {entry.card.name}
              </div>
              {entry.prints.length > 1 && (
                <div className={styles.art} data-testid="db-art">
                  <button
                    type="button"
                    aria-label="Previous art"
                    onClick={(e) => {
                      // Flipping the art doesn't add the card.
                      e.stopPropagation();
                      onArt(entry, -1);
                    }}
                  >
                    ‹
                  </button>
                  <span data-testid="db-art-index">
                    Art {artIndex(entry) + 1}/{entry.prints.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Next art"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArt(entry, 1);
                    }}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The hovered card in full: its art, then what it says. */
function CardDetail({ card, base }: { card: Card; base: Card }) {
  const traits = getCardTraits(base);
  const text = getCardText(base);
  return (
    <div data-testid="db-preview">
      <img
        className={styles.full}
        src={`/cards/${card.id}-full.webp`}
        alt={base.name}
      />
      <h2 className={styles.detailName}>{base.name}</h2>
      <div className={styles.detailMeta}>
        {card.cardNumber} · {base.type}
        {base.rank !== null ? ` · rank ${base.rank}` : ""} ·{" "}
        {base.colors.join(", ")}
      </div>
      {traits.length > 0 && (
        <div className={styles.detailTraits}>{traits.join(", ")}</div>
      )}
      {text.hasErrata && (
        <div className={styles.detailMeta}>Errata: the corrected wording.</div>
      )}
      <p className={styles.detailText}>{text.text}</p>
    </div>
  );
}

/**
 * My decks (#157): the starter decks and your saved decks, with Delete, Export all and Import
 * backup. Load and Duplicate come with the deck panel (#158).
 */
function DecksWindow({
  my,
  onClose,
  onLoad,
}: {
  my: ReturnType<typeof useMyDecks>;
  onClose: () => void;
  /** #158: open a deck in the builder (a starter has no id: saving makes it yours). */
  onLoad: (deck: NamedDeck, id: string | null) => void;
}) {
  const starters = useMemo(
    () => deckOptions([]).filter((o) => o.kind === "official"),
    [],
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  // #161: Rename and Copy as plain text moved here from /play's My decks panel.
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [note, setNote] = useState<string | null>(null);
  const backup = useRef<HTMLInputElement>(null);
  const copy = async (deck: { name: string; list: string }) => {
    try {
      await navigator.clipboard.writeText(deck.list);
      setNote(`Copied ${deck.name} as plain text.`);
    } catch {
      setNote(
        `Couldn't reach the clipboard; Export the deck from the builder instead.`,
      );
    }
  };
  return (
    <div
      className={styles.backdrop}
      data-testid="db-decks-window"
      data-decks-stored={String(my.stored)}
      role="dialog"
      aria-label="My decks"
    >
      <div className={styles.window}>
        <h2>My decks</h2>
        <h3>Starter decks</h3>
        <ul className={styles.deckList}>
          {starters.map((s) => (
            <li key={s.key} data-testid="db-starter">
              <span className={styles.deckName}>{s.label}</span>
              <button
                type="button"
                data-testid="db-load"
                onClick={() => onLoad({ ...s.build(0), name: s.label }, null)}
              >
                Load
              </button>
            </li>
          ))}
        </ul>
        <h3>Your decks</h3>
        {!my.persistent && (
          <p data-testid="decks-session-only">
            This browser isn't saving decks (storage is off), so they last for
            this visit only.
          </p>
        )}
        {my.decks.length === 0 ? (
          <p>No saved decks yet. Import one, or build one here.</p>
        ) : (
          <ul className={styles.deckList}>
            {my.decks.map((d) => (
              <li key={d.id} data-testid="db-deck" data-deck-name={d.name}>
                {renaming?.id === d.id ? (
                  <span className={styles.deckName}>
                    <input
                      data-testid="rename-input"
                      aria-label={`New name for ${d.name}`}
                      value={renaming.name}
                      onChange={(e) =>
                        setRenaming({ id: d.id, name: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      data-testid="rename-save"
                      disabled={!renaming.name.trim()}
                      onClick={() => {
                        my.rename(d.id, renaming.name);
                        setRenaming(null);
                      }}
                    >
                      Save
                    </button>
                  </span>
                ) : (
                  <span className={styles.deckName}>{d.name}</span>
                )}
                <button
                  type="button"
                  data-testid="db-load"
                  onClick={() => {
                    const deck = deckOf(d);
                    if (deck) onLoad(deck, d.id);
                    else
                      setNote(
                        `${d.name} no longer reads cleanly; fix it with Import.`,
                      );
                  }}
                >
                  Load
                </button>
                <button
                  type="button"
                  data-testid="db-duplicate"
                  onClick={() => {
                    const deck = deckOf(d);
                    if (!deck) return;
                    const name = copyName(
                      d.name,
                      my.decks.map((x) => x.name),
                    );
                    my.add(savedDeck({ ...deck, name }, name));
                    setNote(`Duplicated as ${name}.`);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  data-testid="rename-deck"
                  onClick={() => setRenaming({ id: d.id, name: d.name })}
                >
                  Rename
                </button>
                <button
                  type="button"
                  data-testid="copy-deck"
                  onClick={() => void copy(d)}
                >
                  Copy
                </button>
                {deleting === d.id ? (
                  <>
                    <button
                      type="button"
                      data-testid="db-delete-confirm"
                      onClick={() => {
                        my.remove(d.id);
                        setDeleting(null);
                      }}
                    >
                      Delete {d.name}
                    </button>
                    <button type="button" onClick={() => setDeleting(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-testid="db-delete"
                    onClick={() => setDeleting(d.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.windowActions}>
          <button
            type="button"
            data-testid="db-export-all"
            disabled={my.decks.length === 0}
            onClick={() =>
              downloadText(backupJson(my.decks), "gojisim-my-decks.json")
            }
          >
            Export all
          </button>
          <button
            type="button"
            data-testid="db-import-backup"
            onClick={() => backup.current?.click()}
          >
            Import backup
          </button>
          <input
            ref={backup}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="db-backup-file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const { decks, problems } = readBackup(await file.text());
              my.add(...decks);
              setNote(
                [
                  `Restored ${decks.length} deck${decks.length === 1 ? "" : "s"}.`,
                  ...problems,
                ].join(" "),
              );
            }}
          />
          <span className={styles.spacer} />
          <button type="button" data-testid="db-decks-close" onClick={onClose}>
            Close
          </button>
        </div>
        {note && <p data-testid="db-decks-note">{note}</p>}
      </div>
    </div>
  );
}

/**
 * The deck panel (#158): the deck's name, its monster deck and main deck with counts and limits
 * (a click or a drop adds, - and + change a print's count), live legality from `validateDeck`
 * with each reason in plain words and the cards it names marked, then Save, Save as copy, Export
 * as GojiSim text and New deck. An illegal deck can still be saved (Casual allows it).
 */
function DeckPanel({
  draft,
  dirty,
  note,
  onChange,
  onDrop,
  onSave,
  onSaveCopy,
  onNew,
}: {
  draft: DeckDraft;
  dirty: boolean;
  note: string | null;
  onChange: (next: DeckDraft) => void;
  onDrop: (printId: string, zone: DeckZone) => void;
  onSave: () => void;
  onSaveCopy: () => void;
  onNew: () => void;
}) {
  const check = useMemo(() => legality(draft), [draft]);
  const zone = (
    which: DeckZone,
    title: string,
    cards: readonly Card[],
    limit: number,
  ) => (
    <section
      className={styles.zone}
      data-testid={`db-zone-${which}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) onDrop(id, which);
      }}
    >
      <h3 className={styles.zoneTitle}>
        {title}{" "}
        <span
          data-testid={`db-count-${which}`}
          data-full={cards.length === limit ? "true" : "false"}
        >
          {cards.length}/{limit}
        </span>
      </h3>
      {cards.length === 0 ? (
        <p className={styles.hint}>Click a card, or drag it here.</p>
      ) : (
        <ul className={styles.deckRows}>
          {rows(cards).map(({ card, count }) => (
            <li
              key={card.cardNumber}
              data-testid="db-row"
              data-card-number={card.cardNumber}
              data-broken={
                check.marked.has(card.deckCardNumber) ? "true" : undefined
              }
              className={
                check.marked.has(card.deckCardNumber)
                  ? styles.broken
                  : undefined
              }
            >
              <span className={styles.rowCount}>{count}×</span>
              <span className={styles.rowName} title={card.cardNumber}>
                {card.name}{" "}
                <span className={styles.rowNumber}>{card.cardNumber}</span>
              </span>
              <button
                type="button"
                aria-label={`One fewer ${card.name}`}
                data-testid="db-minus"
                onClick={() =>
                  onChange(removeCard(draft, which, card.cardNumber))
                }
              >
                −
              </button>
              <button
                type="button"
                aria-label={`One more ${card.name}`}
                data-testid="db-plus"
                onClick={() => onChange(addCard(draft, card, which))}
              >
                +
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <aside className={styles.panel} data-testid="db-panel" aria-label="Deck">
      <label className={styles.field}>
        Deck name
        <input
          data-testid="db-deck-name"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </label>
      {zone("monster", "Monster deck", draft.monsterDeck, MONSTER_DECK_SIZE)}
      {zone("main", "Main deck", draft.mainDeck, MAIN_DECK_SIZE)}
      <section
        className={styles.legality}
        data-testid="db-legality"
        data-legal={check.legal ? "true" : "false"}
      >
        {check.legal ? (
          <strong>Legal for Tournament games</strong>
        ) : (
          <>
            <strong>Not legal yet</strong> (Casual games allow it)
            <ul>
              {check.reasons.map((r, i) => (
                <li key={i} data-testid="db-reason">
                  {r.text}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <div className={styles.panelActions}>
        <button type="button" data-testid="db-save" onClick={onSave}>
          Save{dirty ? " *" : ""}
        </button>
        <button type="button" data-testid="db-save-copy" onClick={onSaveCopy}>
          Save as copy
        </button>
        <button
          type="button"
          data-testid="db-export"
          onClick={() =>
            downloadText(draftText(draft), `${draft.name.trim() || "deck"}.txt`)
          }
        >
          Export
        </button>
        <button type="button" data-testid="db-new" onClick={onNew}>
          New deck
        </button>
      </div>
      {note && <p data-testid="db-panel-note">{note}</p>}
    </aside>
  );
}

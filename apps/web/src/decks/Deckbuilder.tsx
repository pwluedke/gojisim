import "../theme.css";
import {
  type Card,
  getCardText,
  getCardTraits,
  getMaxCopies,
} from "@gojisim/cards";
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
  movieOf,
  NO_FILTER,
  type PoolEntry,
  setOf,
} from "./cardPool";
import styles from "./Deckbuilder.module.css";
import {
  addCard,
  asDeck,
  copiesOf,
  copyName,
  type DeckDraft,
  deckCounts,
  type DeckZone,
  draftOf,
  draftText,
  emptyDraft,
  fillTo,
  legality,
  MAIN_DECK_SIZE,
  MONSTER_DECK_SIZE,
  rankColumns,
  removeCopy,
  rows,
  slotOrder,
} from "./deckDraft";

/** #165: the card grid has 5 or 6 columns (6 once each card gets this wide, px). */
const SIX_COLUMNS_FROM = 120;
/** A card image's height for its width (63 × 88 mm). */
const CARD_RATIO = 88 / 63;
/** The − / N / 4 / + row under each card image (px). */
const CONTROLS_H = 30;
const GAP = 8;
/** #165: the main deck's view, Slots or Rank columns, remembered per browser. */
const VIEW_KEY = "gojisim.deckbuilder.mainView";
type MainView = "slots" | "ranks";
function loadView(): MainView {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "ranks"
      ? "ranks"
      : "slots";
  } catch {
    return "slots";
  }
}
function saveView(view: MainView) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage blocked: the choice lasts for this page view.
  }
}
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
  // The hovered card (a grid card or a deck slot), previewed while no card detail is open.
  const [hovered, setHovered] = useState<{
    entry: PoolEntry;
    print: Card;
  } | null>(null);
  // #165: the card in the detail panel, by its deck card number.
  const [selected, setSelected] = useState<string | null>(null);
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
  const entryOf = useMemo(
    () => new Map(pool.map((e) => [e.deckCardNumber, e])),
    [pool],
  );
  const limitOf = (deckCardNumber: string) =>
    getMaxCopies(deckCardNumber, new Date());
  const selectedEntry = selected ? entryOf.get(selected) : undefined;
  /** Opens a deck slot's card in the detail panel, showing the print in the deck. */
  const openCard = (card: Card) => {
    const entry = entryOf.get(card.deckCardNumber);
    if (!entry) return;
    const at = entry.prints.findIndex((p) => p.id === card.id);
    if (at >= 0) setArt((a) => ({ ...a, [entry.deckCardNumber]: at }));
    setSelected(entry.deckCardNumber);
  };
  // #165: Esc closes the detail panel; the arrow keys move through the filtered list.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea")) return;
      if (e.key === "Escape") {
        setSelected(null);
        return;
      }
      const step =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : 0;
      if (!step || shown.length === 0) return;
      e.preventDefault();
      const at = shown.findIndex((x) => x.deckCardNumber === selected);
      const next =
        at < 0 ? 0 : Math.min(Math.max(at + step, 0), shown.length - 1);
      setSelected(shown[next]?.deckCardNumber ?? null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, shown]);
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
  const flipArt = (e: PoolEntry, step: number) =>
    setArt((a) => ({
      ...a,
      [e.deckCardNumber]:
        ((a[e.deckCardNumber] ?? 0) + step + e.prints.length) % e.prints.length,
    }));
  const hoverCard = (card: Card | null) => {
    const entry = card ? entryOf.get(card.deckCardNumber) : undefined;
    setHovered(card && entry ? { entry, print: card } : null);
  };

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
            copies={(e) => copiesOf(draft, e.deckCardNumber)}
            limit={(e) => limitOf(e.deckCardNumber)}
            selected={selected}
            onOpen={(e) => setSelected(e.deckCardNumber)}
            onAdd={(e) => setDraft((d) => addCard(d, printOf(e)))}
            onRemove={(e) => setDraft((d) => removeCopy(d, e.deckCardNumber))}
            onHover={(e) => hoverCard(e ? printOf(e) : null)}
          />
          {selectedEntry ? (
            <DetailPanel
              entry={selectedEntry}
              print={printOf(selectedEntry)}
              artIndex={art[selectedEntry.deckCardNumber] ?? 0}
              copies={copiesOf(draft, selectedEntry.deckCardNumber)}
              limit={limitOf(selectedEntry.deckCardNumber)}
              onArt={(step) => flipArt(selectedEntry, step)}
              onAdd={() => setDraft((d) => addCard(d, printOf(selectedEntry)))}
              onRemove={() =>
                setDraft((d) => removeCopy(d, selectedEntry.deckCardNumber))
              }
              onFill={() =>
                setDraft((d) =>
                  fillTo(
                    d,
                    printOf(selectedEntry),
                    limitOf(selectedEntry.deckCardNumber),
                  ),
                )
              }
              onClose={() => setSelected(null)}
            />
          ) : (
            hovered && (
              <aside
                className={styles.detail}
                data-testid="db-detail"
                aria-live="polite"
              >
                <CardDetail card={hovered.print} base={hovered.entry.card} />
              </aside>
            )
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
          onOpen={openCard}
          onHover={hoverCard}
        />
      </div>

      {importing && (
        <ImportDeck
          mine={my.decks}
          onClose={() => setImporting(false)}
          onReplace={(id, deck) => {
            const existing = my.decks.find((d) => d.id === id);
            if (existing)
              my.update({
                ...existing,
                list: savedDeck(deck, existing.name).list,
              });
          }}
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

/** A card image with its name showing when the image is missing (as on CI). */
function CardImage({
  card,
  name,
  size,
}: {
  card: Card;
  name: string;
  size: "thumb" | "full";
}) {
  return (
    <div className={styles.thumb}>
      <span className={styles.fallback}>{name}</span>
      <img
        src={`/cards/${card.id}-${size}.webp`}
        alt={name}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
          e.currentTarget.parentElement?.setAttribute("data-missing", "true");
        }}
      />
    </div>
  );
}

/**
 * The card grid, virtualized: only the rows in view (and a couple each side) are drawn, so the
 * whole pool scrolls smoothly. #165: 5 or 6 columns of card images, each with − / "N / 4" / +
 * under it; a click on the image opens the card detail, and the selected card has a gold outline.
 */
function CardGrid({
  entries,
  printOf,
  copies,
  limit,
  selected,
  onOpen,
  onAdd,
  onRemove,
  onHover,
}: {
  entries: readonly PoolEntry[];
  printOf: (e: PoolEntry) => Card;
  copies: (e: PoolEntry) => number;
  limit: (e: PoolEntry) => number;
  selected: string | null;
  onOpen: (e: PoolEntry) => void;
  onAdd: (e: PoolEntry) => void;
  onRemove: (e: PoolEntry) => void;
  onHover: (e: PoolEntry | null) => void;
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
  const columns = (view.width - 5 * GAP) / 6 >= SIX_COLUMNS_FROM ? 6 : 5;
  const cellW = Math.max(40, (view.width - (columns - 1) * GAP) / columns);
  const cellH = Math.round(cellW * CARD_RATIO) + CONTROLS_H;
  const rowCount = Math.ceil(entries.length / columns);
  // The arrow keys can move the selection out of view: scroll its row back in.
  useEffect(() => {
    const el = box.current;
    const at = entries.findIndex((e) => e.deckCardNumber === selected);
    if (!el || at < 0) return;
    const top = Math.floor(at / columns) * (cellH + GAP);
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + cellH > el.scrollTop + el.clientHeight)
      el.scrollTop = top + cellH - el.clientHeight;
  }, [selected, entries, columns, cellH]);
  const first = Math.max(0, Math.floor(view.top / (cellH + GAP)) - OVERSCAN);
  const last = Math.min(
    rowCount,
    Math.ceil((view.top + view.height) / (cellH + GAP)) + OVERSCAN,
  );
  const visible = entries.slice(first * columns, last * columns);
  return (
    <div
      ref={box}
      className={styles.grid}
      data-testid="db-grid"
      data-columns={columns}
      onScroll={(e) => {
        // Read now: React clears currentTarget before a state updater runs.
        const top = e.currentTarget.scrollTop;
        setView((v) => ({ ...v, top }));
      }}
    >
      <div style={{ height: rowCount * (cellH + GAP), position: "relative" }}>
        {visible.map((entry, i) => {
          const index = first * columns + i;
          const card = printOf(entry);
          const n = copies(entry);
          const max = limit(entry);
          return (
            <div
              key={entry.deckCardNumber}
              className={styles.cell}
              data-testid="db-card"
              data-card-number={entry.deckCardNumber}
              data-selected={
                entry.deckCardNumber === selected ? "true" : undefined
              }
              style={{
                left: (index % columns) * (cellW + GAP),
                top: Math.floor(index / columns) * (cellH + GAP),
                width: cellW,
                height: cellH,
              }}
              onMouseEnter={() => onHover(entry)}
              onMouseLeave={() => onHover(null)}
            >
              <div
                className={styles.cellImage}
                data-testid="db-card-image"
                tabIndex={0}
                role="button"
                aria-label={`Open ${entry.card.name}`}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData(DRAG_TYPE, String(card.id))
                }
                onClick={() => onOpen(entry)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(entry);
                  }
                }}
                onFocus={() => onHover(entry)}
              >
                <CardImage card={card} name={entry.card.name} size="thumb" />
              </div>
              <div className={styles.cellControls}>
                <button
                  type="button"
                  data-testid="db-card-minus"
                  aria-label={`One fewer ${entry.card.name}`}
                  disabled={n === 0}
                  onClick={() => onRemove(entry)}
                >
                  −
                </button>
                <span
                  data-testid="db-card-copies"
                  data-over={n > max ? "true" : undefined}
                  title={`${n} in the deck; up to ${max}`}
                >
                  {n} / {max}
                </span>
                <button
                  type="button"
                  data-testid="db-card-plus"
                  aria-label={`One more ${entry.card.name}`}
                  onClick={() => onAdd(entry)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * #165: the card detail panel over the right part of the card list: the large image with its
 * art choice, what the card is and says, its copies in the deck, and − 1 / + 1 / Add 4.
 */
function DetailPanel({
  entry,
  print,
  artIndex,
  copies,
  limit,
  onArt,
  onAdd,
  onRemove,
  onFill,
  onClose,
}: {
  entry: PoolEntry;
  print: Card;
  artIndex: number;
  copies: number;
  limit: number;
  onArt: (step: number) => void;
  onAdd: () => void;
  onRemove: () => void;
  onFill: () => void;
  onClose: () => void;
}) {
  const base = entry.card;
  const traits = getCardTraits(base);
  const text = getCardText(base);
  return (
    <aside
      className={styles.cardPanel}
      data-testid="db-card-panel"
      data-card-number={entry.deckCardNumber}
      aria-label={`${base.name} details`}
    >
      <button
        type="button"
        className={styles.close}
        data-testid="db-card-panel-close"
        aria-label="Close [Esc]"
        title="Close [Esc]"
        onClick={onClose}
      >
        ×
      </button>
      <div className={styles.bigImage}>
        <CardImage card={print} name={base.name} size="full" />
      </div>
      {entry.prints.length > 1 && (
        <div className={styles.art} data-testid="db-art">
          <button
            type="button"
            aria-label="Previous art"
            onClick={() => onArt(-1)}
          >
            ‹
          </button>
          <span data-testid="db-art-index">
            Art {artIndex + 1}/{entry.prints.length} · {print.cardNumber}
          </span>
          <button type="button" aria-label="Next art" onClick={() => onArt(1)}>
            ›
          </button>
        </div>
      )}
      <h2 className={styles.detailName} data-testid="db-card-panel-name">
        {base.name}
      </h2>
      <dl className={styles.facts}>
        <dt>Type</dt>
        <dd>{base.type}</dd>
        <dt>Color</dt>
        <dd>{base.colors.join(", ") || "None"}</dd>
        {base.rank !== null && (
          <>
            <dt>Rank</dt>
            <dd>{base.rank}</dd>
          </>
        )}
        {traits.length > 0 && (
          <>
            <dt>Traits</dt>
            <dd>{traits.join(", ")}</dd>
          </>
        )}
        <dt>Movie</dt>
        <dd>{movieOf(entry)}</dd>
        <dt>Set</dt>
        <dd>{setOf(entry)}</dd>
      </dl>
      {text.hasErrata && (
        <div className={styles.detailMeta}>Errata: the corrected wording.</div>
      )}
      <p className={styles.detailText}>{text.text}</p>
      <div className={styles.inDeck} data-testid="db-card-panel-copies">
        In deck: {copies} / {limit}
      </div>
      <div className={styles.cardPanelActions}>
        <button
          type="button"
          data-testid="db-card-panel-minus"
          disabled={copies === 0}
          onClick={onRemove}
        >
          − 1
        </button>
        <button type="button" data-testid="db-card-panel-plus" onClick={onAdd}>
          + 1
        </button>
        <button
          type="button"
          data-testid="db-card-panel-fill"
          title={`Fill to the limit (${limit})`}
          disabled={copies >= limit}
          onClick={onFill}
        >
          Add {limit}
        </button>
      </div>
      <p className={styles.keysHint}>← → next and previous card · Esc closes</p>
    </aside>
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

/** A deck slot: the card's image, or a dashed empty slot. */
function Slot({
  card,
  broken,
  testId,
  onOpen,
  onHover,
}: {
  card: Card | undefined;
  broken?: boolean;
  testId: string;
  onOpen: (card: Card) => void;
  onHover: (card: Card | null) => void;
}) {
  if (!card)
    return (
      <div
        className={styles.slotEmpty}
        data-testid={`${testId}-empty`}
        aria-hidden
      />
    );
  return (
    <button
      type="button"
      className={styles.slot}
      data-testid={testId}
      data-card-number={card.cardNumber}
      data-broken={broken ? "true" : undefined}
      aria-label={card.name}
      title={card.name}
      onClick={() => onOpen(card)}
      onMouseEnter={() => onHover(card)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(card)}
      onBlur={() => onHover(null)}
    >
      <CardImage card={card} name={card.name} size="thumb" />
    </button>
  );
}

/**
 * #165: the deck panel. The name, the legality banner, the monster deck's 4 image slots, the main
 * deck as 50 slots or 8 rank columns, the counts, then Save, Save as copy and Export.
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
  onOpen,
  onHover,
}: {
  draft: DeckDraft;
  dirty: boolean;
  note: string | null;
  onChange: (next: DeckDraft) => void;
  onDrop: (printId: string, zone: DeckZone) => void;
  onSave: () => void;
  onSaveCopy: () => void;
  onNew: () => void;
  onOpen: (card: Card) => void;
  onHover: (card: Card | null) => void;
}) {
  const check = useMemo(() => legality(draft), [draft]);
  const counts = useMemo(() => deckCounts(draft), [draft]);
  const [view, setView] = useState<MainView>(loadView);
  const broken = (card: Card) => check.marked.has(card.deckCardNumber);
  const dropZone = (which: DeckZone) => ({
    "data-testid": `db-zone-${which}`,
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (id) onDrop(id, which);
    },
  });
  const count = (which: DeckZone, n: number, limit: number) => (
    <span
      data-testid={`db-count-${which}`}
      data-full={n === limit ? "true" : "false"}
    >
      {n}/{limit}
    </span>
  );
  const monsters = slotOrder(draft.monsterDeck);
  const main = slotOrder(draft.mainDeck);
  return (
    <aside className={styles.panel} data-testid="db-panel" aria-label="Deck">
      <label className={styles.nameField}>
        <span className={styles.visuallyHidden}>Deck name</span>
        <input
          data-testid="db-deck-name"
          aria-label="Deck name"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </label>
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
      <section className={styles.zone} {...dropZone("monster")}>
        <h3 className={styles.zoneTitle}>
          Monster deck{" "}
          {count("monster", draft.monsterDeck.length, MONSTER_DECK_SIZE)}
        </h3>
        <div className={styles.monsterSlots}>
          {Array.from(
            { length: Math.max(MONSTER_DECK_SIZE, monsters.length) },
            (_, i) => (
              <Slot
                key={i}
                card={monsters[i]}
                broken={monsters[i] ? broken(monsters[i]) : false}
                testId="db-monster-slot"
                onOpen={onOpen}
                onHover={onHover}
              />
            ),
          )}
        </div>
      </section>
      <section className={styles.zone} {...dropZone("main")}>
        <h3 className={styles.zoneTitle}>
          Main deck {count("main", draft.mainDeck.length, MAIN_DECK_SIZE)}
          <span className={styles.spacer} />
          <span
            className={styles.viewToggle}
            role="group"
            aria-label="Main deck view"
          >
            {(
              [
                ["slots", "Slots"],
                ["ranks", "Rank columns"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                data-testid={`db-view-${value}`}
                aria-pressed={view === value}
                onClick={() => {
                  setView(value);
                  saveView(value);
                }}
              >
                {label}
              </button>
            ))}
          </span>
        </h3>
        {view === "slots" ? (
          <div className={styles.mainSlots} data-testid="db-main-slots">
            {Array.from(
              { length: Math.max(MAIN_DECK_SIZE, main.length) },
              (_, i) => (
                <Slot
                  key={i}
                  card={main[i]}
                  broken={main[i] ? broken(main[i]) : false}
                  testId="db-main-slot"
                  onOpen={onOpen}
                  onHover={onHover}
                />
              ),
            )}
          </div>
        ) : (
          <div className={styles.rankColumns} data-testid="db-rank-columns">
            {rankColumns(draft.mainDeck).map((cards, i) => (
              <div
                key={i}
                className={styles.rankColumn}
                data-testid="db-rank-column"
                data-rank={i + 1}
              >
                <div className={styles.rankHead}>
                  R{i + 1} · {cards.length}
                </div>
                <ul>
                  {/* Copies of a print stack into one entry with its count, so each name shows. */}
                  {rows(cards).map(({ card, count: n }) => (
                    <li key={card.cardNumber}>
                      <button
                        type="button"
                        className={styles.stacked}
                        data-testid="db-rank-card"
                        data-card-number={card.cardNumber}
                        data-copies={n}
                        data-broken={broken(card) ? "true" : undefined}
                        title={`${n} × ${card.name} (${card.cardNumber})`}
                        onClick={() => onOpen(card)}
                        onMouseEnter={() => onHover(card)}
                        onMouseLeave={() => onHover(null)}
                      >
                        <b>{n}×</b> {card.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className={styles.counts} data-testid="db-counts">
        Battle {counts.battle} · Strategy {counts.strategy}
        {counts.colors.map(([color, n]) => ` · ${color} ${n}`).join("")}
      </div>
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

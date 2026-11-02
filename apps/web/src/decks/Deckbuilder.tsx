import "../theme.css";
import { type Card, getCardText, getCardTraits } from "@gojisim/cards";
import { getAllCards } from "@gojisim/cards/all-cards";
import { useEffect, useMemo, useRef, useState } from "react";
import { backupJson, readBackup, savedDeck } from "../game/deckStore";
import { deckOptions } from "../game/decks";
import { downloadText } from "../game/session";
import { useMyDecks } from "../game/useMyDecks";
import { ImportDeck } from "../play/ImportDeck";
import { applyTheme, loadSettings } from "../play/settings";
import { PlayerBadge } from "../PlayerBadge";
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

/** A card cell's size in the grid, image and art row included (px). */
const CELL_W = 132;
const CELL_H = 212;
const GAP = 8;
/** Rows drawn above and below the visible ones, so a fast scroll doesn't show gaps. */
const OVERSCAN = 2;

/**
 * The Deckbuilder (#157): every supported card in a searchable, filterable grid, with the full
 * preview on hover and an art choice for cards with parallel prints. The header has Import and My
 * decks. The deck panel (#158) comes next.
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
        </section>

        <aside
          className={styles.detail}
          data-testid="db-detail"
          aria-live="polite"
        >
          {hovered ? (
            <CardDetail card={printOf(hovered)} base={hovered.card} />
          ) : (
            <p className={styles.hint}>Hover a card to see it in full.</p>
          )}
        </aside>
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
      {decksOpen && <DecksWindow my={my} onClose={() => setDecksOpen(false)} />}
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
  onHover,
  onArt,
  artIndex,
}: {
  entries: readonly PoolEntry[];
  printOf: (e: PoolEntry) => Card;
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
              onMouseEnter={() => onHover(entry)}
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
                    onClick={() => onArt(entry, -1)}
                  >
                    ‹
                  </button>
                  <span data-testid="db-art-index">
                    Art {artIndex(entry) + 1}/{entry.prints.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Next art"
                    onClick={() => onArt(entry, 1)}
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
}: {
  my: ReturnType<typeof useMyDecks>;
  onClose: () => void;
}) {
  const starters = useMemo(
    () => deckOptions([]).filter((o) => o.kind === "official"),
    [],
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const backup = useRef<HTMLInputElement>(null);
  return (
    <div
      className={styles.backdrop}
      data-testid="db-decks-window"
      role="dialog"
      aria-label="My decks"
    >
      <div className={styles.window}>
        <h2>My decks</h2>
        <h3>Starter decks</h3>
        <ul className={styles.deckList}>
          {starters.map((s) => (
            <li key={s.key} data-testid="db-starter">
              {s.label}
            </li>
          ))}
        </ul>
        <h3>Your decks</h3>
        {my.decks.length === 0 ? (
          <p>No saved decks yet. Import one, or build one (coming next).</p>
        ) : (
          <ul className={styles.deckList}>
            {my.decks.map((d) => (
              <li key={d.id} data-testid="db-deck" data-deck-name={d.name}>
                <span className={styles.deckName}>{d.name}</span>
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

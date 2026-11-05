import type { Card } from "@gojisim/cards";
import { useEffect, useMemo, useState } from "react";
import { GLOW_COLORS } from "../play/glow";
import {
  type DeckDraft,
  deckStats,
  sampleHand,
  STAT_TYPES,
  type StatType,
} from "./deckDraft";
import styles from "./DeckStats.module.css";

/**
 * #159: the deck panel's stats, folded to today's counts line, and a sample opening hand. Open
 * or folded is remembered per browser.
 */
const OPEN_KEY = "gojisim.deckbuilder.statsOpen";

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
    // Storage blocked: the panel still opens for this page view.
  }
}

/** A new seed for a sample hand: short, so it can be read out. */
const newSeed = () => Math.random().toString(36).slice(2, 8);

export function DeckStats({
  draft,
  onOpen,
  onHover,
}: {
  draft: DeckDraft;
  onOpen: (card: Card) => void;
  onHover: (card: Card | null) => void;
}) {
  const stats = useMemo(() => deckStats(draft), [draft]);
  const [open, setOpen] = useState(loadOpen);
  const [seed, setSeed] = useState<string | null>(null);
  const toggle = () => {
    setOpen(!open);
    saveOpen(!open);
  };
  const tallest = Math.max(
    1,
    ...stats.curve.map((r) => STAT_TYPES.reduce((n, t) => n + r.byType[t], 0)),
  );
  const summary =
    `Battle ${stats.types.Battle} · Strategy ${stats.types.Strategy}` +
    stats.colors.map(([color, n]) => ` · ${color} ${n}`).join("");
  return (
    <section className={styles.stats} data-testid="db-stats">
      <div className={styles.head}>
        <button
          type="button"
          className={styles.toggle}
          data-testid="db-stats-toggle"
          aria-expanded={open}
          onClick={toggle}
        >
          {open ? "▾" : "▸"} Stats
        </button>
        {!open && (
          <span className={styles.summary} data-testid="db-counts">
            {summary}
          </span>
        )}
        <span className={styles.spacer} />
        <button
          type="button"
          data-small
          data-testid="db-sample-hand"
          disabled={draft.mainDeck.length < 5}
          onClick={() => setSeed(newSeed())}
        >
          Sample hand
        </button>
      </div>
      {open && (
        <div className={styles.body} data-testid="db-stats-body">
          <div className={styles.row} data-testid="db-stats-types">
            {STAT_TYPES.map((t) => (
              <span key={t} className={styles.type} data-type={t}>
                <i className={styles.swatch} data-type={t} /> {t}{" "}
                <b>{stats.types[t]}</b>
              </span>
            ))}
          </div>
          <div className={styles.row} data-testid="db-stats-colors">
            {stats.colors.map(([color, n]) => (
              <span key={color} className={styles.color}>
                <i
                  className={styles.dot}
                  style={{
                    background: GLOW_COLORS[color] ?? GLOW_COLORS["grey"],
                  }}
                />
                {color} <b>{n}</b>
              </span>
            ))}
            <span
              className={styles.icon2}
              data-testid="db-stats-icon2"
              data-over={stats.icon2 > stats.icon2Limit ? "true" : "false"}
            >
              Icon 2: {stats.icon2} / {stats.icon2Limit}
            </span>
          </div>
          <div
            className={styles.curve}
            data-testid="db-stats-curve"
            role="img"
            aria-label={`Rank curve: ${stats.curve
              .map(
                (r) =>
                  `rank ${r.rank} ${STAT_TYPES.reduce((n, t) => n + r.byType[t], 0)}`,
              )
              .join(", ")}`}
          >
            {stats.curve.map((r) => {
              const total = STAT_TYPES.reduce((n, t) => n + r.byType[t], 0);
              return (
                <div
                  key={r.rank}
                  className={styles.bar}
                  data-testid="db-stats-bar"
                  data-rank={r.rank}
                  data-count={total}
                >
                  <span className={styles.barCount}>{total || ""}</span>
                  <div className={styles.barStack}>
                    {(["Strategy", "Battle", "Monster"] as StatType[]).map(
                      (t) =>
                        r.byType[t] > 0 && (
                          <i
                            key={t}
                            className={styles.part}
                            data-type={t}
                            style={{
                              height: `${(r.byType[t] / tallest) * 100}%`,
                            }}
                          />
                        ),
                    )}
                  </div>
                  <span className={styles.barRank}>{r.rank}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {seed !== null && (
        <SampleHand
          draft={draft}
          seed={seed}
          onAgain={() => setSeed(newSeed())}
          onClose={() => setSeed(null)}
          onOpen={onOpen}
          onHover={onHover}
        />
      )}
    </section>
  );
}

/** #159: a sample opening hand (6.3.1.5) over the panel: Draw again, ✕ or Esc. */
function SampleHand({
  draft,
  seed,
  onAgain,
  onClose,
  onOpen,
  onHover,
}: {
  draft: DeckDraft;
  seed: string;
  onAgain: () => void;
  onClose: () => void;
  onOpen: (card: Card) => void;
  onHover: (card: Card | null) => void;
}) {
  const hand = useMemo(() => sampleHand(draft, seed), [draft, seed]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  return (
    <div
      className={styles.backdrop}
      data-testid="db-hand-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={styles.window}
        role="dialog"
        aria-label="Sample opening hand"
        data-testid="db-hand"
      >
        <div className={styles.windowHead}>
          <h3>Sample opening hand</h3>
          <span className={styles.seed} data-testid="db-hand-seed">
            seed {seed}
          </span>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            data-testid="db-hand-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className={styles.cards}>
          {hand.map((card, i) => (
            <button
              key={`${card.id}-${i}`}
              type="button"
              className={styles.card}
              data-testid="db-hand-card"
              data-card-number={card.deckCardNumber}
              title={card.name}
              onClick={() => onOpen(card)}
              onMouseEnter={() => onHover(card)}
              onMouseLeave={() => onHover(null)}
            >
              <span className={styles.fallback}>{card.name}</span>
              <img
                src={`/cards/${card.id}-thumb.webp`}
                alt={card.name}
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            </button>
          ))}
        </div>
        <div className={styles.windowFoot}>
          <button
            type="button"
            data-primary
            data-testid="db-hand-again"
            onClick={onAgain}
          >
            Draw again
          </button>
        </div>
      </div>
    </div>
  );
}

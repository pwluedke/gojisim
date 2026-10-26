import "@fontsource/anton/400.css";
import "@fontsource/bungee/400.css";
import { useLayoutEffect, useRef, useState } from "react";
import styles from "./Board.module.css";
import { TipBubble } from "./Tooltip";

/** A deck with no name in the record (an older record, or a fixture) reads like a fight poster. */
export const MYSTERY_DECK = "Mystery Deck";

/** The deck name's font size (px): the largest that fits, down to the smallest before it's cut. */
const NAME_MAX = 30;
const NAME_MIN = 16;

/** One side of the fight card. */
export interface FightSide {
  deck: string | undefined;
  /** "Bot (Hard)" on a bot's side; nothing on the human's. */
  bot?: string | undefined;
}

/**
 * A deck name in the fight card: shrunk until it fits its line, then cut with an ellipsis, with
 * the full name in the app's tooltip only when it was cut.
 */
function DeckName({ name, side }: { name: string; side: "you" | "opp" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(NAME_MAX);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let px = NAME_MAX;
      el.style.fontSize = `${px}px`;
      while (px > NAME_MIN && el.scrollWidth > el.clientWidth) {
        px -= 1;
        el.style.fontSize = `${px}px`;
      }
      setSize(px);
      setCut(el.scrollWidth > el.clientWidth);
    };
    fit();
    // Fit again when the line's width changes (not its height, which the fit itself changes),
    // and once the bundled fonts have loaded.
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [name]);
  // The app's tooltip with the full name, only when the name was cut (one element throughout,
  // so the fit always measures the name on screen).
  const [tip, setTip] = useState<DOMRect | null>(null);
  return (
    <div
      ref={ref}
      className={styles.fightName}
      data-testid={`fight-deck-${side}`}
      data-cut={cut ? "true" : undefined}
      data-side={side}
      style={{ fontSize: size }}
      tabIndex={cut ? 0 : undefined}
      onMouseEnter={(e) =>
        cut && setTip(e.currentTarget.getBoundingClientRect())
      }
      onMouseLeave={() => setTip(null)}
      onFocus={(e) => cut && setTip(e.currentTarget.getBoundingClientRect())}
      onBlur={() => setTip(null)}
    >
      {name}
      {tip && <TipBubble box={tip} tip={name} />}
    </div>
  );
}

/**
 * The fight-card header (M5h #18) at the top of the log column: your deck, "VS", the
 * opponent's deck, each centered, like a fight poster. The bot's side adds its level.
 */
export function FightCard({ you, opp }: { you: FightSide; opp: FightSide }) {
  const side = (s: FightSide, key: "you" | "opp") => (
    <div className={styles.fightSide}>
      <DeckName name={s.deck?.trim() || MYSTERY_DECK} side={key} />
      {s.bot && (
        <div className={styles.fightBot} data-testid={`fight-bot-${key}`}>
          {s.bot}
        </div>
      )}
    </div>
  );
  return (
    <header className={styles.fightCard} data-testid="fight-card">
      {side(you, "you")}
      <div
        className={styles.fightVs}
        data-testid="fight-vs"
        aria-label="versus"
      >
        VS
      </div>
      {side(opp, "opp")}
    </header>
  );
}

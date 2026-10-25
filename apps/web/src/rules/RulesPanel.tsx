import { useEffect, useRef } from "react";
import styles from "../play/Board.module.css";
import { allRules } from "./rules";

/**
 * The in-app rules panel (M5h #11): the Comprehensive Rules v1.2, parsed into numbered rules,
 * opened at `at` (scrolled to it and highlighted). Esc or Close closes it.
 */
export function RulesPanel({
  at,
  onClose,
}: {
  at: string;
  onClose: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-rule="${CSS.escape(at)}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [at]);
  useEffect(() => {
    // Before the board's shortcuts, which also use Esc.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  });
  return (
    <aside className={styles.rulesPanel} data-testid="rules-panel">
      <div className={styles.rulesHeader}>
        <strong>Comprehensive Rules v1.2</strong>
        <button
          type="button"
          className={styles.button}
          data-testid="rules-close"
          onClick={onClose}
        >
          Close [Esc]
        </button>
      </div>
      <div className={styles.rulesList} ref={list}>
        {allRules().map((rule) => (
          <div
            key={rule.number}
            className={`${rule.depth <= 2 ? styles.ruleHeading : styles.rule}${rule.number === at ? ` ${styles.ruleAt}` : ""}`}
            style={{ paddingLeft: `${Math.max(0, rule.depth - 2) * 12}px` }}
            data-rule={rule.number}
            data-testid={rule.number === at ? "rule-at" : undefined}
          >
            <span className={styles.ruleNumber}>{rule.number}</span> {rule.text}
          </div>
        ))}
      </div>
    </aside>
  );
}

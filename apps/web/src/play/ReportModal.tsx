import { useEffect, useRef, useState } from "react";
import { MAX_REPORT_LENGTH } from "../game/collection";
import styles from "./Board.module.css";

export interface ReportModalProps {
  kind: "badBot" | "goodBot" | "bug";
  /** Bad Bot! and Good Bot!: the marked move in announcement wording, and when it was played. */
  move?: { plain: string; when: string };
  /** The name last used, pre-filled. */
  name: string;
  /**
   * Sharing finished games is off. Bad Bot!: nothing can be sent, so it points to Report bug.
   * Good Bot!: nothing can be sent, and there is no download. Report bug: its button reads
   * Download instead of Send.
   */
  sharingOff?: boolean;
  onSubmit: (name: string, text: string) => void;
  onCancel: () => void;
  /** Bad Bot! with sharing off: open Report bug instead. */
  onReportBug?: () => void;
}

const COPY = {
  badBot: {
    title: "What did the bot do wrong?",
    label: "Why was this a bad move? What would you have done?",
    submit: "Send",
  },
  goodBot: {
    title: "What did the bot do right?",
    label: "Why was this a good play?",
    submit: "Send",
  },
  bug: {
    title: "What went wrong?",
    label: "What happened, and what did you expect?",
    submit: "Send",
  },
} as const;

/**
 * The Bad Bot!, Good Bot! and Report bug popups (M13b): a required name (remembered) and a
 * required text of up to 1,000 characters; Esc cancels. While one is open the bot waits. All
 * three send the record to the server; Report bug downloads it when sharing is off.
 */
export function ReportModal({
  kind,
  move,
  name: savedName,
  sharingOff = false,
  onSubmit,
  onCancel,
  onReportBug,
}: ReportModalProps) {
  const [name, setName] = useState(savedName);
  const [text, setText] = useState("");
  const first = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const copy = COPY[kind];
  const ready = name.trim() !== "" && text.trim() !== "";
  // Bad Bot! can't send with sharing off; Report bug downloads the file instead.
  const blocked = sharingOff && kind !== "bug";
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    // Capture, so the board's own Esc handling never sees it.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  return (
    <div
      className={`${styles.modalBackdrop} ${styles.reportBackdrop}`}
      data-testid={`${kind}-modal`}
    >
      <form
        className={`${styles.modal} ${styles.reportModal}`}
        role="dialog"
        aria-labelledby="report-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !blocked) onSubmit(name.trim(), text.trim());
        }}
      >
        <div className={styles.modalHeading} id="report-title">
          {copy.title}
        </div>
        {move && (
          <div className={styles.reportMove} data-testid="bad-bot-move">
            <div>{move.plain}</div>
            <div className={styles.muted}>{move.when}</div>
          </div>
        )}
        {sharingOff && kind === "bug" && (
          <p data-testid="report-bug-sharing-off">
            Sharing finished games is off (Test settings), so the game file
            downloads instead. Send it to Paul.
          </p>
        )}
        {blocked && kind === "badBot" ? (
          <p data-testid="bad-bot-sharing-off">
            Sharing finished games is off (Test settings), so nothing can be
            sent. Report bug downloads the game file for you to send to Paul
            instead.
          </p>
        ) : blocked ? (
          <p data-testid="good-bot-sharing-off">
            Sharing finished games is off (Test settings), so nothing can be
            sent.
          </p>
        ) : (
          <>
            <label className={styles.reportField}>
              Your name
              <input
                ref={(el) => {
                  if (!savedName) first.current = el;
                }}
                type="text"
                data-testid="report-name"
                placeholder="Dr. Serizawa? Put your name here"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className={styles.reportField}>
              {copy.label}
              <textarea
                ref={(el) => {
                  if (savedName) first.current = el;
                }}
                data-testid="report-text"
                rows={5}
                maxLength={MAX_REPORT_LENGTH}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <span className={styles.muted}>
                {text.length} / {MAX_REPORT_LENGTH}
              </span>
            </label>
          </>
        )}
        <div className={styles.modalButtons}>
          {blocked ? (
            kind === "badBot" && (
              <button
                type="button"
                className={styles.button}
                data-testid="bad-bot-report-bug"
                onClick={onReportBug}
              >
                Report bug instead
              </button>
            )
          ) : (
            <button
              type="submit"
              className={styles.button}
              data-testid="report-submit"
              disabled={!ready}
            >
              {sharingOff ? "Download" : copy.submit}
            </button>
          )}
          <button
            type="button"
            className={styles.choiceButton}
            data-testid="report-cancel"
            onClick={onCancel}
          >
            Cancel [Esc]
          </button>
        </div>
      </form>
    </div>
  );
}

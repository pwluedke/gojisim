import { useEffect, useState } from "react";
import styles from "./WhatsNew.module.css";
import {
  latestTag,
  readSeen,
  RELEASES_URL,
  showDot,
  writeSeen,
} from "./releaseLink";

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/**
 * The "What's new" link (#134), on the menu and in `/play`'s Settings: it opens the latest release
 * in a new tab, and shows a "New" dot until this browser opens a release with a newer tag.
 */
export function WhatsNew({ className }: { className?: string | undefined }) {
  const [latest, setLatest] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readSeen(storage()),
  );
  useEffect(() => {
    let live = true;
    void latestTag().then((tag) => {
      if (live) setLatest(tag);
    });
    return () => {
      live = false;
    };
  }, []);
  const dot = showDot(latest, seen);
  return (
    <a
      className={className}
      href={RELEASES_URL}
      target="_blank"
      rel="noreferrer"
      data-testid="whats-new"
      onClick={() => {
        if (latest === null) return;
        writeSeen(storage(), latest);
        setSeen(latest);
      }}
    >
      What's new
      {dot && (
        <span
          className={styles.dot}
          data-testid="whats-new-dot"
          title="A release you haven't opened yet"
        >
          New
        </span>
      )}
    </a>
  );
}

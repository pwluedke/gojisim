import type { NamedDeck } from "@gojisim/cards/deck-lists";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  backupJson,
  deckOf,
  readBackup,
  savedDeck,
  type SavedDeck,
} from "../game/deckStore";
import { checkDeck, deckOptions } from "../game/decks";
import { deckName } from "../game/importDeck";
import { downloadText } from "../game/session";
import type { useMyDecks } from "../game/useMyDecks";
import { copyName } from "./deckDraft";
import { foldersOf } from "./deckFolders";
import styles from "./DecksWindow.module.css";

/**
 * My decks (#157, #158, #161; #181 redesign, Paul's layout 1): a search and Import, the decks
 * grouped by folder under collapsible headers (the row shows the name after the folder), each
 * row with Legal / Not legal, a small Load and a ⋯ menu (Duplicate, Rename, Copy deck list,
 * Export, Delete), and Export all / Import backup at the foot.
 */
export function DecksWindow({
  my,
  onClose,
  onLoad,
  onImport,
}: {
  my: ReturnType<typeof useMyDecks>;
  onClose: () => void;
  /** #158: open a deck in the builder (a starter has no id: saving makes it yours). */
  onLoad: (deck: NamedDeck, id: string | null) => void;
  /** Opens the Import modal. */
  onImport: () => void;
}) {
  const starters = useMemo(
    () => deckOptions([]).filter((o) => o.kind === "official"),
    [],
  );
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [note, setNote] = useState<string | null>(null);
  const backup = useRef<HTMLInputElement>(null);
  const folders = useMemo(() => foldersOf(my.decks, query), [my.decks, query]);
  const searching = query.trim() !== "";
  const toggle = (folder: string) =>
    setClosed((c) => {
      const next = new Set(c);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });

  const load = (d: SavedDeck) => {
    const deck = deckOf(d);
    if (deck) onLoad(deck, d.id);
    else setNote(`${d.name} no longer reads cleanly; fix it with Import.`);
  };
  const duplicate = (d: SavedDeck) => {
    const deck = deckOf(d);
    if (!deck) return;
    const name = copyName(
      d.name,
      my.decks.map((x) => x.name),
    );
    my.add(savedDeck({ ...deck, name }, name));
    setNote(`Duplicated as ${name}.`);
  };
  const copy = async (d: SavedDeck) => {
    try {
      await navigator.clipboard.writeText(d.list);
      setNote(`Copied ${d.name} as plain text.`);
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
      <section className={styles.window}>
        <header className={styles.head}>
          <h2>My decks</h2>
          <span className={styles.count} data-testid="db-decks-count">
            {my.decks.length} {my.decks.length === 1 ? "deck" : "decks"}
          </span>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.close}
            data-testid="db-decks-close"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className={styles.searchRow}>
          <label className={styles.search}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              type="search"
              data-testid="db-decks-search"
              aria-label="Search my decks"
              placeholder="Search decks or folders"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            data-testid="db-decks-import"
            onClick={onImport}
          >
            Import
          </button>
        </div>
        {!my.persistent && (
          <p className={styles.notice} data-testid="decks-session-only">
            This browser isn't saving decks (storage is off), so they last for
            this visit only.
          </p>
        )}
        <div className={styles.list}>
          {!searching && (
            <FolderGroup
              name="Starter decks"
              count={starters.length}
              open={!closed.has("Starter decks")}
              onToggle={() => toggle("Starter decks")}
            >
              {starters.map((s) => (
                <li key={s.key} className={styles.row} data-testid="db-starter">
                  <span className={styles.name}>{s.label}</span>
                  <span className={styles.legal} data-legal="true">
                    Legal
                  </span>
                  <button
                    type="button"
                    data-testid="db-load"
                    data-primary
                    data-small
                    onClick={() =>
                      onLoad({ ...s.build(0), name: s.label }, null)
                    }
                  >
                    Load
                  </button>
                  <span className={styles.menuSpace} />
                </li>
              ))}
            </FolderGroup>
          )}
          {my.decks.length === 0 && (
            <p className={styles.empty}>
              No saved decks yet. Import one, or build one here.
            </p>
          )}
          {my.decks.length > 0 && folders.length === 0 && (
            <p className={styles.empty} data-testid="db-decks-none">
              No decks match “{query.trim()}”.
            </p>
          )}
          {folders.map((f) => (
            <FolderGroup
              key={f.name}
              name={f.name}
              count={f.decks.length}
              // A search opens every folder with a match.
              open={searching || !closed.has(f.name)}
              onToggle={() => toggle(f.name)}
            >
              {f.decks.map((d) => {
                const deck = deckOf(d);
                const legal = deck ? checkDeck(deck).legal : false;
                return (
                  <li
                    key={d.id}
                    className={styles.row}
                    data-testid="db-deck"
                    data-deck-name={d.name}
                  >
                    {renaming?.id === d.id ? (
                      <span className={styles.rename}>
                        <input
                          data-testid="rename-input"
                          aria-label={`New name for ${d.name}`}
                          value={renaming.name}
                          autoFocus
                          onChange={(e) =>
                            setRenaming({ id: d.id, name: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          data-testid="rename-save"
                          data-small
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
                      <span
                        className={styles.name}
                        data-testid="db-deck-name"
                        title={d.name}
                      >
                        {deckName(d.name)}
                      </span>
                    )}
                    {deleting === d.id ? (
                      <span className={styles.confirm}>
                        <button
                          type="button"
                          data-testid="db-delete-confirm"
                          data-danger
                          data-small
                          onClick={() => {
                            my.remove(d.id);
                            setDeleting(null);
                          }}
                        >
                          Delete {deckName(d.name)}
                        </button>
                        <button
                          type="button"
                          data-small
                          onClick={() => setDeleting(null)}
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <>
                        <span
                          className={styles.legal}
                          data-legal={legal ? "true" : "false"}
                        >
                          {legal ? "Legal" : "Not legal"}
                        </span>
                        <button
                          type="button"
                          data-testid="db-load"
                          data-primary
                          data-small
                          onClick={() => load(d)}
                        >
                          Load
                        </button>
                        <DeckMenu
                          name={deckName(d.name)}
                          open={menu === d.id}
                          onOpen={(open) => setMenu(open ? d.id : null)}
                          items={[
                            {
                              id: "db-duplicate",
                              label: "Duplicate",
                              run: () => duplicate(d),
                            },
                            {
                              id: "rename-deck",
                              label: "Rename",
                              run: () =>
                                setRenaming({ id: d.id, name: d.name }),
                            },
                            {
                              id: "copy-deck",
                              label: "Copy deck list",
                              run: () => void copy(d),
                            },
                            {
                              id: "db-export-deck",
                              label: "Export",
                              run: () =>
                                downloadText(
                                  d.list,
                                  `${deckName(d.name) || "deck"}.txt`,
                                ),
                            },
                            {
                              id: "db-delete",
                              label: "Delete",
                              danger: true,
                              run: () => setDeleting(d.id),
                            },
                          ]}
                        />
                      </>
                    )}
                  </li>
                );
              })}
            </FolderGroup>
          ))}
        </div>
        {note && (
          <p className={styles.notice} data-testid="db-decks-note">
            {note}
          </p>
        )}
        <footer className={styles.foot}>
          <button
            type="button"
            data-testid="db-export-all"
            data-small
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
            data-small
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
        </footer>
      </section>
    </div>
  );
}

/** A folder's collapsible header with its count, and its decks. */
function FolderGroup({
  name,
  count,
  open,
  onToggle,
  children,
}: {
  name: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.folder} data-testid="db-folder" data-folder={name}>
      <button
        type="button"
        className={styles.folderHead}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={styles.chevron} aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className={styles.folderName}>{name}</span>
        <span className={styles.folderCount}>{count}</span>
      </button>
      {open && <ul className={styles.rows}>{children}</ul>}
    </div>
  );
}

interface MenuItem {
  id: string;
  label: string;
  danger?: boolean;
  run: () => void;
}

/**
 * A row's ⋯ menu (#181): Esc and a click outside close it, the arrow keys move between its
 * items, and choosing one closes it.
 */
function DeckMenu({
  name,
  open,
  onOpen,
  items,
}: {
  name: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  items: MenuItem[];
}) {
  const box = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open, onOpen]);
  const move = (step: number) => {
    const buttons = [
      ...(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };
  return (
    <span className={styles.menuBox} ref={box}>
      <button
        ref={trigger}
        type="button"
        className={styles.menuButton}
        data-testid="db-deck-menu"
        data-small
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <div
          ref={list}
          className={styles.menu}
          role="menu"
          aria-label={`${name} actions`}
          data-testid="db-deck-menu-list"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onOpen(false);
              trigger.current?.focus();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            } else if (e.key === "Tab") onOpen(false);
          }}
        >
          {items.map((item) => (
            <div key={item.id}>
              {item.danger && (
                <div className={styles.divider} role="separator" />
              )}
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                data-testid={item.id}
                data-danger={item.danger ? "" : undefined}
                onClick={() => {
                  onOpen(false);
                  item.run();
                }}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

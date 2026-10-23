import { PRESETS } from "@gojisim/bot";
import type { MatchMode } from "@gojisim/engine";
import { useState } from "react";
import { difficultyName, type SeatConfig } from "../game/bots";
import {
  checkDeck,
  type DeckOption,
  deckOptions,
  loadImportedDecks,
} from "../game/decks";
import { PLAYER_IDS, type PlayerId, randomSeed } from "../game/session";
import styles from "./NewGame.module.css";

export type Mode = "bot" | "hotseat";

/** The seats each menu entry presets (M5a): Play vs bot is P1 Human vs P2 Bot Medium. */
export function presetSeats(mode: Mode): Record<PlayerId, SeatConfig> {
  return mode === "bot"
    ? { P1: { kind: "human" }, P2: { kind: "bot", difficulty: PRESETS.medium } }
    : { P1: { kind: "human" }, P2: { kind: "human" } };
}

function Legality({ option }: { option: DeckOption }) {
  try {
    const validation = checkDeck(option.build(0));
    return validation.legal ? (
      <span className={styles.legal} data-testid="legality">
        Legal
      </span>
    ) : (
      <span className={styles.illegal} data-testid="legality">
        Illegal: {validation.failures.map((f) => f.rule).join(", ")}
      </span>
    );
  } catch (err) {
    return <span className={styles.illegal}>{String(err)}</span>;
  }
}

/**
 * The `/play` new-game screen (M5a): a deck for each seat (the official starters, random test
 * decks, and decks imported in `/debug`, with a legality badge), Human or Bot per seat, and the
 * difficulty slider with its presets. M5e: Casual (undo allowed) or Tournament (no undo), stored
 * in the game record.
 */
export function NewGame({
  mode,
  onStart,
  onLoad,
}: {
  mode: Mode;
  /** Loads an exported game record (M5c); returns an error message, or `null`. */
  onLoad: (file: File) => Promise<string | null>;
  onStart: (
    seed: number,
    picked: [DeckOption, DeckOption],
    seats: Record<PlayerId, SeatConfig>,
    matchMode: MatchMode,
  ) => void;
}) {
  const options = deckOptions(loadImportedDecks());
  const [keys, setKeys] = useState<Record<PlayerId, string>>({
    P1: "official:ESD01",
    P2: "official:ESD02",
  });
  const [seats, setSeats] = useState(() => presetSeats(mode));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => String(randomSeed()));
  const [matchMode, setMatchMode] = useState<MatchMode>("casual");
  const byKey = (key: string) =>
    options.find((o) => o.key === key) ?? (options[0] as DeckOption);
  return (
    <form
      className={styles.screen}
      onSubmit={(e) => {
        e.preventDefault();
        onStart(
          Number(seed),
          [byKey(keys.P1), byKey(keys.P2)],
          seats,
          matchMode,
        );
      }}
    >
      <h1 className={styles.title}>
        {mode === "bot" ? "Play vs bot" : "Hotseat"}
      </h1>
      <div className={styles.seats}>
        {PLAYER_IDS.map((id) => {
          const seat = seats[id];
          return (
            <div
              key={id}
              className={styles.seat}
              data-testid={`seat-panel-${id}`}
            >
              <strong>{id}</strong>
              <div className={styles.row}>
                <label>
                  Deck{" "}
                  <select
                    data-testid={`deck-${id}`}
                    value={keys[id]}
                    onChange={(e) =>
                      setKeys((k) => ({ ...k, [id]: e.target.value }))
                    }
                  >
                    {options.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>{" "}
                <Legality option={byKey(keys[id])} />
              </div>
              <div className={styles.row}>
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
              </div>
              {seat.kind === "bot" && (
                <div className={styles.row}>
                  <input
                    type="range"
                    min={0}
                    max={100}
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
                  />{" "}
                  <span data-testid={`difficulty-value-${id}`}>
                    {seat.difficulty} ({difficultyName(seat.difficulty)})
                  </span>
                  <div>
                    {(Object.entries(PRESETS) as [string, number][]).map(
                      ([name, level]) => (
                        <button
                          key={name}
                          type="button"
                          className={styles.preset}
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
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.row}>
        <label>
          Seed{" "}
          <input
            data-testid="seed-input"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
      </div>
      <div className={styles.row} role="radiogroup" aria-label="Match type">
        {(
          [
            ["casual", "Casual", "undo allowed"],
            ["tournament", "Tournament", "no undo"],
          ] as const
        ).map(([value, label, note]) => (
          <label key={value}>
            <input
              type="radio"
              name="match-mode"
              data-testid={`match-mode-${value}`}
              checked={matchMode === value}
              onChange={() => setMatchMode(value)}
            />{" "}
            {label} <span className={styles.note}>({note})</span>
          </label>
        ))}
      </div>
      <button type="submit" className={styles.start} data-testid="start-game">
        Start
      </button>
      <div>
        <label>
          Or load a game record{" "}
          <input
            type="file"
            accept="application/json,.json"
            data-testid="load-record"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setLoadError(await onLoad(file));
            }}
          />
        </label>
        {loadError && (
          <div className={styles.illegal} data-testid="load-error">
            {loadError}
          </div>
        )}
      </div>
    </form>
  );
}

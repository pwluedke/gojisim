import { PRESETS } from "@gojisim/bot";
import type { MatchMode } from "@gojisim/engine";
import { useMemo, useRef, useState } from "react";
import { difficultyName, type SeatConfig } from "../game/bots";
import {
  type DeckOption,
  optionLegality,
  pickerGroups,
  playDeckOptions,
  randomDeckKey,
  STARTER_PICKS,
  badgeReasons,
  deckReasons,
  tournamentProblems,
} from "../game/decks";
import { deckOf } from "../game/deckStore";
import { PLAYER_IDS, type PlayerId, randomSeed } from "../game/session";
import { useMyDecks } from "../game/useMyDecks";
import styles from "./NewGame.module.css";
import { Tooltip } from "./Tooltip";

/**
 * The preset seats (M5a): P1 Human vs P2 Bot Medium. `/play` is human vs bot (M5h removed
 * hotseat): only P1 can be human, and P1 can be a bot too, to watch two bots play.
 */
export function presetSeats(): Record<PlayerId, SeatConfig> {
  return {
    P1: { kind: "human" },
    P2: { kind: "bot", difficulty: PRESETS.medium },
  };
}

/** Deck names in the picker are cut to this many characters plus "…" (M5h overflow fix). */
const LABEL_MAX = 40;

export const shortLabel = (label: string) =>
  label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX).trimEnd()}…` : label;

/** An illegal deck's badge (M13b): up to 3 plain reasons and "+N more"; the tooltip has them all. */
function LegalityWarning({ reasons }: { reasons: string[] }) {
  const { shown, more } = badgeReasons(reasons);
  return (
    <span
      className={styles.warning}
      data-testid="legality"
      title={reasons.join("\n")}
    >
      Warnings: {shown.join("; ")}
      {more > 0 && ` +${more} more`}
    </span>
  );
}

function Legality({
  legality,
}: {
  legality: ReturnType<typeof optionLegality>;
}) {
  if ("error" in legality)
    return <span className={styles.illegal}>{legality.error}</span>;
  // Legality problems are warnings in Casual: an illegal deck still plays (Paul's ruling, Oct 21,
  // 2026). Tournament games don't offer it.
  return legality.legal ? (
    <span className={styles.legal} data-testid="legality">
      Legal
    </span>
  ) : (
    <LegalityWarning reasons={deckReasons(legality)} />
  );
}

/**
 * The `/play` new-game screen (M5a): a deck for each seat (#161: the Starter decks, then My decks,
 * each with a legality badge), Human or Bot per seat, and the
 * difficulty slider with its presets. M5e: Casual (undo allowed) or Tournament (no undo), stored
 * in the game record. Tournament games take legal decks only: an illegal deck can't be picked, and
 * the seat says why. Casual games play it with a warning on the board.
 *
 * The whole screen fits at 1280×800 with no page scroll (Monarch, Oct 26, 2026): compact 36 px
 * controls, the seats side by side, a link to the Deckbuilder, and the game options in one block at
 * the bottom. Each seat's Randomize picks from the Starter decks and My decks; switching the match type
 * resets both seats to the starters.
 */
export function NewGame({
  onStart,
  onLoad,
  skipFirstPick,
  onSkipFirstPick,
}: {
  /** The saved "Skip First / Second pick" setting, and its change. */
  skipFirstPick: boolean;
  onSkipFirstPick: (skip: boolean) => void;
  /** Loads an exported game record (M5c); returns an error message, or `null`. */
  onLoad: (file: File) => Promise<string | null>;
  onStart: (
    seed: number,
    picked: [DeckOption, DeckOption],
    seats: Record<PlayerId, SeatConfig>,
    matchMode: MatchMode,
  ) => void;
}) {
  // #161: the starters, then My decks (synced when signed in); nothing else.
  const my = useMyDecks();
  const options = useMemo(() => {
    const mine = my.decks.flatMap((saved) => {
      const deck = deckOf(saved);
      return deck ? [{ id: saved.id, name: saved.name, deck }] : [];
    });
    return playDeckOptions(mine);
  }, [my.decks]);
  const [keys, setKeys] = useState<Record<PlayerId, string>>({
    ...STARTER_PICKS,
  });
  const [seats, setSeats] = useState(presetSeats);
  const [loadError, setLoadError] = useState<string | null>(null);
  const recordInput = useRef<HTMLInputElement>(null);
  const [recordName, setRecordName] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => String(randomSeed()));
  const [matchMode, setMatchMode] = useState<MatchMode>("casual");
  const byKey = (key: string) =>
    options.find((o) => o.key === key) ?? (options[0] as DeckOption);
  const tournament = matchMode === "tournament";
  // Random test decks depend on the seed: check the deck the game would get.
  const legality = useMemo(
    () =>
      new Map(
        options.map((o) => [o.key, optionLegality(o, Number(seed) || 0)]),
      ),
    [options, seed],
  );
  const problemsOf = (key: string) =>
    tournamentProblems(
      legality.get(byKey(key).key) as ReturnType<typeof optionLegality>,
    );
  const blocked = tournament
    ? PLAYER_IDS.filter((id) => problemsOf(keys[id]).length > 0)
    : [];
  // Randomize draws from the Starter decks and My decks, legal decks only in a Tournament game.
  const randomCandidates = pickerGroups(options)
    .flatMap((group) => group.options)
    .filter((o) => !tournament || problemsOf(o.key).length === 0)
    .map((o) => o.key);
  const randomize = (id: PlayerId) => {
    const key = randomDeckKey(randomCandidates, keys[id]);
    if (key) setKeys((k) => ({ ...k, [id]: key }));
  };
  return (
    <form
      className={styles.screen}
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked.length > 0) return;
        onStart(
          Number(seed),
          [byKey(keys.P1), byKey(keys.P2)],
          seats,
          matchMode,
        );
      }}
    >
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Play vs bot</h1>
      </div>
      <div className={styles.seats}>
        {PLAYER_IDS.map((id) => {
          const seat = seats[id];
          return (
            <div
              key={id}
              className={styles.seat}
              data-testid={`seat-panel-${id}`}
            >
              <div className={styles.seatHead}>
                <strong>{id}</strong>
                <Legality
                  legality={
                    legality.get(byKey(keys[id]).key) as ReturnType<
                      typeof optionLegality
                    >
                  }
                />
                <span className={styles.seatKind}>
                  {id === "P1" ? (
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
                  ) : (
                    // The other seat is always a bot (M5h: no hotseat until M9's online play).
                    <span data-testid={`seat-${id}`} data-seat="bot">
                      Seat: Bot
                    </span>
                  )}
                </span>
              </div>
              <div className={styles.line}>
                <label className={styles.grow}>
                  <span className={styles.srOnly}>{id} deck</span>
                  <select
                    data-testid={`deck-${id}`}
                    value={keys[id]}
                    onChange={(e) =>
                      setKeys((k) => ({ ...k, [id]: e.target.value }))
                    }
                  >
                    {pickerGroups(options).map(
                      ({ label: group, options: inGroup }) => (
                        <optgroup key={group} label={group}>
                          {inGroup.map((o) => {
                            const illegal =
                              tournament && problemsOf(o.key).length > 0;
                            return (
                              <option
                                key={o.key}
                                value={o.key}
                                disabled={illegal}
                                title={o.label}
                              >
                                {shortLabel(o.label)}
                                {illegal ? " (illegal)" : ""}
                              </option>
                            );
                          })}
                        </optgroup>
                      ),
                    )}
                  </select>
                </label>
                {randomCandidates.length > 0 ? (
                  <button
                    type="button"
                    data-control
                    data-testid={`randomize-${id}`}
                    onClick={() => randomize(id)}
                  >
                    Randomize
                  </button>
                ) : (
                  // Only a Tournament game can leave nothing to pick (the starters are legal).
                  <Tooltip
                    tip="No legal deck in this list for a Tournament game"
                    testId={`randomize-tip-${id}`}
                    className={styles.disabledTip}
                  >
                    <button
                      type="button"
                      data-control
                      data-testid={`randomize-${id}`}
                      disabled
                    >
                      Randomize
                    </button>
                  </Tooltip>
                )}
              </div>
              {byKey(keys[id]).label.length > LABEL_MAX && (
                <div
                  className={styles.deckName}
                  data-testid={`deck-name-${id}`}
                >
                  {byKey(keys[id]).label}
                </div>
              )}
              {blocked.includes(id) && (
                <div
                  className={styles.illegal}
                  data-testid={`tournament-blocked-${id}`}
                >
                  Not allowed in a Tournament game:
                  <ul className={styles.problems}>
                    {problemsOf(keys[id]).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {seat.kind === "bot" && (
                <div className={styles.line}>
                  <span>Bot level</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    aria-label={`${id} bot level`}
                    className={styles.level}
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
                  />
                  <span data-testid={`difficulty-value-${id}`}>
                    {seat.difficulty} ({difficultyName(seat.difficulty)})
                  </span>
                  <span className={styles.presets}>
                    {(Object.entries(PRESETS) as [string, number][]).map(
                      ([name, level]) => (
                        <button
                          key={name}
                          type="button"
                          data-control
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
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* #161: decks are built, imported and backed up in the Deckbuilder. */}
      <p className={styles.buildLink}>
        <a href="/decks" data-testid="build-decks">
          Build or import decks
        </a>
        {my.decks.length === 0
          ? " to play your own here."
          : ` (${my.decks.length} in My decks)`}
      </p>
      <div className={styles.options} data-testid="game-options">
        <div className={styles.line}>
          <label>
            Seed{" "}
            <input
              className={styles.seed}
              data-testid="seed-input"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
          <span
            className={styles.modes}
            role="radiogroup"
            aria-label="Match type"
          >
            {(
              [
                ["casual", "Casual", "undo allowed"],
                ["tournament", "Tournament", "no undo, legal decks only"],
              ] as const
            ).map(([value, label, note]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="match-mode"
                  data-testid={`match-mode-${value}`}
                  checked={matchMode === value}
                  onChange={() => {
                    setMatchMode(value);
                    // Every switch starts both seats over on the starters (Monarch, Oct 26, 2026;
                    // replaces decision 347's "doesn't change by itself").
                    setKeys({ ...STARTER_PICKS });
                  }}
                />{" "}
                {label} <span className={styles.note}>({note})</span>
              </label>
            ))}
          </span>
        </div>
        <div className={styles.line}>
          {/* Off by default; with it on, the 6.3.1.4 RNG draw picks the first player (decision 246). */}
          <label>
            <input
              type="checkbox"
              data-testid="skip-first-pick"
              checked={skipFirstPick}
              onChange={(e) => onSkipFirstPick(e.target.checked)}
            />{" "}
            Skip First / Second pick{" "}
            <span className={styles.note}>(random first player)</span>
          </label>
        </div>
        <div className={styles.line}>
          <button
            type="submit"
            className={styles.start}
            data-primary
            data-testid="start-game"
            disabled={blocked.length > 0}
          >
            Start
          </button>
          {/* A button like Import backup's; the file's name shows only once one is picked. */}
          <button
            type="button"
            data-control
            data-testid="load-record-button"
            onClick={() => recordInput.current?.click()}
          >
            Load a game record
          </button>
          <input
            ref={recordInput}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="load-record"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setRecordName(file.name);
              setLoadError(await onLoad(file));
            }}
          />
          {recordName && (
            <span className={styles.note} data-testid="load-record-name">
              {recordName}
            </span>
          )}
        </div>
        {blocked.length > 0 && (
          <div className={styles.illegal} data-testid="start-blocked">
            Tournament games need legal decks: pick another deck for{" "}
            {blocked.join(" and ")}, or play Casual.
          </div>
        )}
        {loadError && (
          <div className={styles.illegal} data-testid="load-error">
            {loadError}
          </div>
        )}
      </div>
    </form>
  );
}

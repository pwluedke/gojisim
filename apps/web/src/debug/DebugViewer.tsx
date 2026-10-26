import { type Card, type DeckValidation, failedRules } from "@gojisim/cards";
import {
  type DeckListError,
  formatDeckList,
  type NamedDeck,
  parseDeckList,
} from "@gojisim/cards/deck-lists";
import {
  type CardInstance,
  type GameRecord,
  buildLoopReport,
} from "@gojisim/engine";
import { PRESETS } from "@gojisim/bot";
import { useMemo, useRef, useState } from "react";
import { difficultyName, displayState, type SeatConfig } from "../game/bots";
import {
  downloadJson,
  downloadRecord,
  downloadText,
  newSession,
  PLAYER_IDS,
  type PlayerId,
  randomSeed,
} from "../game/session";
import { useGameSession } from "../game/useGameSession";
import { CARD_DETAIL_WIDTH, CardDetail, Field, PlayerAreas } from "./Board";
import {
  checkDeck,
  type DeckOption,
  deckOptions,
  loadImportedDecks,
  pickerGroups,
  replaceByName,
  saveImportedDecks,
} from "../game/decks";
import { localDecks } from "../game/localDecks";
import { ManualPanel } from "./ManualPanel";
import { ActionPanel, LogPanel, StatusBar } from "./Panels";

/** Human or Bot, and for a bot the difficulty slider with its presets (M6d). */
function SeatPicker({
  id,
  seat,
  onChange,
}: {
  id: PlayerId;
  seat: SeatConfig;
  onChange: (seat: SeatConfig) => void;
}) {
  return (
    <div style={{ marginTop: 4 }}>
      <label>
        Seat{" "}
        <select
          data-testid={`seat-${id}`}
          value={seat.kind}
          onChange={(e) =>
            onChange(
              e.target.value === "bot"
                ? { kind: "bot", difficulty: PRESETS.medium }
                : { kind: "human" },
            )
          }
        >
          <option value="human">Human</option>
          <option value="bot">Bot</option>
        </select>
      </label>
      {seat.kind === "bot" && (
        <div>
          <input
            type="range"
            min={0}
            max={100}
            data-testid={`difficulty-${id}`}
            value={seat.difficulty}
            onChange={(e) =>
              onChange({ kind: "bot", difficulty: Number(e.target.value) })
            }
          />{" "}
          <span data-testid={`difficulty-value-${id}`}>
            {seat.difficulty} ({difficultyName(seat.difficulty)})
          </span>{" "}
          {(Object.entries(PRESETS) as [string, number][]).map(
            ([name, level]) => (
              <button
                key={name}
                type="button"
                data-testid={`preset-${id}-${name}`}
                onClick={() => onChange({ kind: "bot", difficulty: level })}
              >
                {difficultyName(level)}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function LegalityNote({ option, seed }: { option: DeckOption; seed: number }) {
  let validation: DeckValidation;
  try {
    validation = checkDeck(option.build(seed));
  } catch (err) {
    return <div style={{ color: "var(--color-illegal)" }}>{String(err)}</div>;
  }
  return (
    <div
      data-testid="deck-legality"
      style={{
        color: validation.legal ? "var(--color-legal)" : "var(--color-illegal)",
        fontSize: 12,
      }}
    >
      {validation.legal
        ? "Legal"
        : `Illegal: ${validation.failures.map((f) => `${f.rule} (${f.message})`).join("; ")}`}
    </div>
  );
}

function NewGameForm({
  onStart,
}: {
  onStart: (
    seed: number,
    picked: [DeckOption, DeckOption],
    seats: Record<PlayerId, SeatConfig>,
  ) => void;
}) {
  const [seed, setSeed] = useState("20261021");
  const [seats, setSeats] = useState<Record<PlayerId, SeatConfig>>({
    P1: { kind: "human" },
    P2: { kind: "human" },
  });
  const [imported, setImported] = useState<NamedDeck[]>(() =>
    loadImportedDecks(),
  );
  const options = useMemo(() => deckOptions(imported), [imported]);
  // Type-to-filter for the development groups (Monarch, Oct 25, 2026).
  const [filter, setFilter] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [keys, setKeys] = useState<[string, string]>([
    "official:ESD01",
    "official:ESD02",
  ]);
  const [error, setError] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<DeckListError[]>([]);
  const byKey = (key: string) =>
    options.find((o) => o.key === key) ?? (options[0] as DeckOption);
  const picked: [DeckOption, DeckOption] = [byKey(keys[0]), byKey(keys[1])];
  const legalityLabel = (option: DeckOption) => {
    if (option.kind !== "imported" && option.kind !== "file")
      return option.label;
    const validation = checkDeck(option.build(0));
    return `${option.label} ${validation.legal ? "✓ legal" : `✗ ${failedRules(validation).join(", ")}`}`;
  };

  const importDeckList = async (file: File) => {
    const { decks, errors } = parseDeckList(await file.text());
    // A deck with a stored deck's name replaces it, so a second import doesn't double the list.
    const next = replaceByName(imported, decks);
    setImported(next);
    saveImportedDecks(next);
    setImportErrors(errors);
  };

  const clearImported = () => {
    setImported([]);
    saveImportedDecks([]);
    setConfirmClear(false);
    // A pick that was an import goes back to the starters.
    setKeys(([a, b]) => [
      a.startsWith("imported:") ? "official:ESD01" : a,
      b.startsWith("imported:") ? "official:ESD02" : b,
    ]);
  };

  const exportDeckList = () => {
    const seedNumber = Number(seed);
    const decks = picked.map((o) => o.build(seedNumber));
    const unique = decks.filter(
      (d, i) => decks.findIndex((x) => x.name === d.name) === i,
    );
    downloadText(formatDeckList(unique), "gojisim-decks.txt");
  };

  return (
    <form
      style={{
        border: "1px solid var(--color-border-strong)",
        padding: 8,
        margin: 4,
      }}
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onStart(Number(seed), picked, seats);
        } catch (err) {
          setError(String(err));
        }
      }}
    >
      <label>
        Seed{" "}
        <input
          data-testid="seed-input"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
        />
      </label>{" "}
      <button type="button" onClick={() => setSeed(String(randomSeed()))}>
        Random
      </button>{" "}
      <button type="submit" data-testid="start-game">
        Start
      </button>
      <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
        {PLAYER_IDS.map((id, i) => (
          <div key={id}>
            <label>
              {id} deck{" "}
              <select
                data-testid={`deck-${id}`}
                value={keys[i]}
                onChange={(e) =>
                  setKeys((k) =>
                    i === 0 ? [e.target.value, k[1]] : [k[0], e.target.value],
                  )
                }
              >
                {pickerGroups(options, filter, [keys[i] as string]).map(
                  (group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {legalityLabel(option)}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
            </label>
            <LegalityNote
              option={picked[i] as DeckOption}
              seed={Number(seed)}
            />
            <SeatPicker
              id={id}
              seat={seats[id]}
              onChange={(seat) => setSeats((s) => ({ ...s, [id]: seat }))}
            />
          </div>
        ))}
      </div>
      {options.some((o) => o.kind === "file" || o.kind === "imported") && (
        <label style={{ display: "block", marginTop: 6 }}>
          Find a development deck{" "}
          <input
            type="search"
            data-testid="dev-deck-filter"
            placeholder="Name, file or folder"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              // Enter filters; it never starts the game from here.
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </label>
      )}
      <LocalDeckFiles />
      <div style={{ marginTop: 6 }}>
        <label>
          Import deck list (.txt){" "}
          <input
            type="file"
            accept=".txt,text/plain"
            data-testid="import-deck-list"
            onChange={(e) =>
              e.target.files?.[0] && void importDeckList(e.target.files[0])
            }
          />
        </label>{" "}
        <button
          type="button"
          data-testid="export-deck-list"
          onClick={exportDeckList}
        >
          Export deck list
        </button>{" "}
        {imported.length > 0 &&
          (confirmClear ? (
            <span data-testid="clear-imported-confirm">
              Clear {imported.length} imported deck
              {imported.length === 1 ? "" : "s"} from this browser?{" "}
              <button
                type="button"
                data-testid="clear-imported-yes"
                onClick={clearImported}
              >
                Clear
              </button>{" "}
              <button type="button" onClick={() => setConfirmClear(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              data-testid="clear-imported-decks"
              onClick={() => setConfirmClear(true)}
            >
              Clear imported decks
            </button>
          ))}
        {importErrors.length > 0 && (
          <ul
            data-testid="deck-list-errors"
            style={{ color: "var(--color-illegal)", fontSize: 12 }}
          >
            {importErrors.map((e) => (
              <li key={e.line}>
                Line {e.line}: {e.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <div style={{ color: "var(--color-illegal)" }}>{error}</div>}
    </form>
  );
}

/**
 * The development deck files (`local-decks/*.txt`, dev server only): how many decks each gave,
 * and each file's parse errors once, with their lines. Nothing shows without the folder.
 */
function LocalDeckFiles() {
  const { counts, errors, parseMs } = localDecks();
  if (counts.length === 0) return null;
  return (
    <div data-testid="local-deck-files" style={{ fontSize: 12, marginTop: 4 }}>
      Development deck files (local-decks, read in {Math.round(parseMs)} ms):{" "}
      {counts.map((c) => `${c.file} (${c.decks})`).join(", ")}
      {errors.map(({ file, errors: list }) => (
        <ul
          key={file}
          data-testid="local-deck-errors"
          data-file={file}
          style={{ color: "var(--color-illegal)", margin: "2px 0" }}
        >
          {list.map((e) => (
            <li key={e.line}>
              {file} line {e.line}: {e.reason}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

/** Warning shown during a game that uses an illegal deck (Paul's ruling, Oct 21, 2026). */
function IllegalDeckBanner({ record }: { record: GameRecord }) {
  const problems = record.decks
    .map((deck) => ({
      player: deck.id,
      validation: checkDeck({ name: deck.id, ...deck }),
    }))
    .filter((p) => !p.validation.legal);
  if (problems.length === 0) return null;
  return (
    <div
      data-testid="illegal-deck-banner"
      style={{ background: "var(--color-alert-bg)", padding: 6, margin: 4 }}
    >
      <strong>Warning: playing with an illegal deck (allowed).</strong>
      {problems.map((p) => (
        <div key={p.player}>
          {p.player}:{" "}
          {p.validation.failures
            .map((f) => `${f.rule} (${f.message})`)
            .join("; ")}
        </div>
      ))}
    </div>
  );
}

/**
 * Debug viewer: every legal action as a button, both players' hidden information visible unless
 * a bot seat's game hides it. Bot seats think in a Web Worker (M6d).
 */
export function DebugViewer() {
  const [selected, setSelected] = useState<Card | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [hideHidden, setHideHidden] = useState(true);
  const [spectatorView, setSpectatorView] = useState(false);
  const hideRef = useRef(hideHidden);
  hideRef.current = hideHidden;
  const game = useGameSession({
    privateLabels: () => hideRef.current,
    // Human vs bot hides the bot's cards; other games show everything.
    onStart: (next) =>
      setHideHidden(
        PLAYER_IDS.filter((id) => next.seats[id].kind === "bot").length === 1,
      ),
  });
  const {
    session,
    setSession,
    state,
    decider,
    botToMove,
    botSeats,
    humanSeats,
    startSession,
    takeAction,
    playing,
    setPlaying,
    stepping,
    setStepping,
    delay,
    setDelay,
    thinking,
    now,
    botMs,
    botError,
  } = game;

  const importRecord = async (file: File) =>
    setImportError(await game.importRecord(file));

  const select = (card: CardInstance) => {
    const data = state?.cards[card.cardId];
    if (data) setSelected(data);
  };

  // What the board shows: everything (debug), one human's view against a bot, or a spectator's.
  const oneHumanVsBot = humanSeats.length === 1 && botSeats.length === 1;
  const viewer =
    oneHumanVsBot && hideHidden
      ? (humanSeats[0] as PlayerId)
      : botSeats.length === 2 && spectatorView
        ? "spectator"
        : null;
  const shown = state && viewer ? displayState(state, viewer) : state;
  const banner =
    viewer === "spectator"
      ? "Spectator view: hidden cards hidden"
      : viewer
        ? `Hiding the bot's hidden cards: you see only ${viewer}'s view`
        : "Debug: hidden info visible";
  const averageMs = botMs.length
    ? botMs.reduce((a, b) => a + b, 0) / botMs.length
    : 0;

  return (
    // While the card drawer is open, the page keeps its width free so nothing is covered.
    <div
      style={{
        fontFamily: "sans-serif",
        fontSize: 13,
        paddingRight: selected ? CARD_DETAIL_WIDTH : 0,
      }}
    >
      <h1 style={{ fontSize: 18 }}>GojiSim debug viewer</h1>
      <div
        data-testid="debug-banner"
        style={{
          background: "var(--color-notice-bg)",
          padding: 6,
          fontWeight: "bold",
        }}
      >
        {banner}
      </div>
      <NewGameForm
        onStart={(seed, picked, newSeats) =>
          startSession(newSession(seed, picked, newSeats), true)
        }
      />
      <div style={{ margin: 4 }}>
        <button
          type="button"
          data-testid="export"
          disabled={!session}
          onClick={() => session && downloadRecord(session)}
        >
          Export game record
        </button>{" "}
        {session && state?.loop && (
          <button
            type="button"
            data-testid="export-loop-report"
            onClick={() =>
              downloadJson(
                buildLoopReport(session.record, state),
                `loop-report-${session.record.seed}.json`,
              )
            }
          >
            Download loop report
          </button>
        )}{" "}
        <label>
          Import{" "}
          <input
            type="file"
            accept="application/json"
            data-testid="import-file"
            onChange={(e) =>
              e.target.files?.[0] && void importRecord(e.target.files[0])
            }
          />
        </label>
        {importError && (
          <span style={{ color: "var(--color-illegal)" }}> {importError}</span>
        )}
      </div>
      {session && state && shown && (
        <>
          <StatusBar state={state} />
          <IllegalDeckBanner record={session.record} />
          {botSeats.length > 0 && (
            <div
              data-testid="bot-controls"
              style={{
                border: "1px solid var(--color-accent)",
                padding: 6,
                margin: 4,
              }}
            >
              <strong>Bots:</strong>{" "}
              {botSeats
                .map((id) => {
                  const seat = session.seats[id];
                  return seat.kind === "bot"
                    ? `${id} ${difficultyName(seat.difficulty)} (${seat.difficulty})`
                    : id;
                })
                .join(", ")}{" "}
              {playing ? (
                <button
                  type="button"
                  data-testid="bot-pause"
                  onClick={() => setPlaying(false)}
                >
                  ❚❚ Pause
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="bot-play"
                  onClick={() => setPlaying(true)}
                >
                  ▶ Play
                </button>
              )}{" "}
              <button
                type="button"
                data-testid="bot-step"
                disabled={playing || !botToMove}
                onClick={() => setStepping(true)}
              >
                Step (one bot action)
              </button>{" "}
              <label>
                Delay per bot action{" "}
                <input
                  type="range"
                  min={0}
                  max={3000}
                  step={100}
                  data-testid="bot-delay"
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                />{" "}
                <span data-testid="bot-delay-value">{delay}</span> ms
              </label>{" "}
              {oneHumanVsBot && (
                <label>
                  <input
                    type="checkbox"
                    data-testid="hide-hidden"
                    checked={hideHidden}
                    onChange={(e) => setHideHidden(e.target.checked)}
                  />{" "}
                  Hide opponent's hidden cards
                </label>
              )}
              {botSeats.length === 2 && (
                <label>
                  <input
                    type="checkbox"
                    data-testid="spectator-view"
                    checked={spectatorView}
                    onChange={(e) => setSpectatorView(e.target.checked)}
                  />{" "}
                  Spectator view (unchecked: show all cards)
                </label>
              )}
              <div>
                {thinking && (
                  <span
                    data-testid="bot-thinking"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Bot ({difficultyName(thinking.difficulty)}) is thinking…{" "}
                    {(Math.max(0, now - thinking.started) / 1000).toFixed(1)}{" "}
                    s{" "}
                  </span>
                )}
                <span data-testid="bot-ms">
                  Bot decisions: {botMs.length}, average {averageMs.toFixed(0)}{" "}
                  ms
                </span>
                {botError && (
                  <span style={{ color: "var(--color-illegal)" }}>
                    {" "}
                    Bot error: {botError}
                  </span>
                )}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div>
              <PlayerAreas
                state={shown}
                player={shown.players[1]}
                onSelect={select}
              />
              <Field
                state={shown}
                player={shown.players[1]}
                top
                onSelect={select}
              />
              <div
                style={{
                  borderTop: "3px solid var(--color-text)",
                  margin: "4px 0",
                }}
              />
              <Field
                state={shown}
                player={shown.players[0]}
                top={false}
                onSelect={select}
              />
              <PlayerAreas
                state={shown}
                player={shown.players[0]}
                onSelect={select}
              />
              <div
                style={{
                  border: "1px solid var(--color-border-strong)",
                  padding: 4,
                  margin: 2,
                }}
              >
                Resolution area ({state.resolutionArea.length}):{" "}
                {state.resolutionArea
                  .map((c) => state.cards[c.cardId]?.name)
                  .join(", ")}
              </div>
            </div>
            <div style={{ minWidth: 360 }}>
              {botToMove && !state.result ? (
                <div
                  data-testid="actions"
                  style={{
                    border: "1px solid var(--color-border-strong)",
                    padding: 6,
                    margin: 4,
                  }}
                >
                  <strong>
                    {decider} (bot) to act
                    {session.position !== session.record.actions.length
                      ? " — step forward to the end to let it play"
                      : playing || stepping
                        ? ""
                        : " — paused"}
                  </strong>
                </div>
              ) : (
                <>
                  <ManualPanel state={state} onAction={takeAction} />
                  <ActionPanel state={state} onAction={takeAction} />
                </>
              )}
              <div
                style={{
                  border: "1px solid var(--color-border-strong)",
                  padding: 6,
                  margin: 4,
                }}
              >
                <button
                  type="button"
                  data-testid="step-back"
                  disabled={session.position === 0}
                  onClick={() =>
                    setSession({ ...session, position: session.position - 1 })
                  }
                >
                  ◀ Step back
                </button>{" "}
                <button
                  type="button"
                  data-testid="step-forward"
                  disabled={session.position === session.record.actions.length}
                  onClick={() =>
                    setSession({ ...session, position: session.position + 1 })
                  }
                >
                  Step forward ▶
                </button>{" "}
                Action <span data-testid="position">{session.position}</span> /{" "}
                {session.record.actions.length}
                <input
                  type="range"
                  data-testid="action-slider"
                  min={0}
                  max={session.record.actions.length}
                  value={session.position}
                  onChange={(e) =>
                    setSession({ ...session, position: Number(e.target.value) })
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <LogPanel state={state} labels={session.labels} />
            </div>
          </div>
        </>
      )}
      {selected && (
        <CardDetail card={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

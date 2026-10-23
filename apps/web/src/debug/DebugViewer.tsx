import { type Card, type DeckValidation, failedRules } from "@gojisim/cards";
import {
  type DeckListError,
  formatDeckList,
  type NamedDeck,
  parseDeckList,
} from "@gojisim/cards/deck-lists";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  type GameRecord,
  type GameState,
  buildLoopReport,
  deckLegalityFor,
  replayAll,
  startGame,
} from "@gojisim/engine";
import { botInput, decklistsOf, PRESETS } from "@gojisim/bot";
import { useEffect, useRef, useState } from "react";
import {
  type BotRequest,
  type BotResponse,
  botLabel,
  difficultyName,
  displayState,
  type SeatConfig,
  seatFromRecord,
  seatRecord,
} from "./bots";
import { CARD_DETAIL_WIDTH, CardDetail, Field, PlayerAreas } from "./Board";
import {
  checkDeck,
  type DeckOption,
  deckOptions,
  loadImportedDecks,
  saveImportedDecks,
} from "./decks";
import { ManualPanel } from "./ManualPanel";
import { ActionPanel, LogPanel, StatusBar } from "./Panels";

/** A record plus the action index the viewer was at when it was exported. */
interface ExportedRecord extends GameRecord {
  position?: number;
}

interface Session {
  record: GameRecord;
  /** `states[i]` is the state after `i` actions. */
  states: GameState[];
  position: number;
  /** Who plays each seat (M6d). */
  seats: Record<PlayerId, SeatConfig>;
  /** Seed for the bots' random choices; each decision uses `<botSeed>-<action index>`. */
  botSeed: string;
  /** Bot action labels for the log (M6d). */
  labels: { afterSeq: number; text: string }[];
}

type PlayerId = (typeof PLAYER_IDS)[number];

/** Applies an action at the end of the session (or at its position, dropping later actions). */
function withAction(session: Session, action: Action, label?: string): Session {
  const state = session.states[session.position] as GameState;
  const next = advanceToDecision(applyAction(state, action));
  const actions = [
    ...session.record.actions.slice(0, session.position),
    action,
  ];
  const keptLabels = session.labels.filter(
    (l) => l.afterSeq < state.log.length,
  );
  return {
    ...session,
    record: { ...session.record, actions },
    states: [...session.states.slice(0, session.position + 1), next],
    position: session.position + 1,
    labels: label
      ? [...keptLabels, { afterSeq: state.log.length, text: label }]
      : keptLabels,
  };
}

const PLAYER_IDS = ["P1", "P2"] as const;

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function newSession(
  seed: number,
  picked: [DeckOption, DeckOption],
  seats: Record<PlayerId, SeatConfig>,
): Session {
  const named = picked.map((option) => option.build(seed));
  const decks = PLAYER_IDS.map((id, i) => {
    const deck = named[i] as NamedDeck;
    return { id, monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
  }) as GameRecord["decks"];
  const record: GameRecord = {
    version: 1,
    seed,
    decks,
    actions: [],
    // Illegal decks are allowed, with a warning (Paul's ruling, Oct 21, 2026).
    deckLegality: deckLegalityFor(decks, new Date()),
    seats: { P1: seatRecord(seats.P1), P2: seatRecord(seats.P2) },
    botSeed: `${seed}-bots`,
  };
  return {
    record,
    states: [startGame(record)],
    position: 0,
    seats,
    botSeed: `${seed}-bots`,
    labels: [],
  };
}

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
    return <div style={{ color: "#b00" }}>{String(err)}</div>;
  }
  return (
    <div
      data-testid="deck-legality"
      style={{ color: validation.legal ? "#080" : "#b00", fontSize: 12 }}
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
  const options = deckOptions(imported);
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
    if (option.kind !== "imported") return option.label;
    const validation = checkDeck(option.build(0));
    return `${option.label} ${validation.legal ? "✓ legal" : `✗ ${failedRules(validation).join(", ")}`}`;
  };

  const importDeckList = async (file: File) => {
    const { decks, errors } = parseDeckList(await file.text());
    const next = [...imported, ...decks];
    setImported(next);
    saveImportedDecks(next);
    setImportErrors(errors);
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
      style={{ border: "1px solid #888", padding: 8, margin: 4 }}
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
                {options.map((option) => (
                  <option key={option.key} value={option.key}>
                    {legalityLabel(option)}
                  </option>
                ))}
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
        </button>
        {importErrors.length > 0 && (
          <ul
            data-testid="deck-list-errors"
            style={{ color: "#b00", fontSize: 12 }}
          >
            {importErrors.map((e) => (
              <li key={e.line}>
                Line {e.line}: {e.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </form>
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
      style={{ background: "#ffcdd2", padding: 6, margin: 4 }}
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

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function download(record: ExportedRecord): void {
  downloadJson(record, `gojisim-${record.seed}-${record.actions.length}.json`);
}

/**
 * Debug viewer: every legal action as a button, both players' hidden information visible unless
 * a bot seat's game hides it. Bot seats think in a Web Worker (M6d).
 */
export function DebugViewer() {
  const [session, setSession] = useState<Session | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Bot play (M6d).
  const [playing, setPlaying] = useState(false);
  const [stepping, setStepping] = useState(false);
  const [delay, setDelay] = useState(600);
  const [hideHidden, setHideHidden] = useState(true);
  const [spectatorView, setSpectatorView] = useState(false);
  const [thinking, setThinking] = useState<{
    player: PlayerId;
    started: number;
    difficulty: number;
  } | null>(null);
  const [now, setNow] = useState(0);
  const [botMs, setBotMs] = useState<number[]>([]);
  const [botError, setBotError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef<{ id: number; posted: boolean; key: number } | null>(
    null,
  );
  const nextJobId = useRef(1);
  const hideRef = useRef(hideHidden);
  hideRef.current = hideHidden;
  // Pause also drops a decision already in flight, so no new bot action lands after it.
  const runningRef = useRef(false);
  runningRef.current = playing || stepping;

  const state = session
    ? (session.states[session.position] as GameState)
    : null;

  const seats = session?.seats;
  const botSeats = seats
    ? PLAYER_IDS.filter((id) => seats[id].kind === "bot")
    : [];
  const humanSeats = seats
    ? PLAYER_IDS.filter((id) => seats[id].kind === "human")
    : [];
  const decider = state
    ? (state.pendingChoice?.player ?? state.turnPlayer)
    : null;
  const botToMove =
    !!state &&
    !!seats &&
    decider !== null &&
    seats[decider as PlayerId]?.kind === "bot";

  const startSession = (next: Session, autoPlay: boolean) => {
    jobRef.current = null;
    setThinking(null);
    setBotMs([]);
    setBotError(null);
    setSession(next);
    const bots = PLAYER_IDS.filter(
      (id) => next.seats[id].kind === "bot",
    ).length;
    // Human vs bot: the bot plays at once and hides its cards. Bot vs bot: press Play.
    setPlaying(autoPlay && bots === 1);
    setStepping(false);
    setHideHidden(bots === 1);
  };

  // The worker answers one decision at a time; a stale answer (the game moved on) is dropped.
  useEffect(() => {
    const worker = new Worker(new URL("./botWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<BotResponse>) => {
      const reply = event.data;
      const job = jobRef.current;
      if (!job || job.id !== reply.id) return;
      jobRef.current = null;
      setThinking(null);
      if (!runningRef.current) return;
      if ("error" in reply) {
        setBotError(reply.error);
        setPlaying(false);
        return;
      }
      setBotMs((ms) => [...ms, reply.ms]);
      setStepping(false);
      setSession((prev) => {
        if (
          !prev ||
          prev.position !== job.key ||
          prev.record.actions.length !== job.key
        )
          return prev;
        const current = prev.states[prev.position] as GameState;
        const who = current.pendingChoice?.player ?? current.turnPlayer;
        const seat = prev.seats[who as PlayerId];
        if (seat?.kind !== "bot") return prev;
        try {
          return withAction(
            prev,
            reply.action,
            botLabel(current, reply.action, seat.difficulty, hideRef.current),
          );
        } catch (err) {
          setBotError(String(err));
          setPlaying(false);
          return prev;
        }
      });
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // When a bot seat must decide (at the end of the record, while playing or stepping), ask the
  // worker after the delay. The worker gets the bot's input only, never the real state.
  useEffect(() => {
    if (!session || !state || !botToMove || state.result) return;
    if (session.position !== session.record.actions.length) return;
    if (!playing && !stepping) return;
    if (jobRef.current) return;
    const who = decider as PlayerId;
    const seat = session.seats[who];
    if (seat.kind !== "bot") return;
    const key = session.record.actions.length;
    const job = { id: nextJobId.current++, posted: false, key };
    jobRef.current = job;
    const timer = setTimeout(() => {
      const { rng: _rng, ...input } = botInput(
        state,
        who,
        decklistsOf(session.record.decks),
        () => 0,
        { difficulty: seat.difficulty },
      );
      job.posted = true;
      setThinking({
        player: who,
        started: performance.now(),
        difficulty: seat.difficulty,
      });
      const request: BotRequest = {
        id: job.id,
        input,
        seed: `${session.botSeed}-${key}`,
        difficulty: seat.difficulty,
      };
      workerRef.current?.postMessage(request);
    }, delay);
    return () => {
      clearTimeout(timer);
      if (jobRef.current === job && !job.posted) jobRef.current = null;
    };
  }, [session, state, botToMove, decider, playing, stepping, delay]);

  // The thinking indicator's clock.
  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [thinking]);

  const takeAction = (action: Action) => {
    if (!session || !state) return;
    const later = session.record.actions.length - session.position;
    if (
      later > 0 &&
      !window.confirm(
        `Taking an action here drops the ${later} later action(s). Continue?`,
      )
    )
      return;
    try {
      setSession(withAction(session, action));
    } catch (err) {
      window.alert(String(err));
    }
  };

  const importRecord = async (file: File) => {
    try {
      const record = JSON.parse(await file.text()) as ExportedRecord;
      if (
        record.version !== 1 ||
        !Array.isArray(record.actions) ||
        !Array.isArray(record.decks)
      ) {
        throw new Error("Not a GojiSim game record");
      }
      const states = replayAll(record);
      const position = Math.min(
        record.position ?? record.actions.length,
        record.actions.length,
      );
      const restoredSeats = {
        P1: seatFromRecord(record.seats?.["P1"]),
        P2: seatFromRecord(record.seats?.["P2"]),
      };
      const botSeed = record.botSeed ?? `${record.seed}-bots`;
      // An imported game opens paused: replays never re-run a bot; press Play to continue.
      startSession(
        {
          record: {
            version: 1,
            seed: record.seed,
            decks: record.decks,
            actions: record.actions,
            // Records made before deck legality existed get it computed now.
            deckLegality:
              record.deckLegality ?? deckLegalityFor(record.decks, new Date()),
            seats: {
              P1: seatRecord(restoredSeats.P1),
              P2: seatRecord(restoredSeats.P2),
            },
            botSeed,
          },
          states,
          position,
          seats: restoredSeats,
          botSeed,
          labels: [],
        },
        false,
      );
      setImportError(null);
    } catch (err) {
      setImportError(String(err));
    }
  };

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
        style={{ background: "#ffd54f", padding: 6, fontWeight: "bold" }}
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
          onClick={() =>
            session &&
            download({ ...session.record, position: session.position })
          }
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
        {importError && <span style={{ color: "red" }}> {importError}</span>}
      </div>
      {session && state && shown && (
        <>
          <StatusBar state={state} />
          <IllegalDeckBanner record={session.record} />
          {botSeats.length > 0 && (
            <div
              data-testid="bot-controls"
              style={{ border: "1px solid #06c", padding: 6, margin: 4 }}
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
                  <span data-testid="bot-thinking" style={{ color: "#06c" }}>
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
                  <span style={{ color: "red" }}> Bot error: {botError}</span>
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
              <div style={{ borderTop: "3px solid #333", margin: "4px 0" }} />
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
              <div style={{ border: "1px solid #888", padding: 4, margin: 2 }}>
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
                  style={{ border: "1px solid #888", padding: 6, margin: 4 }}
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
              <div style={{ border: "1px solid #888", padding: 6, margin: 4 }}>
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

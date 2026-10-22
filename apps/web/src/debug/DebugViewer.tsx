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
import { useState } from "react";
import { CARD_DETAIL_WIDTH, CardDetail, Field, PlayerAreas } from "./Board";
import {
  checkDeck,
  type DeckOption,
  deckOptions,
  loadImportedDecks,
  saveImportedDecks,
} from "./decks";
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
}

const PLAYER_IDS = ["P1", "P2"] as const;

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function newSession(seed: number, picked: [DeckOption, DeckOption]): Session {
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
  };
  return { record, states: [startGame(record)], position: 0 };
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
  onStart: (seed: number, picked: [DeckOption, DeckOption]) => void;
}) {
  const [seed, setSeed] = useState("20261021");
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
          onStart(Number(seed), picked);
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

/** Debug viewer: both players' hidden information visible, every legal action as a button. */
export function DebugViewer() {
  const [session, setSession] = useState<Session | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const state = session
    ? (session.states[session.position] as GameState)
    : null;

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
      const next = advanceToDecision(applyAction(state, action));
      const actions = [
        ...session.record.actions.slice(0, session.position),
        action,
      ];
      setSession({
        record: { ...session.record, actions },
        states: [...session.states.slice(0, session.position + 1), next],
        position: session.position + 1,
      });
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
      setSession({
        record: {
          version: 1,
          seed: record.seed,
          decks: record.decks,
          actions: record.actions,
          // Records made before deck legality existed get it computed now.
          deckLegality:
            record.deckLegality ?? deckLegalityFor(record.decks, new Date()),
        },
        states,
        position,
      });
      setImportError(null);
    } catch (err) {
      setImportError(String(err));
    }
  };

  const select = (card: CardInstance) => {
    const data = state?.cards[card.cardId];
    if (data) setSelected(data);
  };

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
        Debug: hidden info visible
      </div>
      <NewGameForm
        onStart={(seed, picked) => setSession(newSession(seed, picked))}
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
      {session && state && (
        <>
          <StatusBar state={state} />
          <IllegalDeckBanner record={session.record} />
          <div style={{ display: "flex", gap: 8 }}>
            <div>
              <PlayerAreas
                state={state}
                player={state.players[1]}
                onSelect={select}
              />
              <Field
                state={state}
                player={state.players[1]}
                top
                onSelect={select}
              />
              <div style={{ borderTop: "3px solid #333", margin: "4px 0" }} />
              <Field
                state={state}
                player={state.players[0]}
                top={false}
                onSelect={select}
              />
              <PlayerAreas
                state={state}
                player={state.players[0]}
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
              <ActionPanel state={state} onAction={takeAction} />
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
              <LogPanel state={state} />
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

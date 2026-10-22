import type { Card } from "@gojisim/cards";
import { buildTestDeck, TEST_DECK_SETS } from "@gojisim/cards/test-decks";
import {
  type Action,
  advanceToDecision,
  applyAction,
  type CardInstance,
  type GameRecord,
  type GameState,
  replayAll,
  startGame,
} from "@gojisim/engine";
import { useState } from "react";
import { CardDetail, Field, PlayerAreas } from "./Board";
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

function newSession(seed: number, sets: [string, string]): Session {
  const decks = PLAYER_IDS.map((id, i) => {
    const deck = buildTestDeck(sets[i] as string, seed);
    return { id, monsterDeck: deck.monsterDeck, mainDeck: deck.mainDeck };
  }) as GameRecord["decks"];
  const record: GameRecord = { version: 1, seed, decks, actions: [] };
  return { record, states: [startGame(record)], position: 0 };
}

function NewGameForm({
  onStart,
}: {
  onStart: (seed: number, sets: [string, string]) => void;
}) {
  const [seed, setSeed] = useState("20261021");
  const [sets, setSets] = useState<[string, string]>(["ESD01", "ESD02"]);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      style={{ border: "1px solid #888", padding: 8, margin: 4 }}
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onStart(Number(seed), sets);
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
      {PLAYER_IDS.map((id, i) => (
        <label key={id} style={{ marginLeft: 12 }}>
          {id} deck{" "}
          <select
            data-testid={`deck-${id}`}
            value={sets[i]}
            onChange={(e) =>
              setSets((s) =>
                i === 0 ? [e.target.value, s[1]] : [s[0], e.target.value],
              )
            }
          >
            {TEST_DECK_SETS.map((set) => (
              <option key={set}>{set}</option>
            ))}
          </select>
        </label>
      ))}{" "}
      <button type="submit" data-testid="start-game">
        Start
      </button>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </form>
  );
}

function download(record: ExportedRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gojisim-${record.seed}-${record.actions.length}.json`;
  link.click();
  URL.revokeObjectURL(url);
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
    <div style={{ fontFamily: "sans-serif", fontSize: 13 }}>
      <h1 style={{ fontSize: 18 }}>GojiSim debug viewer</h1>
      <div
        data-testid="debug-banner"
        style={{ background: "#ffd54f", padding: 6, fontWeight: "bold" }}
      >
        Debug: hidden info visible
      </div>
      <NewGameForm
        onStart={(seed, sets) => setSession(newSession(seed, sets))}
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

import { type Action, type GameState, getLegalActions } from "@gojisim/engine";
import { useEffect, useState } from "react";
import "../theme.css";
import { botLabel, difficultyName } from "../game/bots";
import { actionLabel, choiceHeading, choiceSource } from "../game/labels";
import { newSession, type PlayerId, type Session } from "../game/session";
import { useGameSession } from "../game/useGameSession";
import styles from "./Board.module.css";
import { BoardView, STEP_NAMES } from "./BoardView";
import { ChoiceModal } from "./ChoiceModal";
import { isLit, playableCards } from "./destinations";
import { type Mode, NewGame } from "./NewGame";
import { boardModel, bottomPlayer } from "./model";
import { visibleCards } from "./Preview";
import { useSettings } from "./settings";

/** Who must decide now: the hotseat cover shows when this changes. */
const deciderOf = (state: GameState) =>
  state.pendingChoice?.player ?? state.turnPlayer;

/** Where a bot action landed on the board, as `<player>|<destination>` (M5c move highlight). */
function landing(before: GameState, action: Action): Set<string> {
  const p = action.player;
  switch (action.type) {
    case "playBattle":
      return new Set([`${p}|zone:${action.zone}`]);
    case "activateStrategy":
      return new Set([`${p}|strategy:${action.strategyZone}`]);
    case "playMonster":
      return new Set([`${p}|monster`]);
    case "gainRage":
      return new Set([`${p}|rage`]);
    case "invade":
      return new Set([`${p}|discard`, `${p}|monster`]);
    case "choose": {
      if (before.pendingChoice?.kind !== "zone") return new Set();
      const [owner, zone] = action.optionId.split(":");
      return new Set([`${owner}|zone:${zone}`]);
    }
    default:
      return new Set();
  }
}

/** The last bot move: its toast line and, for the delay time, where it landed. */
interface BotMove {
  id: number;
  text: string;
  highlight: Set<string>;
}

/**
 * `/play` (M5a to M5c): the new-game screen, then the board, with the prompt panel, the choice
 * modal, the hotseat privacy cover and the bot's move toast.
 */
export function PlayScreen() {
  const mode: Mode =
    new URLSearchParams(window.location.search).get("mode") === "hotseat"
      ? "hotseat"
      : "bot";
  const [settings, updateSettings] = useSettings();
  const [cleared, setCleared] = useState<string | null>(null);
  const [botMove, setBotMove] = useState<BotMove | null>(null);
  const [confirming, setConfirming] = useState<"pass" | "concede" | null>(null);
  // `/play` never shows hidden cards, so bot labels always keep private choices private.
  // Bot seats play at once, two bots included (`/play` has no Play button before a game).
  const game = useGameSession({
    privateLabels: () => true,
    autoPlay: "always",
    onStart: (next: Session) =>
      setCleared(deciderOf(next.states[next.position] as GameState)),
  });
  const { session, state } = game;

  // Each bot action shows a one-line toast, and lights where it landed for the delay time.
  const count = session?.record.actions.length ?? 0;
  useEffect(() => {
    if (!session || count === 0 || session.position !== count) return;
    const action = session.record.actions[count - 1] as Action;
    const before = session.states[count - 1] as GameState;
    const seat = session.seats[action.player as PlayerId];
    if (seat?.kind !== "bot") return;
    setBotMove({
      id: count,
      text: botLabel(before, action, seat.difficulty, true),
      highlight: landing(before, action),
    });
    setTimeout(
      () =>
        setBotMove((m) =>
          m?.id === count ? { ...m, highlight: new Set() } : m,
        ),
      Math.max(game.delay, 600),
    );
    setTimeout(() => setBotMove((m) => (m?.id === count ? null : m)), 3000);
    // Only a new action starts a toast.
  }, [count]);

  const decider = game.decider;
  const seat = decider && session ? session.seats[decider] : null;
  const human = seat?.kind === "human" && !!state && !state.result;
  const actions =
    decider && human && state
      ? getLegalActions(state, decider).filter((a) => a.type !== "concede")
      : [];
  const pass = actions.find((a) => a.type === "pass");
  const hasLit = [...playableCards(actions)].some((id) => isLit(id, actions));
  const choice = state?.pendingChoice ?? null;

  const takePass = () => {
    if (!pass) return;
    if (settings.confirmPass && hasLit) setConfirming("pass");
    else game.takeAction(pass);
  };

  // Space is the main button: Pass, when no choice or dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || choice || confirming || !pass) return;
      if (
        (e.target as HTMLElement | null)?.closest(
          "input, select, textarea, button",
        )
      )
        return;
      e.preventDefault();
      takePass();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!session || !state)
    return (
      <div className="gojisim">
        <NewGame
          mode={mode}
          onStart={(seed, picked, seats) =>
            game.startSession(newSession(seed, picked, seats), true)
          }
          onLoad={(file) => game.importRecord(file, true)}
        />
      </div>
    );

  const hotseat = game.humanSeats.length === 2;
  const name = (id: string) =>
    hotseat
      ? id
      : session.seats[id as PlayerId]?.kind === "human"
        ? "You"
        : "Bot";
  const model = boardModel(state, bottomPlayer(state, session.seats));

  // Hotseat privacy cover: when the decider changes (a new turn, or a choice for the other
  // player, private ones included), the cover replaces the board, so nothing hidden is rendered
  // until the next player clicks.
  const now = deciderOf(state);
  if (
    hotseat &&
    settings.hotseatCover &&
    !state.result &&
    cleared !== null &&
    now !== cleared
  )
    return (
      <div className="gojisim">
        <button
          type="button"
          className={styles.cover}
          data-testid="privacy-cover"
          onClick={() => setCleared(now)}
        >
          <span className={styles.coverTitle}>Pass to {now}</span>
          <span>Click when ready</span>
        </button>
      </div>
    );

  // The bottom player plays hand cards on the board (M5b) when it is their decision; otherwise
  // (a bot decides, or the game is over) the hand is locked.
  const locked = decider !== model.bottom || !human;
  const concedeFor = hotseat
    ? model.bottom
    : (game.humanSeats[0] as PlayerId | undefined);
  const showModal = human && choice !== null && decider === model.bottom;
  const zoneChoice = new Map<string, Action>(
    showModal && choice?.kind === "zone"
      ? actions.flatMap((a) =>
          a.type === "choose" && a.optionId !== "done"
            ? [[a.optionId, a] as const]
            : [],
        )
      : [],
  );
  const flags = state.turnFlags;

  const prompt = state.result ? (
    <div>
      <div data-testid="game-over">
        Game over: {state.result.winner ? name(state.result.winner) : "draw"} (
        {state.result.reason})
      </div>
      <a href={`/play?mode=${mode}`}>New game</a>
    </div>
  ) : (
    <div className={styles.promptBody}>
      <div data-testid="prompt-step">
        <strong>{STEP_NAMES[state.phase] ?? state.phase}</strong> ·{" "}
        {name(state.turnPlayer) === "You"
          ? "your turn"
          : `${name(state.turnPlayer)}'s turn`}
      </div>
      <div className={styles.muted} data-testid="turn-flags">
        Invasion {flags.invasionUsed ? "used" : "unused"} · Monster{" "}
        {flags.monsterPlayed ? "played" : "not played"}
      </div>
      {game.botToMove && seat?.kind === "bot" ? (
        <>
          <div data-testid="bot-thinking">
            {game.thinking
              ? `Bot (${difficultyName(seat.difficulty)}) is thinking… ${(
                  Math.max(0, game.now - game.thinking.started) / 1000
                ).toFixed(1)} s`
              : game.playing
                ? `Bot (${difficultyName(seat.difficulty)}) is about to move…`
                : `Paused: Bot (${difficultyName(seat.difficulty)}) is to move.`}
          </div>
          {game.botSeats.length === 2 && (
            <button
              type="button"
              className={styles.button}
              data-testid={game.playing ? "bot-pause" : "bot-play"}
              onClick={() => game.setPlaying(!game.playing)}
            >
              {game.playing ? "Pause" : "Play"}
            </button>
          )}
        </>
      ) : choice && showModal ? (
        <div className={styles.muted} data-testid="prompt-choice">
          {choiceHeading(state, name)}
        </div>
      ) : (
        pass && (
          <button
            type="button"
            className={styles.button}
            data-testid="pass"
            onClick={takePass}
          >
            Pass [Space]
          </button>
        )
      )}
      {concedeFor && (
        <button
          type="button"
          className={styles.linkButton}
          data-testid="concede"
          onClick={() => setConfirming("concede")}
        >
          Concede
        </button>
      )}
      <details className={styles.settings}>
        <summary>Settings</summary>
        <label>
          <input
            type="checkbox"
            data-testid="setting-confirm-pass"
            checked={settings.confirmPass}
            onChange={(e) => updateSettings({ confirmPass: e.target.checked })}
          />{" "}
          Confirm before Pass
        </label>
        {hotseat && (
          <label>
            <input
              type="checkbox"
              data-testid="setting-hotseat-cover"
              checked={settings.hotseatCover}
              onChange={(e) =>
                updateSettings({ hotseatCover: e.target.checked })
              }
            />{" "}
            Hotseat privacy cover
          </label>
        )}
      </details>
    </div>
  );

  const manualCards = [...visibleCards(model).values()].map((card) => ({
    card,
    label: `${card.owner}: ${state.cards[card.cardId]?.name ?? card.cardId}`,
  }));
  return (
    <div className="gojisim">
      <BoardView
        model={model}
        prompt={prompt}
        actions={locked ? [] : actions}
        locked={locked}
        onAction={game.takeAction}
        labelOf={(action) => actionLabel(state, action)}
        zoneChoice={zoneChoice}
        highlight={botMove?.highlight ?? new Set()}
      />
      {showModal && (
        <ChoiceModal
          key={choice?.id}
          state={state}
          heading={choiceHeading(state, name)}
          source={choiceSource(state)}
          actions={actions}
          manualCards={manualCards}
          onAction={game.takeAction}
          labelOf={(action) => actionLabel(state, action)}
        />
      )}
      {botMove && (
        <div className={styles.toast} data-testid="bot-toast">
          {botMove.text}
        </div>
      )}
      {confirming && (
        <div className={styles.modalBackdrop} data-testid="confirm-dialog">
          <div className={styles.modal}>
            <div className={styles.modalHeading}>
              {confirming === "pass"
                ? "Pass with playable cards left?"
                : "Concede the game?"}
            </div>
            <div className={styles.modalButtons}>
              <button
                type="button"
                className={styles.button}
                data-testid="confirm-yes"
                onClick={() => {
                  setConfirming(null);
                  if (confirming === "pass" && pass) game.takeAction(pass);
                  if (confirming === "concede" && concedeFor)
                    game.takeAction({ type: "concede", player: concedeFor });
                }}
              >
                {confirming === "pass" ? "Pass" : "Concede"}
              </button>
              <button
                type="button"
                className={styles.choiceButton}
                data-testid="confirm-cancel"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

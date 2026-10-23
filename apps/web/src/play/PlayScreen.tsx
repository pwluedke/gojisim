import { getLegalActions } from "@gojisim/engine";
import "../theme.css";
import { difficultyName } from "../game/bots";
import { actionLabel } from "../game/labels";
import { newSession } from "../game/session";
import { useGameSession } from "../game/useGameSession";
import styles from "./Board.module.css";
import { BoardView } from "./BoardView";
import { type Mode, NewGame } from "./NewGame";
import { boardModel, bottomPlayer } from "./model";

/** `/play` (M5a): the new-game screen, then the read-only board. */
export function PlayScreen() {
  const mode: Mode =
    new URLSearchParams(window.location.search).get("mode") === "hotseat"
      ? "hotseat"
      : "bot";
  // `/play` never shows hidden cards, so bot labels always keep private choices private.
  // Bot seats play at once, two bots included (`/play` has no Play button before a game).
  const game = useGameSession({
    privateLabels: () => true,
    autoPlay: "always",
  });
  const { session, state } = game;

  if (!session || !state)
    return (
      <div className="gojisim">
        <NewGame
          mode={mode}
          onStart={(seed, picked, seats) =>
            game.startSession(newSession(seed, picked, seats), true)
          }
        />
      </div>
    );

  const model = boardModel(state, bottomPlayer(state, session.seats));
  const decider = game.decider;
  const seat = decider ? session.seats[decider] : null;
  // Temporary prompt (M5a): Pass and the human's choices as buttons; M5b and M5c replace it.
  const actions =
    decider && seat?.kind === "human" && !state.result
      ? getLegalActions(state, decider).filter((a) => a.type !== "concede")
      : [];
  const pass = actions.find((a) => a.type === "pass");
  const choices = actions.filter((a) => a.type === "choose");
  const prompt = state.result ? (
    <div>
      <div data-testid="game-over">Game over</div>
      <a href={`/play?mode=${mode}`}>New game</a>
    </div>
  ) : game.botToMove && seat?.kind === "bot" ? (
    <div>
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
    </div>
  ) : (
    <div>
      <div className={styles.muted}>
        {decider} to act
        {state.pendingChoice ? ` (${state.pendingChoice.kind})` : ""}. Temporary
        controls until M5b/M5c.
      </div>
      {choices.map((action, i) => (
        <button
          key={i}
          type="button"
          className={styles.choiceButton}
          data-testid="temp-choice"
          onClick={() => game.takeAction(action)}
        >
          {actionLabel(state, action)}
        </button>
      ))}
      {pass && (
        <button
          type="button"
          className={styles.button}
          data-testid="pass"
          onClick={() => game.takeAction(pass)}
        >
          Pass
        </button>
      )}
    </div>
  );
  return (
    <div className="gojisim">
      <BoardView model={model} prompt={prompt} />
    </div>
  );
}

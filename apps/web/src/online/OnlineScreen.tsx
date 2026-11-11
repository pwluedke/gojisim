import { useEffect, useState } from "react";
import { fetchMe, type Me } from "../account";
import { accountApi } from "../game/accountSync";
import { parseTags } from "@gojisim/cards/deck-lists";
import { PlayScreen } from "../play/PlayScreen";
import { ThemeHeader } from "../ThemeHeader";
import {
  ask,
  connectOnline,
  type DeckChoice,
  errorText,
  inviteLink,
} from "./client";
import styles from "./Online.module.css";
import { type OnlinePlay, useOnline } from "./useOnline";

/*
 * Play online (M9b): `/online` creates a head to head game and `/online/<game id>` is the game,
 * for both players: the invite link joins it, a refresh rejoins it. Both players are signed in.
 * Once the First / Second pick is made, the board is `/play`'s, fed by the server.
 */

interface DeckOption {
  key: string;
  label: string;
  tags: string[];
  choice: DeckChoice;
}

const STARTERS: DeckOption[] = (["ESD01", "ESD02"] as const).map((set) => ({
  key: `official:${set}`,
  label: `${set} official`,
  tags: [],
  choice: { source: "official", set },
}));

/** The player's account decks (the copies the server plays), then the starters. */
function useDeckOptions(): DeckOption[] {
  const [options, setOptions] = useState<DeckOption[]>(STARTERS);
  useEffect(() => {
    let live = true;
    void accountApi()
      .decks()
      .then((decks) => {
        if (!live || !decks) return;
        const mine = decks
          .filter((d) => !d.deleted)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((d): DeckOption => ({
            key: `mine:${d.id}`,
            label: d.name,
            tags: parseTags(d.list),
            choice: { source: "mine", id: d.id },
          }));
        setOptions([...mine, ...STARTERS]);
      });
    return () => {
      live = false;
    };
  }, []);
  return options;
}

function DeckPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (option: DeckOption) => void;
}) {
  const options = useDeckOptions();
  useEffect(() => {
    if (!options.some((o) => o.key === value) && options[0])
      onChange(options[0]);
  }, [options, value, onChange]);
  return (
    <label className={styles.field}>
      Your deck
      <select
        data-testid="online-deck"
        value={value}
        onChange={(e) => {
          const found = options.find((o) => o.key === e.target.value);
          if (found) onChange(found);
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
            {o.tags.length ? ` (${o.tags.join(", ")})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function useMe(): Me | null | undefined {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    void fetchMe().then(setMe);
  }, []);
  return me;
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="gojisim">
      <ThemeHeader />
      <main className={styles.panel}>{children}</main>
    </div>
  );
}

function SignInFirst() {
  return (
    <Page>
      <h1 className={styles.title}>Play online</h1>
      <p data-testid="online-sign-in">
        Both players sign in with Discord to play each other online.
      </p>
      <a className={styles.button} href="/">
        Back to the menu
      </a>
    </Page>
  );
}

/** `/online`: pick a deck and Casual or Tournament, then create the game and share its link. */
function CreateGame() {
  const [deck, setDeck] = useState<DeckOption | null>(null);
  const [mode, setMode] = useState<"casual" | "tournament">("casual");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!deck) return;
    setBusy(true);
    const socket = connectOnline();
    const answer = await ask(socket, "create", { mode, deck: deck.choice });
    socket.disconnect();
    setBusy(false);
    if (!answer.ok) {
      setError(errorText(answer.error));
      return;
    }
    window.location.assign(`/online/${String(answer["gameId"])}`);
  };
  return (
    <Page>
      <h1 className={styles.title}>Play online</h1>
      <p>Create a game, send the link to a friend, and play head to head.</p>
      <DeckPicker value={deck?.key ?? ""} onChange={setDeck} />
      <label className={styles.field}>
        Match type
        <select
          data-testid="online-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "casual" | "tournament")}
        >
          <option value="casual">Casual (undo if both agree)</option>
          <option value="tournament">Tournament (no undo, legal decks)</option>
        </select>
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        data-primary
        data-testid="online-create"
        disabled={!deck || busy}
        onClick={() => void create()}
      >
        Create game
      </button>
    </Page>
  );
}

/** The friend's side of the link: who invited them, a deck, and Join. */
function JoinGame({ play }: { play: OnlinePlay }) {
  const [deck, setDeck] = useState<DeckOption | null>(null);
  const [host, setHost] = useState<{
    name: string | null;
    mode: string;
    phase: string;
  } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const socket = connectOnline();
    void ask(socket, "peek", { gameId: play.gameId }).then((answer) => {
      socket.disconnect();
      if (!answer.ok) setMissing(true);
      else
        setHost({
          name: (answer["host"] as string | null) ?? null,
          mode: String(answer["mode"]),
          phase: String(answer["phase"]),
        });
    });
  }, [play.gameId]);
  if (missing)
    return (
      <Page>
        <p data-testid="online-missing">{errorText("no-such-game")}</p>
        <a className={styles.button} href="/online">
          Create a game
        </a>
      </Page>
    );
  if (!host) return <Page>Loading…</Page>;
  if (host.phase !== "waiting")
    return (
      <Page>
        <p data-testid="online-full">{errorText("full")}</p>
        <a className={styles.button} href="/online">
          Create a game
        </a>
      </Page>
    );
  return (
    <Page>
      <h1 className={styles.title} data-testid="online-invited">
        {host.name ?? "A player"} invited you
      </h1>
      <p>
        A {host.mode === "tournament" ? "Tournament" : "Casual"} game, head to
        head.
      </p>
      <DeckPicker value={deck?.key ?? ""} onChange={setDeck} />
      {play.error && (
        <p className={styles.error} role="alert">
          {play.error}
        </p>
      )}
      <button
        type="button"
        data-primary
        data-testid="online-join"
        disabled={!deck}
        onClick={() => deck && void play.join(deck.choice)}
      >
        Join
      </button>
    </Page>
  );
}

function Waiting({ play }: { play: OnlinePlay }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(play.gameId);
  return (
    <Page>
      <h1 className={styles.title}>Waiting for opponent…</h1>
      <p>Send this link to the player you want to play:</p>
      <input
        className={styles.link}
        data-testid="online-link"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        data-primary
        data-testid="online-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(link).then(() => setCopied(true));
        }}
      >
        {copied ? "Copied" : "Copy invite link"}
      </button>
      <button
        type="button"
        data-testid="online-cancel"
        onClick={() => {
          void play.cancel().then((done) => {
            if (done) window.location.assign("/online");
          });
        }}
      >
        Cancel game
      </button>
    </Page>
  );
}

/** The First / Second pick (6.3.1.4): the picker picks a face-down card; the server says which. */
function Pick({ play }: { play: OnlinePlay }) {
  const m = play.message;
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  if (!m) return null;
  // The picker picks; so may the other player once the picker has been gone 5 minutes (M9c).
  const mine = m.canPick;
  const gone = m.opponent && !m.opponent.connected;
  return (
    <Page>
      <h1 className={styles.title}>First / Second</h1>
      {mine ? (
        <>
          <p>Pick a card: it says whether you go first or second (6.3.1.4).</p>
          <div className={styles.cards}>
            {([0, 1] as const).map((card) => (
              <button
                key={card}
                type="button"
                className={styles.faceDown}
                data-testid={`online-pick-${card}`}
                disabled={picked !== null}
                onClick={() => {
                  setPicked(card);
                  play.pick(card);
                }}
                aria-label={`Card ${card + 1}`}
              />
            ))}
          </div>
        </>
      ) : (
        <p data-testid="online-other-picks">
          {m.opponent?.name ?? "Your opponent"} is picking First / Second…
          {gone && (
            <span data-testid="online-picker-gone">
              {" "}
              They left; if they're gone 5 minutes, you can pick instead.
            </span>
          )}
        </p>
      )}
    </Page>
  );
}

const minutes = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Over the board: the opponent's presence, the claim, and undo requests. */
function Overlays({ play }: { play: OnlinePlay }) {
  const m = play.message;
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  // The time since the message, so the gone timer runs between messages.
  const [at, setAt] = useState(() => Date.now());
  useEffect(() => setAt(Date.now()), [m]);
  if (!m) return null;
  const name = m.opponent?.name ?? "Your opponent";
  const gone =
    m.phase === "playing" && m.opponent && !m.opponent.connected
      ? m.opponent.goneMs + (Date.now() - at)
      : null;
  return (
    <>
      {!play.connected && (
        <div className={styles.banner} data-testid="online-reconnecting">
          Reconnecting…
        </div>
      )}
      {gone !== null && (
        <div className={styles.banner} data-testid="online-waiting">
          Waiting for {name} ({minutes(gone)})
          {m.canClaim ? (
            <button
              type="button"
              data-primary
              data-testid="online-claim"
              onClick={play.claim}
            >
              Claim the win
            </button>
          ) : (
            <span className={styles.hint}>
              {" "}
              You can claim the win after 5:00.
            </span>
          )}
        </div>
      )}
      {m.phase === "playing" && m.undo.asked === m.you && (
        <div className={styles.banner} data-testid="online-undo-asked">
          Asked {name} to let you undo your last action…
        </div>
      )}
      {m.phase === "playing" && m.undo.asked && m.undo.asked !== m.you && (
        <div
          className={styles.modal}
          role="dialog"
          aria-label="Undo request"
          data-testid="online-undo-request"
        >
          <p>{name} asks to undo their last action.</p>
          <button
            type="button"
            data-primary
            data-testid="online-undo-allow"
            onClick={() => play.answerUndo(true)}
          >
            Allow
          </button>
          <button
            type="button"
            data-testid="online-undo-decline"
            onClick={() => play.answerUndo(false)}
          >
            Decline
          </button>
        </div>
      )}
      {play.error && (
        <div className={styles.banner} role="alert" data-testid="online-error">
          {play.error}
          <button type="button" data-small onClick={play.clearError}>
            OK
          </button>
        </div>
      )}
    </>
  );
}

function Game({ gameId }: { gameId: string }) {
  const play = useOnline(gameId);
  const m = play.message;
  if (play.seat === null) {
    // Not in this game yet: the invite (a refresh of a joined game rejoins at once).
    if (!play.checked) return <Page>Connecting…</Page>;
    if (!play.connected) return <Page>{play.error ?? "Connecting…"}</Page>;
    return <JoinGame play={play} />;
  }
  if (!m) return <Page>Connecting…</Page>;
  if (m.phase === "waiting") return <Waiting play={play} />;
  if (m.phase === "picking") return <Pick play={play} />;
  return (
    <>
      <PlayScreen online={play} />
      <Overlays play={play} />
    </>
  );
}

export function OnlineScreen() {
  const me = useMe();
  const id = /^\/online\/([0-9a-f-]{36})\/?$/.exec(
    window.location.pathname,
  )?.[1];
  if (me === undefined) return <Page>Loading…</Page>;
  if (me === null) return <SignInFirst />;
  return id ? <Game gameId={id} /> : <CreateGame />;
}

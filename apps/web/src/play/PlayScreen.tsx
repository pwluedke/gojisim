import {
  type Action,
  combosInGame,
  type ComboHit,
  type GameState,
  getLegalActions,
  type MatchMode,
  stepPhase,
} from "@gojisim/engine";
import { validateDeck } from "@gojisim/cards";
import { useEffect, useMemo, useRef, useState } from "react";
import "../theme.css";
import { botLabel, difficultyName } from "../game/bots";
import { actionLabel, choiceHeading, choiceSource } from "../game/labels";
import type { SeatConfig } from "../game/bots";
import type { DeckOption } from "../game/decks";
import {
  canUndoSession,
  downloadRecord,
  newSession,
  PLAYER_IDS,
  type PlayerId,
  prePickSession,
  type Session,
  undoConfirmed,
} from "../game/session";
import { useGameSession } from "../game/useGameSession";
import {
  ANNOUNCED_KINDS,
  type AnnounceNames,
  announce,
  lineMs,
  PACE_CONFIRM,
  paceLabel,
} from "../game/announce";
import {
  fetchConfig,
  latestBotMove,
  type SiteConfig,
  testSiteEnabled,
  uploadRecord,
  withBugReport,
  withFeedback,
  withOpponentHandShown,
} from "../game/collection";
import {
  clearCapture,
  getLastAnswer,
  getLastError,
  installErrorCapture,
} from "../game/errors";
import { ReportModal } from "./ReportModal";
import { TestSitePanel } from "./TestSitePanel";
import styles from "./Board.module.css";
import { BoardView, STEP_NAMES } from "./BoardView";
import { ThemeHeader } from "../ThemeHeader";
import { BattleLog } from "./BattleLog";
import { FightCard, type FightSide } from "./FightCard";
import { buildLog } from "./logLines";
import { ChoiceModal } from "./ChoiceModal";
import { ComboModal } from "./ComboModal";
import { type Combo, getCombos } from "@gojisim/cards";

import { cardByNumber } from "../game/labels";
import { FirstPick } from "./FirstPick";
import {
  lastLine,
  type OutcomeKey,
  outcomeHeading,
  outcomeKey,
  pickLine,
  rememberLine,
} from "./gameOver";
import { SearchModal } from "./SearchModal";
import { type SearchResult, searchResults } from "./searches";
import { NewGame } from "./NewGame";
import { RulesPanel } from "../rules/RulesPanel";
import { boardModel, bottomPlayer } from "./model";
import { visibleCards } from "./Preview";
import {
  type AnimationSpeed,
  THEME_NAMES,
  THEMES,
  type Theme,
  useSettings,
} from "./settings";
import { MAT_MAX_BYTES } from "./matStore";
import { useCustomMat } from "./useCustomMat";
import { SoundPlayer, slamCues, stepIsHeard, stepSounds } from "../game/sounds";

/** A combo hit's data entry (name, cards, steps, result). */
const comboOf = (hit: ComboHit): Combo | undefined =>
  getCombos().find((c) => c.id === hit.comboId);

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
    case "invadeFromDeck":
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

/** The keyboard shortcuts (M5d), as the ? list shows them. */
const SHORTCUTS: [string, string][] = [
  ["Space", "Pass (the prompt panel's main button)"],
  [
    "1 to 9",
    "Pick an option in a choice, numbered left to right (search cards have no number badges); in a pick of 2 or more cards, select or deselect it",
  ],
  ["Enter", "Confirm the selected cards in a pick of 2 or more"],
  ["B", "View the board behind a choice, search or pick, and return"],
  ["H", "Expand / close the hand"],
  [
    "Esc",
    "Cancel the selected card or a choice's selection, return from the board view, close the expanded hand, a dialog or the preview",
  ],
  ["L", "Collapse / expand the battle log"],
  ["M", "Mute / unmute the sound effects"],
  [
    "U",
    "Undo your last action, or a whole confirmed pick of cards (Casual games, back to the last draw, search, reveal, shuffle, random result or opponent action)",
  ],
  ["?", "Show / hide this list"],
];

/**
 * Whether a record file would load with two human seats (a hotseat game, which `/play` no longer
 * plays; `/debug` still loads it).
 */
async function twoHumanSeats(file: File): Promise<boolean> {
  try {
    const seats = (
      JSON.parse(await file.text()) as {
        seats?: Record<string, { kind?: string }>;
      }
    ).seats;
    // A seat that isn't a bot loads as human (`seatFromRecord`), records from before M6d too.
    return seats?.["P1"]?.kind !== "bot" && seats?.["P2"]?.kind !== "bot";
  } catch {
    // Not JSON: importRecord reports it.
    return false;
  }
}

/** The last bot move: its toast line and, for the delay time, where it landed. */
interface BotMove {
  id: number;
  text: string;
  highlight: Set<string>;
}

/** A bot announcement line: shown for `ms`, or until OK with the Confirm pace (`null`). */
interface Announcement {
  id: number;
  text: string;
  ms: number | null;
}

/** A game set up on the new-game screen, waiting for the First / Second pick (M5e). */
interface PendingGame {
  seed: number;
  picked: [DeckOption, DeckOption];
  seats: Record<PlayerId, SeatConfig>;
  matchMode: MatchMode;
  /** M5h #13: the human sees the bot's hand. */
  showOpponentHand: boolean;
  picker: PlayerId;
  /** The card (0 or 1) that reads First for the picker: the seed decides (6.3.1.4). */
  firstCard: 0 | 1;
}

/**
 * `/play` (M5a to M5h): the new-game screen and the First / Second pick, then the board, with the
 * prompt panel (and Casual undo), the choice and search modals and the bot's move toast. It is
 * human vs bot (or two bots) only: M5h removed hotseat until M9 adds online play.
 */
export function PlayScreen() {
  const [settings, updateSettings] = useSettings();
  const [botMove, setBotMove] = useState<BotMove | null>(null);
  // Bot announcements: the lines waiting (the first shows), the action count seen last, and the
  // first action index that may be announced (a loaded record's actions are history).
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const announceFrom = useRef(0);
  const lastCount = useRef(0);
  // Sound effects: the player, the action count heard last, and the first action index that plays
  // (a loaded record's actions are history, like its animations).
  const sounds = useRef(new SoundPlayer());
  const heardCount = useRef(0);
  const soundFrom = useRef(0);
  const loadedGame = useRef(false);
  // The game ended in this page (not a loaded finished one): its game-over modal plays a stinger.
  const endedHere = useRef(false);
  const [confirming, setConfirming] = useState<
    "pass" | "concede" | "showHand" | null
  >(null);
  // M5d: the read-only history view (a session position), the log (L), and the overlays (H, ?).
  const [historyAt, setHistoryAt] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<"hand" | "shortcuts" | null>(null);
  // M5e: the game waiting for its First / Second pick, and human searches waiting for Confirm.
  const [pending, setPending] = useState<PendingGame | null>(null);
  // M13b: the server's Test Site switch, the open Bad Bot! / Report bug popup, the panel's note
  // (where the Report bug file went, or how a Bad Bot! send went), and whether the bot's hand
  // shows now (the record keeps its flag even after it is turned off).
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [reporting, setReporting] = useState<
    "badBot" | "goodBot" | "bug" | null
  >(null);
  const [note, setNote] = useState<string | null>(null);
  const [showHand, setShowHand] = useState(false);
  // The result each game started with: a game that ends here (not a loaded finished one) uploads.
  const startResult = useRef<GameState["result"]>(null);
  useEffect(() => {
    let live = true;
    void fetchConfig().then((c) => live && setConfig(c));
    return () => {
      live = false;
    };
  }, []);
  // #105: the page's uncaught errors, for Report bug.
  useEffect(() => installErrorCapture(), []);
  const testSite = testSiteEnabled(config);
  const [searches, setSearches] = useState<SearchResult[]>([]);
  // Log entries already checked for searches (a loaded record's searches are history).
  const seenLog = useRef(0);
  // M5f: card animations lock input and hold the bot; the custom mat image setting.
  const [animating, setAnimating] = useState(false);
  const customMat = useCustomMat();
  // M5g: combos waiting for (or showing in) the combo modal, and the steps already checked.
  const [callouts, setCallouts] = useState<ComboHit[]>([]);
  const lastCombo = useRef(0);
  // M5h #11: the rules panel, open at a rule number.
  const [rulesAt, setRulesAt] = useState<string | null>(null);
  // M5h #17: the game-over modal's outcome and line, once the game ends; `closed` after Close.
  const [gameOver, setGameOver] = useState<{
    key: OutcomeKey;
    line: string;
    closed: boolean;
  } | null>(null);
  // `/play` never shows hidden cards, so bot labels always keep private choices private.
  // Bot seats play at once, two bots included (`/play` has no Play button before a game).
  const game = useGameSession({
    privateLabels: () => true,
    autoPlay: "always",
    onStart: (next: Session) => {
      const start = next.states[next.position] as GameState;
      clearCapture();
      setHistoryAt(null);
      setSearches([]);
      setNote(null);
      setReporting(null);
      setShowHand(next.record.showOpponentHand === true);
      startResult.current = start.result;
      seenLog.current = start.log.length;
      // A loaded record's combos are history: no callouts for them.
      setCallouts([]);
      setGameOver(null);
      lastCombo.current = next.record.actions.length;
      setAnnouncements([]);
      announceFrom.current = next.record.actions.length;
      lastCount.current = next.record.actions.length;
      soundFrom.current = next.record.actions.length;
      heardCount.current = next.record.actions.length;
      loadedGame.current = next.record.actions.length > 0;
    },
    // While the history view or a search result is open, a bot's answer waits.
    // A combo modal holds the bot too (M5g), until it is closed.
    // The First / Second pick holds the bot on the board under it.
    // A bot announcement holds the bot too, until its time is up or OK is pressed.
    hold:
      announcements.length > 0 ||
      historyAt !== null ||
      searches.length > 0 ||
      callouts.length > 0 ||
      pending !== null ||
      reporting !== null,
    // While cards move or a combo modal is open, no bot decision starts; nor while a Bad Bot! or
    // Report bug popup is open (M13b).
    pause:
      announcements.length > 0 ||
      animating ||
      callouts.length > 0 ||
      pending !== null ||
      reporting !== null,
  });
  const { session, state } = game;
  const { setDelay } = game;
  useEffect(() => setDelay(settings.botDelay), [setDelay, settings.botDelay]);

  const name = (id: string) =>
    session?.seats[id as PlayerId]?.kind === "human" ? "You" : "Bot";
  // Announcements name the bot "Bot" (or "Bot P1" / "Bot P2" between two bots) and the human's
  // cards "your".
  const twoBots =
    !!session && PLAYER_IDS.every((id) => session.seats[id].kind === "bot");
  const announceNames: AnnounceNames = {
    subject: (player) => (twoBots ? `Bot ${player}` : "Bot"),
    whose: (owner, actor) =>
      owner === actor
        ? "its"
        : session?.seats[owner as PlayerId]?.kind === "human"
          ? "your"
          : `Bot ${owner}'s`,
  };
  const liveBottom =
    state && session ? bottomPlayer(state, session.seats) : null;
  // M5g: every combo in the game so far, from the record's steps (an undo drops its combos).
  const combos = useMemo(
    () => (session ? combosInGame(session.states, session.record.actions) : []),
    [session],
  );
  // Illegal decks (Casual) keep a warning on their mat all game: the legality the record stored at
  // game start, worded from the deck and that start date.
  const decks = session?.record.decks;
  const legality = session?.record.deckLegality;
  const deckWarnings = useMemo(() => {
    const warnings: Record<string, string[]> = {};
    for (const entry of legality ?? []) {
      const deck = decks?.find((d) => d.id === entry.player);
      if (entry.legal || !deck) continue;
      // M13b: plain reasons naming the cards ("Gravity Beam (EBP01-079): banned since Sep 1, 2026").
      warnings[entry.player] = validateDeck(
        deck,
        new Date(entry.asOf),
      ).failures.flatMap((f) => f.reasons);
      // A deck checked legal again today (a list changed) still shows the rules it failed then.
      if (warnings[entry.player]?.length === 0)
        warnings[entry.player] = entry.failedRules;
    }
    return warnings;
  }, [decks, legality]);
  const lines = useMemo(
    () =>
      session && liveBottom ? buildLog(session, liveBottom, name, combos) : [],
    // `name` follows the seats, which belong to the session.
    [session, liveBottom, combos],
  );
  /** A combo's player as the callout names it: "You", "Bot (Hard)", or the seat id. */
  const comboWho = (player: string) => {
    const seat = session?.seats[player as PlayerId];
    return seat?.kind === "bot"
      ? `Bot (${difficultyName(seat.difficulty)})`
      : name(player);
  };
  // Combos from the newest step open the combo modal once the cards land, one at a time.
  useEffect(() => {
    if (!session) return;
    const live = session.position === session.record.actions.length;
    const fresh = combos.filter(
      (h) => h.actionIndex >= lastCombo.current && live,
    );
    lastCombo.current = session.record.actions.length;
    if (fresh.length && settings.comboCallouts)
      setCallouts((queue) => [...queue, ...fresh]);
    // Only a new step brings new combos.
  }, [combos]);
  const callout = callouts[0] ?? null;
  const closeCallout = () => setCallouts((queue) => queue.slice(1));

  // M5h #17: when the game ends, pick the game-over line for the human (P1 between two bots).
  const result = state?.result ?? null;
  useEffect(() => {
    if (!result || gameOver || !liveBottom) return;
    const key = outcomeKey(result, liveBottom);
    endedHere.current = !startResult.current;
    const line = pickLine(key, lastLine());
    rememberLine(line);
    setGameOver({ key, line, closed: false });
  }, [result]);
  const closeGameOver = () =>
    setGameOver((g) => (g ? { ...g, closed: true } : g));

  // M13b: a game that ends here (win, loss, draw or concession) uploads its record, Bad Bot!
  // reports included, when the Test Site is on and sharing is on. A loaded finished game doesn't.
  useEffect(() => {
    if (!result || startResult.current || !session) return;
    startResult.current = result;
    if (!testSite || !settings.shareGames) return;
    void uploadRecord(session);
  }, [result]);

  // A deck search by a human seat, found or not, opens the search modal (M5e). An undo shortens
  // the log, so its searches are never shown again.
  useEffect(() => {
    if (!session || !state) return;
    if (session.position !== session.record.actions.length) return;
    const seen = seenLog.current;
    seenLog.current = state.log.length;
    if (state.log.length <= seen) return;
    const found = searchResults(session, seen, game.humanSeats);
    if (found.length) setSearches((queue) => [...queue, ...found]);
  }, [session, state]);

  // Each bot action shows a one-line toast, and lights where it landed for the delay time. With
  // "Announce bot plays" on, a banner line replaces the toast.
  const count = session?.record.actions.length ?? 0;
  useEffect(() => {
    // An undo (fewer actions) is no new action; the next action at that index is announced.
    const grew = count > lastCount.current;
    lastCount.current = count;
    if (!grew) announceFrom.current = Math.min(announceFrom.current, count);
    if (!session || count === 0 || session.position !== count || !grew) return;
    const action = session.record.actions[count - 1] as Action;
    const before = session.states[count - 1] as GameState;
    const seat = session.seats[action.player as PlayerId];
    if (seat?.kind !== "bot") return;
    if (settings.announceBotPlays && count - 1 >= announceFrom.current) {
      announceFrom.current = count;
      const line = announce(
        before,
        session.states[count] as GameState,
        action,
        announceNames,
      );
      if (ANNOUNCED_KINDS.includes(line.kind))
        setAnnouncements((queue) => [
          ...queue,
          {
            id: count,
            text: line.text,
            ms: lineMs(line.text, settings.announcePace),
          },
        ]);
    }
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

  // Sound effects: Sound and Volume, and the first click unlocks audio (browsers block it until a
  // user gesture, so nothing plays before).
  useEffect(() => {
    sounds.current.set(settings.volume / 100, settings.sound);
  }, [settings.sound, settings.volume]);
  useEffect(() => {
    const unlock = () => sounds.current.unlock();
    window.addEventListener("pointerdown", unlock, {
      capture: true,
      once: true,
    });
    return () =>
      window.removeEventListener("pointerdown", unlock, { capture: true });
  }, []);
  // Each new step of a live game plays its sounds (both players' actions), timed like its card
  // moves; history views, undos and a loaded record's actions stay silent.
  useEffect(() => {
    const grew = count > heardCount.current;
    heardCount.current = count;
    if (!grew) soundFrom.current = Math.min(soundFrom.current, count);
    if (!session) return;
    const live = session.position === count;
    if (!stepIsHeard({ grew, live, index: count - 1, from: soundFrom.current }))
      return;
    const before = session.states[count - 1] as GameState;
    const after = session.states[count] as GameState;
    sounds.current.playCues(
      stepSounds(
        after.log.slice(before.log.length),
        after.cards,
        settings.animation,
      ),
    );
  }, [count]);

  // The current announcement stays its time (Confirm: until OK or Space), then the next one shows.
  const announcement = announcements[0] ?? null;
  const announcing = announcement !== null;
  const dismissAnnouncement = () => setAnnouncements((queue) => queue.slice(1));
  // Each announcement line shows with a quiet tick.
  useEffect(() => {
    if (announcement) sounds.current.play("announce");
  }, [announcement?.id]);
  // A game that ends here plays a win or loss stinger as its game-over modal opens (after the slam,
  // the cards' moves and any announcement, like the modal).
  const gameOverShowing =
    !!gameOver &&
    !gameOver.closed &&
    (historyAt === null ||
      (!!session && historyAt >= session.states.length - 1)) &&
    !animating &&
    !announcing &&
    !callout;
  useEffect(() => {
    if (!gameOverShowing || !gameOver || !endedHere.current) return;
    endedHere.current = false;
    if (gameOver.key.startsWith("win")) sounds.current.play("win");
    else if (gameOver.key.startsWith("loss")) sounds.current.play("loss");
  }, [gameOverShowing]);
  useEffect(() => {
    if (!announcement || announcement.ms === null) return;
    const timer = setTimeout(dismissAnnouncement, announcement.ms);
    return () => clearTimeout(timer);
  }, [announcement?.id]);

  const decider = game.decider;
  const seat = decider && session ? session.seats[decider] : null;
  const human = seat?.kind === "human" && !!state && !state.result;
  const actions =
    decider && human && state
      ? getLegalActions(state, decider).filter((a) => a.type !== "concede")
      : [];
  const pass = actions.find((a) => a.type === "pass");
  // EBP03-004 (E21): an invasion paid with the deck's top card has no hand card to drag.
  const deckInvade = actions.find((a) => a.type === "invadeFromDeck");
  const choice = state?.pendingChoice ?? null;
  // A choice for the human opens with a soft chime (not one a loaded record stopped at).
  useEffect(() => {
    if (!choice || !human) return;
    if (loadedGame.current && count <= soundFrom.current) return;
    sounds.current.play("choice");
  }, [choice?.id]);
  // Casual undo (M5e): the deciding human takes back their own last action.
  const undoFor = human && decider ? decider : null;
  const undoable = !!undoFor && !!session && canUndoSession(session, undoFor);
  const undo = () => {
    if (!session || !undoFor || !undoable) return;
    setConfirming(null);
    // A confirmed multi-card pick is taken back whole (Tester fixes 1).
    game.setSession(undoConfirmed(session, undoFor as PlayerId));
  };
  const casual = session?.record.mode !== "tournament";

  // Ending the main phase is announced at the table and can't be taken back (Paul, M5h), so
  // every Pass asks first.
  const takePass = () => {
    if (!pass) return;
    // Off the Pass button, so a second Space reaches the dialog instead of clicking it again.
    (document.activeElement as HTMLElement | null)?.blur();
    setConfirming("pass");
  };
  const confirmYes = () => {
    setConfirming(null);
    if (confirming === "pass" && pass) game.takeAction(pass);
    if (confirming === "concede" && concedeFor)
      game.takeAction({ type: "concede", player: concedeFor });
    if (confirming === "showHand") turnOnHand();
  };

  // M13b: Show opponent's hand, at any point of a game. Turning it on asks first (statistics and
  // achievements leave the game out) and flags the record for the whole game; off just hides it.
  const turnOnHand = () => {
    setShowHand(true);
    // During the First / Second pick the game isn't built yet: it starts flagged at action 0.
    if (pending) setPending({ ...pending, showOpponentHand: true });
    else game.setSession((s) => (s ? withOpponentHandShown(s) : s));
  };
  const onShowHand = (on: boolean) => {
    if (!on) setShowHand(false);
    else setConfirming("showHand");
  };

  // Keyboard shortcuts (M5d). None fires while focus is in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, [contenteditable]")) return;
      // The First / Second pick takes its own keys (1, 2, Space, the peek key).
      if (pending) return;
      // A Confirm-pace announcement takes Space (its OK), before anything waiting behind it.
      if (
        e.key === " " &&
        announcement?.ms === null &&
        !reporting &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        dismissAnnouncement();
        return;
      }
      // Input waits while cards move (M5f) and while the combo modal is open (its own keys), and
      // while a Bad Bot! or Report bug popup is open (M13b: its own Esc).
      if (animating || callouts.length > 0 || reporting) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !session) return;
      // The game-over modal takes Space and Esc (M5h #17).
      if (gameOver && !gameOver.closed) {
        if (e.key === " " || e.key === "Escape") {
          e.preventDefault();
          closeGameOver();
        }
        return;
      }
      switch (e.key) {
        case "Escape":
          setOverlay(null);
          setConfirming(null);
          return;
        case "?":
          setOverlay((o) => (o === "shortcuts" ? null : "shortcuts"));
          return;
        case "h":
        case "H":
          if (settings.expandedHand)
            setOverlay((o) => (o === "hand" ? null : "hand"));
          return;
        case "l":
        case "L":
          updateSettings({ logCollapsed: !settings.logCollapsed });
          return;
        case "m":
        case "M":
          updateSettings({ sound: !settings.sound });
          return;
        case "u":
        case "U":
          if (overlay || historyAt !== null || searches.length) return;
          undo();
          return;
        case " ":
          // In "End Main and move to the Counter Phase?", a second Space confirms (M5h).
          if (confirming === "pass") {
            e.preventDefault();
            confirmYes();
            return;
          }
          // Space is the main button: Pass, when no choice, dialog or overlay is open.
          if (
            choice ||
            confirming ||
            overlay ||
            historyAt !== null ||
            searches.length ||
            !pass
          )
            return;
          if (target?.closest("button")) return;
          e.preventDefault();
          takePass();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Human seats confirm every choice, even one with a single option (M5d, M5e).
  const build = (
    setup: Omit<PendingGame, "picker" | "firstCard">,
    picker?: PlayerId,
    card?: 0 | 1,
    firstPickPeeked = false,
  ) =>
    newSession(setup.seed, setup.picked, setup.seats, {
      confirmTargets: true,
      mode: setup.matchMode,
      showOpponentHand: setup.showOpponentHand,
      firstPickPeeked,
      ...(picker && card !== undefined
        ? { firstPick: { player: picker, card } }
        : {}),
    });

  if (!session || !state)
    return (
      <div className="gojisim">
        <ThemeHeader />
        <NewGame
          onStart={(seed, picked, seats, matchMode) => {
            // Show opponent's hand is turned on from the Test Site panel (M13b).
            const setup = {
              seed,
              picked,
              seats,
              matchMode,
              showOpponentHand: false,
            };
            // The human picks; two bots, or the Skip First / Second pick setting, skip the pick.
            const picker = settings.skipFirstPick
              ? undefined
              : (["P1", "P2"] as const).find(
                  (id) => seats[id].kind === "human",
                );
            if (picker) {
              // The pick is a modal over the board (Monarch, Oct 26, 2026): the mats with the
              // decks in place, before the pick (6.3.1.4). Card 0's game tells which card is
              // First; the decks are the same either way.
              const probe = build(setup, picker, 0);
              const firstCard = probe.states[0]?.firstPlayer === picker ? 0 : 1;
              setPending({ ...setup, picker, firstCard });
              game.startSession(prePickSession(probe), true);
            } else game.startSession(build(setup), true);
          }}
          skipFirstPick={settings.skipFirstPick}
          onSkipFirstPick={(skip) => updateSettings({ skipFirstPick: skip })}
          onLoad={async (file) =>
            (await twoHumanSeats(file))
              ? "This record has two human seats (hotseat, removed in M5h). Open it in /debug."
              : game.importRecord(file, true)
          }
        />
      </div>
    );

  // The history view shows an earlier state from the live viewer's side, read-only.
  const viewing =
    historyAt !== null && historyAt < session.states.length - 1
      ? historyAt
      : null;
  const shown = (
    viewing === null ? state : session.states[viewing]
  ) as GameState;
  const model = boardModel(shown, liveBottom ?? "P1", testSite && showHand);

  // Search results and combo callouts wait for a bot announcement, like for animations.
  const search = viewing === null && !announcing ? (searches[0] ?? null) : null;

  // The bottom player plays hand cards on the board (M5b) when it is their decision; otherwise
  // (a bot decides, or the game is over) the hand is locked.
  const locked =
    viewing !== null ||
    decider !== model.bottom ||
    !human ||
    animating ||
    pending !== null;
  const concedeFor = game.humanSeats[0] as PlayerId | undefined;
  // Choice and search modals open once the cards have landed (M5f).
  const showModal =
    !announcing &&
    pending === null &&
    viewing === null &&
    human &&
    choice !== null &&
    decider === model.bottom &&
    !animating;
  // A zone choice shows in the Prompt panel; every other choice is a modal.
  const zoneInPrompt =
    showModal && choice?.kind === "zone" && !search && !callout;
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

  const prompt =
    pending !== null ? (
      // Setup, before the First / Second pick (6.3.1.4): nothing yet says whose turn it is.
      <div className={styles.promptBody} data-testid="setup-prompt">
        Setup: pick First or Second (6.3.1.4).
      </div>
    ) : viewing !== null ? (
      <div className={styles.promptBody} data-testid="history-prompt">
        <div>
          Viewing the board on turn {shown.turn} (
          {STEP_NAMES[stepPhase(shown.currentStep)]}). Read-only.
        </div>
        <button
          type="button"
          className={styles.button}
          data-testid="back-to-live"
          onClick={() => setHistoryAt(null)}
        >
          Back to live
        </button>
      </div>
    ) : state.result ? (
      <div className={styles.promptBody}>
        <div data-testid="game-over">
          Game over: {state.result.winner ? name(state.result.winner) : "draw"}{" "}
          ({state.result.reason})
        </div>
        <a href="/play">New game</a>
      </div>
    ) : (
      <div className={styles.promptBody}>
        <div className={styles.promptRow}>
          <span data-testid="prompt-step">
            <strong>{STEP_NAMES[stepPhase(state.currentStep)]}</strong> ·{" "}
            {name(state.turnPlayer) === "You"
              ? "your turn"
              : `${name(state.turnPlayer)}'s turn`}
          </span>
          <span className={styles.muted} data-testid="turn-flags">
            Invasion {flags.invasionUsed ? "used" : "unused"} · Monster{" "}
            {flags.monsterPlayed ? "played" : "not played"}
          </span>
        </div>
        <div className={styles.promptRow}>
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
          ) : zoneInPrompt ? (
            <ChoiceModal
              key={choice?.id}
              state={state}
              heading={choiceHeading(state, name)}
              source={choiceSource(state)}
              actions={actions}
              manualCards={[]}
              onAction={game.takeAction}
              labelOf={(action) => actionLabel(state, action)}
              model={model}
              onUndo={undoable ? undo : undefined}
              name={name}
            />
          ) : choice && showModal ? (
            <div className={styles.muted} data-testid="prompt-choice">
              {choiceHeading(state, name)}
            </div>
          ) : (
            <>
              {deckInvade && (
                <button
                  type="button"
                  className={styles.button}
                  data-testid="invade-from-deck"
                  title={actionLabel(state, deckInvade)}
                  onClick={() => game.takeAction(deckInvade)}
                >
                  Invade with your deck&apos;s top card
                </button>
              )}
              {pass && (
                <button
                  type="button"
                  className={`${styles.button} ${styles.passButton}`}
                  data-testid="pass"
                  onClick={takePass}
                >
                  Pass [Space]
                </button>
              )}
            </>
          )}
          {casual && human && decider === model.bottom && (
            <button
              type="button"
              className={styles.button}
              data-testid="undo"
              disabled={!undoable}
              title={
                undoable
                  ? "Take back your last action [U]"
                  : "Nothing to undo: undo stops at a draw, search, reveal, shuffle, random result or opponent action"
              }
              onClick={undo}
            >
              Undo [U]
            </button>
          )}
          {concedeFor && (
            <button
              type="button"
              className={styles.concedeButton}
              data-testid="concede"
              onClick={() => setConfirming("concede")}
            >
              Concede
            </button>
          )}
        </div>
      </div>
    );

  // M13b: the bot action Bad Bot! and Good Bot! mark (its latest), and the popups' submit handlers.
  const badBotMove = latestBotMove(session);
  const remember = (reporter: string) =>
    reporter !== settings.reporterName &&
    updateSettings({ reporterName: reporter });
  const sendFeedback = async (
    kind: "bad" | "good",
    reporter: string,
    text: string,
  ) => {
    if (!badBotMove) return;
    remember(reporter);
    setReporting(null);
    const entry = {
      kind,
      actionIndex: badBotMove.actionIndex,
      label: `${badBotMove.label} (${badBotMove.when})`,
      text,
      reporter,
      at: new Date().toISOString(),
    };
    const next = withFeedback(session, entry);
    game.setSession((s) => (s ? withFeedback(s, entry) : s));
    // The game goes on while it sends; a failed send rides along with the finished game.
    setNote("Sending…");
    setNote(
      (await uploadRecord(next))
        ? "Thanks, sent."
        : "Couldn't send. It will be sent with the finished game, and Report bug includes it.",
    );
  };
  // Report bug sends the record with the note, like Bad Bot!; a failed send, or sharing off,
  // downloads the file for the tester to send to Paul instead.
  const sendBugReport = async (reporter: string, text: string) => {
    remember(reporter);
    setReporting(null);
    // #105: the open choice as shown, the last answer (even one that threw) and the last error.
    const shown = session.states[session.position] as GameState;
    const choice = shown.pendingChoice;
    const answer = getLastAnswer();
    const error = getLastError();
    const entry = {
      actionIndex: session.position,
      text,
      reporter,
      at: new Date().toISOString(),
      ...(choice
        ? {
            choice: {
              kind: choice.kind,
              heading: choiceHeading(shown, name),
              options: choice.options.map((o) =>
                actionLabel(shown, {
                  type: "choose",
                  player: choice.player,
                  choiceId: choice.id,
                  optionId: o.id,
                }),
              ),
            },
          }
        : {}),
      ...(answer ? { lastAnswer: answer } : {}),
      ...(error ? { lastError: error } : {}),
    };
    const next = withBugReport(session, entry);
    game.setSession((s) => (s ? withBugReport(s, entry) : s));
    if (!settings.shareGames) {
      downloadRecord(next);
      setNote(
        "Saved this game's record. Send the file to Paul with a few words about what went wrong.",
      );
      return;
    }
    setNote("Sending…");
    if (await uploadRecord(next)) {
      setNote("Thanks, sent.");
      return;
    }
    downloadRecord(next);
    setNote("Couldn't send. The game file was downloaded; send it to Paul.");
  };
  const settingsPanel = (
    <>
      <details className={styles.settings}>
        <summary data-testid="settings">Settings</summary>
        <div className={styles.settingsPanel}>
          <label>
            Bot delay{" "}
            <input
              type="range"
              min={0}
              max={3000}
              step={100}
              data-testid="setting-bot-delay"
              value={settings.botDelay}
              onChange={(e) =>
                updateSettings({ botDelay: Number(e.target.value) })
              }
            />{" "}
            {settings.botDelay} ms
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="setting-announce"
              checked={settings.announceBotPlays}
              onChange={(e) => {
                updateSettings({ announceBotPlays: e.target.checked });
                if (!e.target.checked) setAnnouncements([]);
              }}
            />{" "}
            Announce bot plays
          </label>
          {settings.announceBotPlays && (
            <label>
              Pace{" "}
              <input
                type="range"
                min={0}
                max={PACE_CONFIRM}
                step={1}
                data-testid="setting-announce-pace"
                value={settings.announcePace}
                onChange={(e) =>
                  updateSettings({ announcePace: Number(e.target.value) })
                }
              />{" "}
              <span data-testid="announce-pace-label">
                {paceLabel(settings.announcePace)}
              </span>
            </label>
          )}
          <label>
            <input
              type="checkbox"
              data-testid="setting-sound"
              checked={settings.sound}
              onChange={(e) => updateSettings({ sound: e.target.checked })}
            />{" "}
            Sound [M]
          </label>
          <label>
            Volume{" "}
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              data-testid="setting-volume"
              value={settings.volume}
              disabled={!settings.sound}
              onChange={(e) =>
                updateSettings({ volume: Number(e.target.value) })
              }
            />{" "}
            {settings.volume}%
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="setting-rules"
              checked={settings.showRules}
              onChange={(e) => updateSettings({ showRules: e.target.checked })}
            />{" "}
            Show rule numbers in the log
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="setting-show-undone"
              checked={settings.showUndone}
              onChange={(e) => updateSettings({ showUndone: e.target.checked })}
            />{" "}
            Show undone actions
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="setting-invade-arrow"
              checked={settings.invadeArrow}
              onChange={(e) =>
                updateSettings({ invadeArrow: e.target.checked })
              }
            />{" "}
            Invade arrow
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="setting-expanded-hand"
              checked={settings.expandedHand}
              onChange={(e) =>
                updateSettings({ expandedHand: e.target.checked })
              }
            />{" "}
            Expanded hand on H
          </label>
          <label>
            Theme{" "}
            <select
              data-testid="setting-theme"
              value={settings.theme}
              onChange={(e) =>
                updateSettings({ theme: e.target.value as Theme })
              }
            >
              {THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {THEME_NAMES[theme]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Animation speed{" "}
            <select
              data-testid="setting-animation"
              value={settings.animation}
              onChange={(e) =>
                updateSettings({ animation: e.target.value as AnimationSpeed })
              }
            >
              <option value="off">Off</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="setting-turn-glow"
              checked={settings.turnGlow}
              onChange={(e) => updateSettings({ turnGlow: e.target.checked })}
            />{" "}
            Turn glow
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="setting-combo-callouts"
              checked={settings.comboCallouts}
              onChange={(e) =>
                updateSettings({ comboCallouts: e.target.checked })
              }
            />{" "}
            Combo callouts
          </label>
          <fieldset
            className={styles.matSettings}
            data-testid="mat-settings"
            data-mat-stored={customMat.stored ? "true" : "false"}
          >
            <legend>Mat image</legend>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              data-testid="mat-upload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) customMat.upload(file);
                e.target.value = "";
              }}
            />
            <div className={styles.muted}>
              PNG, JPG or WebP, up to {MAT_MAX_BYTES / 1024 / 1024} MB.
            </div>
            {customMat.error && (
              <div className={styles.error} data-testid="mat-error">
                {customMat.error}
              </div>
            )}
            {customMat.mat && (
              <>
                {(
                  [
                    ["scale", "Scale", 25, 300],
                    ["x", "X position", 0, 100],
                    ["y", "Y position", 0, 100],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label key={key}>
                    {label}{" "}
                    <input
                      type="range"
                      min={min}
                      max={max}
                      data-testid={`mat-${key}`}
                      value={customMat.mat?.[key] ?? 0}
                      onChange={(e) =>
                        customMat.adjust({ [key]: Number(e.target.value) })
                      }
                    />{" "}
                    {customMat.mat?.[key]}%
                  </label>
                ))}
                <button
                  type="button"
                  className={styles.button}
                  data-testid="mat-reset"
                  onClick={customMat.reset}
                >
                  Reset to default
                </button>
              </>
            )}
          </fieldset>
          <div className={styles.muted}>Press ? for the shortcut list.</div>
        </div>
      </details>
      {/* M13b: the Test Site panel (Bad Bot!, Report bug, Test settings), only while the server
        says the Test Site is on. During the First / Second pick no game record exists yet, so its
        buttons wait; the opponent's hand can be turned on already. */}
      {testSite && (
        <TestSitePanel
          settings={settings}
          updateSettings={updateSettings}
          badBotReady={!pending && badBotMove !== null}
          onBadBot={() => setReporting("badBot")}
          onGoodBot={() => setReporting("goodBot")}
          reportReady={!pending}
          onReportBug={() => setReporting("bug")}
          note={note}
          canShowHand={
            PLAYER_IDS.some((id) => session.seats[id].kind === "human") &&
            PLAYER_IDS.some((id) => session.seats[id].kind === "bot")
          }
          showHand={showHand}
          onShowHand={onShowHand}
        />
      )}
    </>
  );
  const handCards =
    model.view.players.find((p) => p.id === model.bottom)?.hand.cards ?? [];

  const manualCards = [...visibleCards(model).values()].map((card) => ({
    card,
    label: `${card.owner}: ${state.cards[card.cardId]?.name ?? card.cardId}`,
  }));
  // M5h #18: the bottom player's deck first, then the other; a bot's side adds its level.
  const fightSide = (id: PlayerId | undefined): FightSide => {
    const seat = id ? session.seats[id] : undefined;
    return {
      deck: id ? session.record.deckNames?.[id] : undefined,
      bot:
        seat?.kind === "bot"
          ? `Bot (${difficultyName(seat.difficulty)})`
          : undefined,
    };
  };
  const fightCard = (
    <FightCard
      you={fightSide(model.bottom as PlayerId)}
      opp={fightSide(PLAYER_IDS.find((id) => id !== model.bottom))}
    />
  );
  return (
    // A collapsed log frees its column, so --card-h recomputes on this wrapper (M5f).
    <div
      className={`gojisim${settings.logCollapsed ? " log-collapsed" : ""}`}
      // The record's flags that keep a game out of statistics (M11), for tests and bug reports.
      data-first-pick-peeked={
        session.record.firstPickPeeked ? "true" : undefined
      }
      data-show-opponent-hand={
        session.record.showOpponentHand ? "true" : undefined
      }
    >
      <ThemeHeader />
      <BoardView
        model={model}
        prompt={prompt}
        actions={locked ? [] : actions}
        locked={locked}
        onAction={game.takeAction}
        labelOf={(action) => actionLabel(state, action)}
        zoneChoice={viewing === null ? zoneChoice : new Map()}
        highlight={
          viewing === null ? (botMove?.highlight ?? new Set()) : new Set()
        }
        name={name}
        settings={settingsPanel}
        step={viewing === null ? session.position : null}
        animation={settings.animation}
        onAnimating={setAnimating}
        onSlamImpact={() => sounds.current.playCues(slamCues(0))}
        turnGlow={settings.turnGlow}
        picking={pending !== null}
        invadeArrow={settings.invadeArrow}
        mat={customMat.view}
        deckWarnings={deckWarnings}
        log={
          <BattleLog
            lines={
              settings.showUndone
                ? lines
                : lines.filter((l) => l.kind !== "undone")
            }
            viewer={liveBottom ?? undefined}
            onRule={setRulesAt}
            viewing={viewing}
            showRules={settings.showRules}
            onSelect={(position) =>
              setHistoryAt(
                position >= session.states.length - 1 ? null : position,
              )
            }
          />
        }
        fightCard={fightCard}
        logCollapsed={settings.logCollapsed}
        onToggleLog={() =>
          updateSettings({ logCollapsed: !settings.logCollapsed })
        }
      />
      {viewing !== null && (
        <div className={styles.historyBanner} data-testid="history-banner">
          <span>History: turn {shown.turn}, read-only.</span>
          <button
            type="button"
            className={`${styles.button} ${styles.backToLive}`}
            data-testid="history-back-to-live"
            onClick={() => setHistoryAt(null)}
          >
            Back to live
          </button>
        </div>
      )}
      {overlay === "hand" && (
        // Read-only (Paul's rule): clicking a card here does nothing; H or Esc closes it.
        <div className={styles.modalBackdrop} data-testid="expanded-hand">
          <div className={styles.expandedHand}>
            {handCards.map((card) => {
              const data = model.view.cards[card.cardId];
              // Strategy cards turn 90° clockwise here too (M5e).
              const rotated = data?.type === "Strategy";
              return (
                <div
                  key={card.instanceId}
                  className={`${styles.expandedCard}${rotated ? ` ${styles.rotated}` : ""}`}
                  data-testid="expanded-card"
                  data-rotated={rotated ? "true" : undefined}
                  data-card-id={data?.id}
                >
                  <div className={styles.cardFallback}>{data?.name}</div>
                  <img
                    className={styles.cardImage}
                    src={`/cards/${card.cardId}-full.webp`}
                    alt={data?.name ?? ""}
                    draggable={false}
                    onError={(e) => {
                      // Missing image: show the name instead.
                      e.currentTarget.style.visibility = "hidden";
                      const fallback = e.currentTarget
                        .previousElementSibling as HTMLElement | null;
                      if (fallback) fallback.style.visibility = "visible";
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className={styles.muted}>H or Esc closes the hand.</div>
        </div>
      )}
      {overlay === "shortcuts" && (
        <div
          className={styles.modalBackdrop}
          data-testid="shortcut-list"
          onClick={() => setOverlay(null)}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeading}>Keyboard shortcuts</div>
            <table className={styles.shortcuts}>
              <tbody>
                {SHORTCUTS.map(([key, what]) => (
                  <tr key={key}>
                    <td>
                      <kbd>{key}</kbd>
                    </td>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {pending && (
        <FirstPick
          seed={pending.seed}
          picker={pending.picker}
          firstCard={pending.firstCard}
          canPeek={pending.matchMode === "casual"}
          build={(card, peeked) => build(pending, pending.picker, card, peeked)}
          onStart={(next) => {
            setPending(null);
            game.startSession(next, true);
          }}
        />
      )}
      {search && !animating && (
        <SearchModal
          key={search.seq}
          result={search}
          cards={state.cards}
          model={model}
          onConfirm={() => setSearches((queue) => queue.slice(1))}
        />
      )}
      {showModal &&
        choice?.kind !== "zone" &&
        !(search && !animating) &&
        !callout && (
          <ChoiceModal
            key={choice?.id}
            state={state}
            heading={choiceHeading(state, name)}
            source={choiceSource(state)}
            actions={actions}
            manualCards={manualCards}
            onAction={game.takeAction}
            labelOf={(action) => actionLabel(state, action)}
            model={model}
            onConfirmPicks={(ids, done) =>
              choice && game.takeChoices(choice.player as PlayerId, ids, done)
            }
            onUndo={undoable ? undo : undefined}
          />
        )}
      {callout &&
        comboOf(callout) &&
        !animating &&
        !announcing &&
        !(search && !animating) && (
          <ComboModal
            key={`${callout.actionIndex}-${callout.comboId}-${callout.player}`}
            combo={comboOf(callout) as Combo}
            who={comboWho(callout.player)}
            cards={callout.cards.map((n) => cardByNumber(state, n))}
            model={model}
            shake={settings.animation !== "off"}
            onClose={closeCallout}
          />
        )}
      {gameOver &&
        !gameOver.closed &&
        viewing === null &&
        !animating &&
        !announcing &&
        !callout && (
          <div className={styles.modalBackdrop} data-testid="game-over-modal">
            <div className={styles.modal}>
              <div
                className={styles.modalHeading}
                data-testid="game-over-heading"
              >
                {outcomeHeading(gameOver.key)}
              </div>
              <p data-testid="game-over-line" data-outcome={gameOver.key}>
                {gameOver.line}
              </p>
              <div className={styles.modalButtons}>
                <button
                  type="button"
                  className={styles.button}
                  data-testid="game-over-close"
                  onClick={closeGameOver}
                >
                  Close [Space]
                </button>
              </div>
            </div>
          </div>
        )}
      {(reporting === "badBot" || reporting === "goodBot") && badBotMove && (
        <ReportModal
          key={reporting}
          kind={reporting}
          move={badBotMove}
          name={settings.reporterName}
          sharingOff={!settings.shareGames}
          onSubmit={(reporter, text) =>
            void sendFeedback(
              reporting === "goodBot" ? "good" : "bad",
              reporter,
              text,
            )
          }
          onCancel={() => setReporting(null)}
          onReportBug={() => setReporting("bug")}
        />
      )}
      {reporting === "bug" && (
        <ReportModal
          kind="bug"
          name={settings.reporterName}
          sharingOff={!settings.shareGames}
          onSubmit={(reporter, text) => void sendBugReport(reporter, text)}
          onCancel={() => setReporting(null)}
        />
      )}
      {rulesAt && <RulesPanel at={rulesAt} onClose={() => setRulesAt(null)} />}
      {botMove && !settings.announceBotPlays && (
        <div className={styles.toast} data-testid="bot-toast">
          {botMove.text}
        </div>
      )}
      {settings.announceBotPlays && (
        // Always in the page while the setting is on, so screen readers follow it (polite).
        <div
          className={styles.announceRegion}
          aria-live="polite"
          data-testid="bot-announcement-region"
        >
          {announcement && (
            <div
              key={announcement.id}
              className={styles.announce}
              data-testid="bot-announcement"
            >
              <span>{announcement.text}</span>
              {announcement.ms === null && (
                <button
                  type="button"
                  className={styles.button}
                  data-testid="announce-ok"
                  onClick={dismissAnnouncement}
                >
                  OK [Space]
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {confirming && (
        <div className={styles.modalBackdrop} data-testid="confirm-dialog">
          <div className={styles.modal}>
            <div className={styles.modalHeading}>
              {confirming === "pass"
                ? "End Main and move to the Counter Phase?"
                : confirming === "showHand"
                  ? "Show the bot's hand?"
                  : "Concede the game?"}
            </div>
            {confirming === "showHand" && (
              <p data-testid="show-hand-warning">
                This game will be left out of your statistics, and achievement
                progress won&apos;t count for it.
              </p>
            )}
            <div className={styles.modalButtons}>
              <button
                type="button"
                className={styles.button}
                data-testid="confirm-yes"
                onClick={confirmYes}
              >
                {confirming === "pass"
                  ? "Confirm [Space]"
                  : confirming === "showHand"
                    ? "Show hand"
                    : "Concede"}
              </button>
              <button
                type="button"
                className={styles.choiceButton}
                data-testid="confirm-cancel"
                onClick={() => setConfirming(null)}
              >
                Cancel [Esc]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import {
  type Action,
  advanceToDecision,
  applyAction,
  type GameState,
  getLegalActions,
  type PlayerId,
} from "@gojisim/engine";
import { counters } from "./rules";

/** `action` played out, the bot's own choices answered first-option, or `null`. */
export function playOut(
  state: GameState,
  action: Action,
  me: PlayerId,
): GameState | null {
  try {
    let s = advanceToDecision(applyAction(state, action));
    for (let i = 0; i < 20 && s.pendingChoice?.player === me; i++) {
      const first = getLegalActions(s, me).find((a) => a.type !== "concede");
      if (!first) break;
      s = advanceToDecision(applyAction(s, first));
    }
    return s;
  } catch {
    return null;
  }
}

/** The most plays-and-choices `counterWithin` looks at. */
const NODES = 120;

/**
 * Whether the counter is made in `state`, or up to `plays` battle card plays this turn make it
 * (each card and zone tried once; a small search, at most `NODES` states). For plan lines that
 * look a few plays ahead (a push then two battle cards).
 */
export function counterWithin(
  state: GameState,
  me: PlayerId,
  plays = 3,
): boolean {
  let nodes = NODES;
  const search = (t: GameState, left: number): boolean => {
    if (nodes-- <= 0) return false;
    if (counters(t, me)) return true;
    if (left === 0 || t.turnPlayer !== me || t.pendingChoice) return false;
    const hand = t.players.find((p) => p.id === me)?.hand ?? [];
    const seen = new Set<string>();
    for (const a of getLegalActions(t, me)) {
      if (a.type !== "playBattle") continue;
      const c = hand.find((h) => h.instanceId === a.cardInstanceId);
      const key = `${c ? t.cards[c.cardId]?.deckCardNumber : ""}@${a.zone}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const u = playOut(t, a, me);
      if (u && search(u, left - 1)) return true;
    }
    return false;
  };
  return search(state, plays);
}

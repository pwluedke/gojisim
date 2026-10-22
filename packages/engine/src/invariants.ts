import { getLegalActions } from "./actions";
import type { GameRecord } from "./record";
import type { CardInstance, GameState, PlayerState } from "./types";
import { ZONE_NUMBERS } from "./types";
import { getPlayerView } from "./view";

function cardsOf(player: PlayerState): CardInstance[] {
  return [
    ...player.monsterDeck,
    ...player.invadingMonsterZone,
    ...player.deck,
    ...player.hand,
    ...player.discard,
    ...ZONE_NUMBERS.flatMap((z) => player.zones[z].flat()),
    ...player.strategyZones.flat().map((p) => p.card),
  ];
}

/** Cards each player presented at setup (6.3.1.1), from the setup log. */
function presentedCounts(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of state.log) {
    if (entry.type !== "presentDecks" || entry.player === null) continue;
    counts.set(
      entry.player,
      Number(entry.payload["monsterDeck"]) + Number(entry.payload["mainDeck"]),
    );
  }
  return counts;
}

/**
 * Checks game state invariants at a decision point (after `advanceToDecision`). Returns a list of
 * violations; empty means the state is sound. Used by the stress test (spec case 52).
 */
export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];
  const running = state.result === null;

  // Card count is conserved: what each player owns across all areas, plus their cards in the
  // shared resolution area, equals the deck they presented.
  const presented = presentedCounts(state);
  for (const player of state.players) {
    const inResolution = state.resolutionArea.filter(
      (c) => c.owner === player.id,
    ).length;
    const misplaced = cardsOf(player).filter(
      (c) => c.owner !== player.id,
    ).length;
    const owned = state.players
      .flatMap(cardsOf)
      .filter((c) => c.owner === player.id).length;
    const expected = presented.get(player.id);
    if (owned + inResolution !== expected) {
      problems.push(
        `card count: ${player.id} has ${owned} + ${inResolution} in resolution, expected ${expected}`,
      );
    }
    if (misplaced > 0)
      problems.push(
        `card count: ${misplaced} cards in ${player.id}'s areas belong to the opponent`,
      );
  }

  // No card instance id appears twice.
  const ids = [...state.players.flatMap(cardsOf), ...state.resolutionArea].map(
    (c) => c.instanceId,
  );
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`instance id ${id} appears twice`);
    seen.add(id);
  }

  for (const player of state.players) {
    // Monster position 1 to 8; the invading monster stack is not empty while the game runs.
    if (
      running &&
      (player.monsterPosition === null ||
        player.monsterPosition < 1 ||
        player.monsterPosition > 8)
    ) {
      problems.push(
        `${player.id} monster position is ${player.monsterPosition}`,
      );
    }
    if (running && player.invadingMonsterZone.length === 0)
      problems.push(`${player.id} has no invading monster`);
    // Rage is never below 0 (3.4.4).
    if (player.rage < 0 || !Number.isInteger(player.rage))
      problems.push(`${player.id} rage is ${player.rage}`);
    // At most 1 stack per zone and 1 card per strategy zone once a check timing has finished (11.5).
    if (state.checkTiming === null) {
      for (const zone of ZONE_NUMBERS) {
        if (player.zones[zone].length > 1)
          problems.push(
            `${player.id} zone ${zone} holds ${player.zones[zone].length} stacks`,
          );
      }
      player.strategyZones.forEach((zone, i) => {
        if (zone.length > 1)
          problems.push(
            `${player.id} strategy zone ${i + 1} holds ${zone.length} cards`,
          );
      });
    }
  }

  // getLegalActions is empty exactly when the game is over; while it runs, whoever has the
  // decision has something to do besides conceding.
  for (const player of state.players) {
    const actions = getLegalActions(state, player.id);
    if (!running && actions.length > 0)
      problems.push(`${player.id} has actions after the result`);
    if (running && actions.length === 0)
      problems.push(`${player.id} has no actions while the game runs`);
  }
  if (running) {
    const decider = state.pendingChoice?.player ?? state.turnPlayer;
    const atDecision = state.pendingChoice !== null || state.step === "7.3.2";
    const real = getLegalActions(state, decider).filter(
      (a) => a.type !== "concede",
    );
    if (atDecision && real.length === 0)
      problems.push(`${decider} has a decision but no actions`);
  }

  // A data ability is part-way through resolving only while it waits for its own choice.
  const effectChoice =
    state.pendingChoice?.kind === "target" ||
    state.pendingChoice?.kind === "zone";
  if ((state.resolution !== null) !== effectChoice)
    problems.push(
      `resolution ${state.resolution ? "in progress" : "missing"} with choice ${state.pendingChoice?.kind ?? "none"}`,
    );

  // getPlayerView never leaks the opponent's hand, monster deck or any deck order.
  for (const viewer of [...state.players.map((p) => p.id), "spectator"]) {
    const view = getPlayerView(state, viewer);
    // Every instance id the view mentions, collected once (ids look like "c123").
    const mentioned = new Set(JSON.stringify(view).match(/"c\d+"/g) ?? []);
    view.players.forEach((p, i) => {
      const own = p.id === viewer;
      const real = state.players[i] as PlayerState;
      if (p.deck.cards !== null)
        problems.push(`view(${viewer}) shows ${p.id}'s deck`);
      if (!own && p.hand.cards !== null)
        problems.push(`view(${viewer}) shows ${p.id}'s hand`);
      if (!own && p.monsterDeck.cards !== null)
        problems.push(`view(${viewer}) shows ${p.id}'s monster deck`);
      const hidden = [
        ...real.deck,
        ...(own ? [] : [...real.hand, ...real.monsterDeck]),
      ];
      const leaked = hidden.filter((c) => mentioned.has(`"${c.instanceId}"`));
      if (leaked.length > 0)
        problems.push(
          `view(${viewer}) leaks ${leaked.length} hidden instance ids of ${p.id}`,
        );
    });
  }
  return problems;
}

/** A loop report: a game record (it loads in /debug) plus where the loop was found. */
export interface LoopReport extends GameRecord {
  kind: "gojisim-loop-report";
  /** Where the record's last action leads; the viewer opens there. */
  position: number;
  loop: NonNullable<GameState["loop"]>;
  log: GameState["log"];
  state: GameState;
}

/**
 * Builds the infinite-loop report for a game that ended in a loop draw (Paul's ruling): seed,
 * both decks, every action, the full log and the state at detection. Pure: the caller writes it.
 */
export function buildLoopReport(
  record: GameRecord,
  state: GameState,
): LoopReport {
  if (state.loop === null)
    throw new Error("No loop was detected in this state");
  return {
    kind: "gojisim-loop-report",
    ...record,
    position: record.actions.length,
    loop: state.loop,
    log: state.log,
    state,
  };
}

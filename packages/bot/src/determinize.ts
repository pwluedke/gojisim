import type { Card } from "@gojisim/cards";
import {
  type CardInstance,
  type GameState,
  type PlayerId,
  type PlayerState,
  type PlayerView,
  ZONE_NUMBERS,
} from "@gojisim/engine";
import type { Knowledge } from "./types";

/**
 * Builds a full game state that matches everything the viewer can see, with the hidden parts
 * filled at random from the cards not yet accounted for (M6a): the opponent's hand and monster
 * deck, and both decks' order. Public areas, the viewer's own hand and own monster deck are
 * copied exactly, so `getPlayerView(result, viewer)` equals `view`.
 *
 * Accounting per player, from the public decklists (6.3.1.1):
 * - monster deck = the presented monster deck minus the monsters the log shows leaving it
 *   (6.3.1.6 setup, 5.15.1.2 next monster);
 * - hidden main-deck cards = the presented main deck minus every main-deck card the viewer can
 *   see (zones and stacks, strategy zones, the invading monster, the discard pile, revealed cards,
 *   their own hand, cards their own private choice showed them).
 */
export function determinize(
  view: PlayerView,
  knowledge: Knowledge,
  rng: () => number,
): GameState {
  const viewer = view.viewer;
  if (viewer === "spectator")
    throw new Error("determinize needs a player's view");
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  // Every card in either decklist, plus any card the view names (tokens, fixtures).
  const cards: Record<string, Card> = { ...clone(view.cards) };
  for (const deck of Object.values(knowledge.decks))
    for (const card of [...deck.monsterDeck, ...deck.mainDeck])
      cards[card.id] = card;

  // Fresh instance ids for filled cards start above every id the view mentions.
  let nextId =
    Math.max(
      0,
      ...(JSON.stringify(view).match(/"c(\d+)"/g) ?? []).map((m) =>
        Number(m.slice(2, -1)),
      ),
    ) + 1;
  const fresh = (cardId: number, owner: PlayerId): CardInstance => ({
    instanceId: `c${nextId++}`,
    cardId,
    owner,
  });
  const shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j] as T, items[i] as T];
    }
    return items;
  };
  /** Removes each id of `taken` once from the multiset `pool` (in place); throws if missing. */
  const subtract = (pool: number[], taken: number[], what: string) => {
    for (const id of taken) {
      const index = pool.indexOf(id);
      if (index < 0)
        throw new Error(`determinize: card ${id} is not in ${what}`);
      pool.splice(index, 1);
    }
  };

  // Monsters that left each monster deck, from the public log.
  const leftMonsterDeck = new Map<PlayerId, number[]>();
  for (const entry of view.log)
    if (
      (entry.type === "setInvadingMonster" ||
        entry.type === "newInvadingMonster") &&
      entry.player !== null
    ) {
      const list = leftMonsterDeck.get(entry.player) ?? [];
      list.push(Number(entry.payload["cardId"]));
      leftMonsterDeck.set(entry.player, list);
    }

  // Hidden cards the viewer knows: revealed cards (5.10), and cards its own private choice or
  // paused resolution shows (a searched deck).
  const visibleIds = new Set<string>();
  const known: Map<
    string,
    {
      card: CardInstance;
      player: PlayerId;
      area: "hand" | "deck" | "monsterDeck";
    }
  > = new Map();
  for (const r of view.revealed)
    known.set(r.card.instanceId, {
      card: clone(r.card),
      player: r.player,
      area: r.area,
    });

  const players = view.players.map((pv): PlayerState => {
    const shown = <T>(area: { cards: T[] | null }): T[] =>
      clone(area.cards ?? []);
    const zones = {} as PlayerState["zones"];
    for (const zone of ZONE_NUMBERS) zones[zone] = shown(pv.zones[zone]);
    const player: PlayerState = {
      id: pv.id,
      zones,
      strategyZones: [shown(pv.strategyZones[0]), shown(pv.strategyZones[1])],
      monsterDeck: shown(pv.monsterDeck),
      invadingMonsterZone: shown(pv.invadingMonsterZone),
      monsterPosition: pv.monsterPosition,
      deck: [],
      hand: shown(pv.hand),
      discard: shown(pv.discard),
      rage: pv.rage,
    };
    for (const c of [
      ...ZONE_NUMBERS.flatMap((z) => player.zones[z].flat()),
      ...player.strategyZones.flat().map((p) => p.card),
      ...player.monsterDeck,
      ...player.invadingMonsterZone,
      ...player.hand,
      ...player.discard,
    ])
      visibleIds.add(c.instanceId);
    return player;
  });
  for (const c of view.resolutionArea.cards ?? []) visibleIds.add(c.instanceId);

  // The viewer's own private choice and paused resolution name cards of its own deck.
  const ownCardIds = new Map<string, number>();
  for (const o of view.pendingChoice?.options ?? [])
    if (o.cardId !== null && /^c\d+$/.test(o.id))
      ownCardIds.set(o.id, o.cardId);
  for (const binding of Object.values(view.resolution?.bindings ?? {}))
    if (binding.kind === "cards")
      for (const c of binding.cards) ownCardIds.set(c.instanceId, c.cardId);
  for (const id of [
    ...(view.resolution?.chosen ?? []),
    view.resolution?.subject ?? "",
  ])
    if (id && !ownCardIds.has(id) && /^c\d+$/.test(id) && !visibleIds.has(id))
      throw new Error(`determinize: card ${id} the viewer chose is unknown`);
  for (const [id, cardId] of ownCardIds)
    if (!visibleIds.has(id) && !known.has(id))
      known.set(id, {
        card: { instanceId: id, cardId, owner: viewer },
        player: viewer,
        area: "deck",
      });

  for (const player of players) {
    const pv = view.players.find(
      (p) => p.id === player.id,
    ) as PlayerView["players"][number];
    const list = knowledge.decks[player.id];
    if (!list) throw new Error(`determinize: no decklist for ${player.id}`);
    const isViewer = player.id === viewer;
    const mine = [...known.values()].filter((k) => k.player === player.id);
    for (const k of mine) visibleIds.add(k.card.instanceId);

    // Monster deck: exact for the viewer; otherwise the presented monster deck minus what left.
    const left = leftMonsterDeck.get(player.id) ?? [];
    if (!isViewer) {
      const pool = list.monsterDeck.map((c) => c.id);
      subtract(pool, left, `${player.id}'s monster deck`);
      const revealedHere = mine.filter((k) => k.area === "monsterDeck");
      subtract(
        pool,
        revealedHere.map((k) => k.card.cardId),
        `${player.id}'s monster deck`,
      );
      if (pool.length + revealedHere.length !== pv.monsterDeck.count)
        throw new Error(
          `determinize: ${player.id}'s monster deck has ${pv.monsterDeck.count} cards, ${pool.length + revealedHere.length} accounted for`,
        );
      player.monsterDeck = shuffle([
        ...revealedHere.map((k) => k.card),
        ...pool.map((id) => fresh(id, player.id)),
      ]);
    }

    // Main-deck cards still hidden: the presented main deck minus every visible main-deck card.
    const visibleCards = [
      ...ZONE_NUMBERS.flatMap((z) => player.zones[z].flat()),
      ...player.strategyZones.flat().map((p) => p.card),
      ...player.invadingMonsterZone,
      ...player.discard,
      ...(view.resolutionArea.cards ?? []).filter((c) => c.owner === player.id),
      ...(isViewer ? player.hand : []),
      ...mine
        .filter((k) => !(isViewer && k.area === "hand"))
        .filter((k) => k.area !== "monsterDeck")
        .map((k) => k.card),
    ]
      // Tokens aren't deck cards (9.1).
      .filter((c) => view.cards[c.cardId]?.type !== "Token")
      .map((c) => c.cardId);
    const mainVisible = [...visibleCards];
    // Monsters that came from the monster deck are not main-deck cards.
    subtract(mainVisible, left, `${player.id}'s visible cards`);
    const hidden = list.mainDeck.map((c) => c.id);
    subtract(hidden, mainVisible, `${player.id}'s main deck`);

    const knownHand = isViewer
      ? []
      : mine.filter((k) => k.area === "hand").map((k) => k.card);
    const knownDeck = mine.filter((k) => k.area === "deck").map((k) => k.card);
    const handNeeded = isViewer ? 0 : pv.hand.count - knownHand.length;
    const deckNeeded = pv.deck.count - knownDeck.length;
    if (hidden.length !== handNeeded + deckNeeded)
      throw new Error(
        `determinize: ${player.id} has ${handNeeded} hidden hand and ${deckNeeded} hidden deck cards, ${hidden.length} accounted for`,
      );
    shuffle(hidden);
    if (!isViewer)
      player.hand = [
        ...knownHand,
        ...hidden.slice(0, handNeeded).map((id) => fresh(id, player.id)),
      ];
    player.deck = shuffle([
      ...knownDeck,
      ...hidden.slice(handNeeded).map((id) => fresh(id, player.id)),
    ]);
  }

  // Keep the hand order the viewer sees for its own hand; shuffle nothing public.
  const choiceIds = view.log
    .filter((e) => e.type === "choiceRequired")
    .map((e) => Number(e.payload["choiceId"]));
  const timestamps = [
    ...view.standby.map((s) => s.timestamp),
    ...view.continuousEffects.map((e) => e.timestamp),
  ];
  const pendingChoice = view.pendingChoice
    ? (() => {
        const {
          optionCount: _count,
          options,
          ...rest
        } = clone(view.pendingChoice);
        return { ...rest, options: options ?? [] };
      })()
    : null;
  const seed = Math.floor(rng() * 4294967296);
  return {
    version: 1,
    seed,
    rngState: seed,
    nextInstanceId: nextId,
    nextTimestamp: Math.max(0, ...timestamps) + 1,
    players: players as [PlayerState, PlayerState],
    resolutionArea: clone(view.resolutionArea.cards ?? []),
    firstPlayer: view.firstPlayer,
    turn: view.turn,
    turnPlayer: view.turnPlayer,
    phase: view.phase,
    step: view.step,
    currentStep: view.currentStep,
    turnFlags: { ...view.turnFlags },
    standby: clone(view.standby),
    continuousEffects: clone(view.continuousEffects),
    counterTotal: view.counterTotal,
    pendingChoice,
    checkTiming: clone(view.checkTiming),
    resolution: clone(view.resolution),
    revealed: view.revealed.map((r) => r.card.instanceId),
    timedTriggers: clone(view.timedTriggers),
    manualQueue: clone(view.manualQueue),
    pendingLosses: [],
    nextChoiceId: Math.max(0, ...choiceIds) + 1,
    loopGuard: [],
    loop: null,
    result: clone(view.result),
    cards,
    log: clone(view.log),
  };
}

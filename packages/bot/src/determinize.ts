import type { Card } from "@gojisim/cards";
import {
  type CardInstance,
  type GameState,
  type PlayerId,
  type PlayerState,
  type PlayerView,
  ZONE_NUMBERS,
} from "@gojisim/engine";
import { guessHidden } from "./deckGuess";
import type { Knowledge } from "./types";

/**
 * Builds a full game state that matches everything the viewer can see, with the hidden parts
 * filled at random from the cards not yet accounted for (M6a): the opponent's hand and monster
 * deck, and both decks' order. Public areas, the viewer's own hand and own monster deck are
 * copied exactly, so `getPlayerView(result, viewer)` equals `view`.
 *
 * Accounting per player, from the decklists the viewer knows (its own; Q42):
 * - monster deck = the decklist's monster deck minus the monsters the log shows leaving it
 *   (6.3.1.6 setup, 5.15.1.2 next monster);
 * - hidden main-deck cards = the decklist's main deck minus every main-deck card the viewer can
 *   see (zones and stacks, strategy zones, the invading monster, the discard pile, revealed cards,
 *   their own hand, cards their own private choice showed them).
 * The opponent presents a deck and 4 monsters at setup, never their contents (6.3.1.1, Q42), so
 * without the opponent's decklist (every bot but the tools' `knowsDecklists` comparison) their
 * hidden cards are drawn by `guessHidden` from what a legal deck could hold, given what's public.
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

  // Every card in the known decklists, plus any card the view names (tokens, fixtures); guessed
  // cards join as they are drawn.
  const cards: Record<string, Card> = { ...clone(view.cards) };
  for (const deck of Object.values(knowledge.decks))
    for (const card of [
      ...(deck?.monsterDeck ?? []),
      ...(deck?.mainDeck ?? []),
    ])
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
        entry.type === "newInvadingMonster" ||
        // M2 (Q22): a monster deck card placed under the invading monster (EBP04-012), and
        // M13a: one an effect plays from the monster deck (EBP03-074, a `place` entry).
        ((entry.type === "placeUnder" || entry.type === "place") &&
          entry.payload["from"] === "monsterDeck" &&
          typeof entry.payload["cardId"] === "number")) &&
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
      strategyZones: pv.strategyZones.map((zone) =>
        shown(zone),
      ) as PlayerState["strategyZones"],
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
  // M13a: a bound card may have moved since it was bound (a new instance id, 4.1.4), so a card
  // named only by a binding is a deck card only while a copy of it is still unaccounted for.
  const boundOnly = new Set<string>();
  for (const binding of Object.values(view.resolution?.bindings ?? {}))
    if (binding.kind === "cards")
      for (const c of binding.cards) {
        if (!ownCardIds.has(c.instanceId)) boundOnly.add(c.instanceId);
        ownCardIds.set(c.instanceId, c.cardId);
      }
  // M13a: a card the viewer picked earlier in a multi-card search (5.8.1, "up to 2") is still in
  // its deck, but the view names only its instance id. It becomes one of the viewer's hidden deck
  // cards below, preferably one like the cards the search still offers.
  const unnamedPicks: string[] = [];
  for (const id of [
    ...(view.resolution?.chosen ?? []),
    view.resolution?.subject ?? "",
  ])
    if (id && !ownCardIds.has(id) && /^c\d+$/.test(id) && !visibleIds.has(id))
      unnamedPicks.push(id);
  const offered = (view.pendingChoice?.options ?? [])
    .map((o) => o.cardId)
    .filter((id): id is number => id !== null);
  for (const [id, cardId] of ownCardIds)
    if (!visibleIds.has(id) && !known.has(id))
      known.set(id, {
        card: { instanceId: id, cardId, owner: viewer },
        player: viewer,
        area: "deck",
      });

  /**
   * Fills an opponent's hidden hand, deck and monster deck with `guessHidden`'s draw: every
   * card of theirs the viewer has seen counts against the deck's limits, and the counts come
   * from the view, so the result matches it exactly.
   */
  const guessOpponent = (
    player: PlayerState,
    pv: PlayerView["players"][number],
    mine: { card: CardInstance; area: "hand" | "deck" | "monsterDeck" }[],
    left: number[],
  ) => {
    const isToken = (cardId: number) => cards[cardId]?.type === "Token";
    const seenIds = [
      ...ZONE_NUMBERS.flatMap((z) => player.zones[z].flat()),
      ...player.strategyZones.flat().map((p) => p.card),
      ...player.invadingMonsterZone,
      ...player.discard,
      ...(view.resolutionArea.cards ?? []).filter((c) => c.owner === player.id),
      ...mine.map((k) => k.card),
    ]
      .map((c) => c.cardId)
      .filter((id) => !isToken(id));
    const seen = seenIds.flatMap((id) => (cards[id] ? [cards[id]] : []));
    const revealedHere = mine.filter((k) => k.area === "monsterDeck");
    const knownHand = mine.filter((k) => k.area === "hand").map((k) => k.card);
    const knownDeck = mine.filter((k) => k.area === "deck").map((k) => k.card);
    const handNeeded = Math.max(0, pv.hand.count - knownHand.length);
    const deckNeeded = Math.max(0, pv.deck.count - knownDeck.length);
    // Monster deck ranks still hidden: one deck has one card of each rank (6.1.1.1).
    const gone = [...left, ...revealedHere.map((k) => k.card.cardId)].map(
      (id) => cards[id]?.rank,
    );
    const monstersNeeded = Math.max(
      0,
      pv.monsterDeck.count - revealedHere.length,
    );
    const ranks = [1, 2, 3, 4].filter((r) => !gone.includes(r));
    while (ranks.length < monstersNeeded) ranks.push(1 + Math.floor(rng() * 4));
    const firstMonster = view.log.find(
      (e) => e.type === "setInvadingMonster" && e.player === player.id,
    )?.payload["cardId"];
    const guess = guessHidden(
      {
        rankOne:
          typeof firstMonster === "number" ? cards[firstMonster] : undefined,
        seen,
        hiddenMain: handNeeded + deckNeeded,
        hiddenRanks: shuffle(ranks).slice(0, monstersNeeded),
        asOf: knowledge.asOf ? new Date(knowledge.asOf) : new Date(),
      },
      rng,
    );
    for (const card of [...guess.main, ...guess.monsterDeck])
      cards[card.id] ??= card;
    player.monsterDeck = shuffle([
      ...revealedHere.map((k) => k.card),
      ...guess.monsterDeck.map((c) => fresh(c.id, player.id)),
    ]);
    player.hand = [
      ...knownHand,
      ...guess.main.slice(0, handNeeded).map((c) => fresh(c.id, player.id)),
    ];
    player.deck = shuffle([
      ...knownDeck,
      ...guess.main.slice(handNeeded).map((c) => fresh(c.id, player.id)),
    ]);
  };

  for (const player of players) {
    const pv = view.players.find(
      (p) => p.id === player.id,
    ) as PlayerView["players"][number];
    const isViewer = player.id === viewer;
    const list = knowledge.decks[player.id];
    if (!list && isViewer)
      throw new Error(`determinize: no decklist for ${player.id}`);
    let mine = [...known.values()].filter((k) => k.player === player.id);
    for (const k of mine) visibleIds.add(k.card.instanceId);

    const left = leftMonsterDeck.get(player.id) ?? [];
    if (!list) {
      // Q42: without the opponent's decklist, their hidden cards are guessed from what's public.
      guessOpponent(player, pv, mine, left);
      continue;
    }

    // Monster deck: exact for the viewer; otherwise the decklist's monster deck minus what left.
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
    const shownCards = [
      ...ZONE_NUMBERS.flatMap((z) => player.zones[z].flat()),
      ...player.strategyZones.flat().map((p) => p.card),
      ...player.invadingMonsterZone,
      ...player.discard,
      ...(view.resolutionArea.cards ?? []).filter((c) => c.owner === player.id),
      ...(isViewer ? player.hand : []),
    ];
    // Bound-only cards whose copies are all accounted for elsewhere have moved: drop them.
    if (boundOnly.size > 0) {
      const pool = [...list.monsterDeck, ...list.mainDeck].map((c) => c.id);
      for (const c of [
        ...shownCards,
        ...mine
          .filter((k) => !boundOnly.has(k.card.instanceId))
          .map((k) => k.card),
      ]) {
        const at = pool.indexOf(c.cardId);
        if (at >= 0) pool.splice(at, 1);
      }
      mine = mine.filter((k) => {
        if (!boundOnly.has(k.card.instanceId)) return true;
        const at = pool.indexOf(k.card.cardId);
        if (at < 0) return false;
        pool.splice(at, 1);
        return true;
      });
    }
    const visibleCards = [
      ...shownCards,
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
    if (isViewer)
      for (const id of unnamedPicks) {
        const like = hidden.findIndex((cardId) => offered.includes(cardId));
        const [cardId] = hidden.splice(like >= 0 ? like : 0, 1);
        if (cardId === undefined)
          throw new Error(
            `determinize: card ${id} the viewer chose is unknown`,
          );
        knownDeck.push({ instanceId: id, cardId, owner: player.id });
      }
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
  const replacementAsks = askedReplacements(view, players);
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
    ...(replacementAsks ? { replacementAsks } : {}),
    pendingLosses: [],
    nextChoiceId: Math.max(0, ...choiceIds) + 1,
    loopGuard: [],
    loop: null,
    result: clone(view.result),
    cards,
    log: clone(view.log),
  };
}

/**
 * M13a: an optional replacement asked during a start phase step (E21: EBP02-012 at 7.2.3,
 * EBP04-010 at 7.2.4) keeps its question in `state.replacementAsks`, which no view carries. It
 * is rebuilt from what the viewer sees, so answering in a simulation resumes the step instead of
 * failing: the open question from the pending yes / no (10.9), and at 7.2.4 a replacement already
 * applying (its discards paused in a resolution) as done.
 */
function askedReplacements(
  view: PlayerView,
  players: PlayerState[],
): GameState["replacementAsks"] {
  if (view.step !== "7.2.3" && view.step !== "7.2.4") return undefined;
  const turnPlayer = players.find((p) => p.id === view.turnPlayer);
  if (!turnPlayer) return undefined;
  const choice = view.pendingChoice;
  const open =
    choice?.kind === "confirm" && choice.rule === "10.9" && !view.resolution
      ? choice.options?.[0]
      : undefined;
  if (view.step === "7.2.4") {
    const top = turnPlayer.invadingMonsterZone.at(-1);
    if (!top) return undefined;
    if (open?.abilityId)
      return [
        { instanceId: top.instanceId, abilityId: open.abilityId, answer: null },
      ];
    if (view.resolution)
      return [
        {
          instanceId: top.instanceId,
          abilityId: view.resolution.standby.abilityId,
          answer: "done",
        },
      ];
    return undefined;
  }
  if (!open?.abilityId) return undefined;
  // 7.2.3: the open question is for the first strategy card with the option's card id. Earlier
  // questions of the step aren't rebuilt (the log doesn't say how they were answered): in a
  // simulation the step asks them again.
  const current = turnPlayer.strategyZones
    .flat()
    .map((p) => p.card)
    .find((c) => c.cardId === open.cardId);
  if (!current) return undefined;
  return [
    { instanceId: current.instanceId, abilityId: open.abilityId, answer: null },
  ];
}

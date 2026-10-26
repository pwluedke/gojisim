import { type Effect, getCardTraits } from "@gojisim/cards";
import {
  bindCards,
  dataAbilityId,
  locate,
  performNested,
  registerCustomEffect,
} from "./interpreter";
import { cardOf } from "./rules";
import { appendLog, getPlayer, moved, toDiscard } from "./state";
import type { ZoneNumber } from "./types";

/**
 * Built-in `custom` effect handlers (format.md piece CU): one rule a single card needs, which no
 * data piece would reuse. Each is named after its card and registered when the engine loads.
 */

/**
 * EBP02-080 Joint Struggle: "Reveal the top 2 cards of your deck. If they differ in at least 1
 * trait, add them to your hand; otherwise, send them to the discard pile." Two cards differ when
 * their trait sets aren't the same ([mech] vs [mechagodzilla] [mech] differ). With fewer than 2
 * cards there is nothing to compare, so they go to the discard pile.
 */
registerCustomEffect("jointStruggle", (state, ctx) => {
  const me = getPlayer(state, ctx.master);
  const abilityId = state.resolution?.standby.abilityId ?? null;
  const top = me.deck.splice(0, 2);
  for (const card of top)
    appendLog(state, "reveal", me.id, {
      rule: "5.10.1",
      cardId: card.cardId,
      abilityId,
    });
  const traits = top.map((card) =>
    [...new Set(getCardTraits(cardOf(state, card)))].sort().join("|"),
  );
  const differ = top.length === 2 && traits[0] !== traits[1];
  if (differ)
    for (const card of top) {
      me.hand.push(moved(state, card));
      appendLog(state, "addToHand", me.id, {
        rule: "4.9",
        from: "deck",
        cardId: card.cardId,
        abilityId,
      });
    }
  else if (top.length > 0) {
    const sent = top.map((card) => toDiscard(state, card));
    appendLog(state, "mill", me.id, {
      rule: "5.10",
      cardIds: sent.map((c) => c.cardId),
      abilityId,
    });
  }
});

/**
 * EBP04-067 Godzilla Earth: "[enter] Play 1 "Godzilla Earth" token in your zone 3. If either this
 * card or that token leave their zone or move, [destroy] both of them." Links this card and the
 * token bound as `token`, each in its zone. If the token wasn't played (your monster is in zone 3)
 * or this card has already left, nothing is linked (Q28). The link's own ability (`linked`) goes
 * into standby when it breaks (`breakLinks`).
 */
registerCustomEffect("godzillaEarthLink", (state, ctx) => {
  const token = ctx.bindings["token"];
  const self = locate(state, ctx.sourceInstanceId);
  const made =
    token?.kind === "cards" && token.cards[0]
      ? locate(state, token.cards[0].instanceId)
      : undefined;
  if (self?.zone === undefined || made?.zone === undefined) return;
  if (self.area !== "zones" || made.area !== "zones") return;
  const timestamp = state.nextTimestamp++;
  const number = cardOf(state, self.card).deckCardNumber;
  state.continuousEffects.push({
    effectId: `link:${number}:${timestamp}`,
    timestamp,
    duration: "permanent",
    link: {
      master: ctx.master,
      abilityId: dataAbilityId(number, "linked"),
      sourceInstanceId: self.card.instanceId,
      sourceCardId: self.card.cardId,
      cards: [self, made].map((l) => ({
        instanceId: l.card.instanceId,
        player: l.player.id,
        zone: l.zone as ZoneNumber,
      })),
    },
  });
  appendLog(state, "link", ctx.master, {
    rule: "10.6",
    cardIds: [self.card.cardId, made.card.cardId],
    abilityId: state.resolution?.standby.abilityId ?? null,
  });
});

/**
 * EBP04-067's broken link: binds the linked cards still on the field as `linked`, for the
 * ability's destroy ("[destroy] both of them"; one that left the field is gone already).
 */
registerCustomEffect("bindLinked", (state, ctx) => {
  const ids = state.resolution?.standby.event.payload["instanceIds"];
  const onField = (Array.isArray(ids) ? ids : []).flatMap((id) => {
    const at = locate(state, String(id));
    return at?.area === "zones" ? [at.card] : [];
  });
  bindCards(ctx, "linked", onField);
});

/** EBP04-089's thresholds: the Nth card placed under it (15, 22, 30) and what each does. */
const INHERITED_LIFE: [number, Effect][] = [
  [
    15,
    {
      effect: "destroy",
      target: {
        select: { owner: "opponent", area: "zones", type: "Battle" },
        count: "all",
        chooser: "you",
      },
    },
  ],
  [
    22,
    {
      effect: "discard",
      player: "opponent",
      count: "hand",
      chooser: "opponent",
    },
  ],
  [30, { effect: "winGame", player: "you" }],
];

/**
 * EBP04-089 Inherited Life: "[your-turn] Whenever your monster card's [rage] is reduced, place
 * that many [rage] under this card. When you place the 15th card under this card, [destroy] all
 * of your opponent's battle cards. When you place the 22nd card, your opponent discards their
 * entire hand. When you place the 30th card, you win the game." Rage cards aren't cards (3.4.2.1),
 * so they are a count on this card (Q11), growing by every decrease (Q25). A decrease that passes
 * several thresholds does each in order, in this resolution.
 */
registerCustomEffect("inheritedLife", (state, ctx) => {
  const event = state.resolution?.standby.event;
  const added = Number(event?.payload["from"]) - Number(event?.payload["to"]);
  const here = locate(state, ctx.sourceInstanceId);
  if (!(added > 0) || here?.area !== "strategy") return;
  // Counts of cards that left their strategy zone are new objects' business no longer (4.1.4).
  state.continuousEffects = state.continuousEffects.filter(
    (e) =>
      !e.counter || locate(state, e.counter.instanceId)?.area === "strategy",
  );
  let effect = state.continuousEffects.find(
    (e) => e.counter?.instanceId === ctx.sourceInstanceId,
  );
  if (!effect) {
    const timestamp = state.nextTimestamp++;
    effect = {
      effectId: `counter:${here.card.cardId}:${timestamp}`,
      timestamp,
      duration: "permanent",
      counter: { instanceId: ctx.sourceInstanceId, count: 0 },
    };
    state.continuousEffects.push(effect);
  }
  const counter = effect.counter as NonNullable<typeof effect.counter>;
  const before = counter.count;
  counter.count = before + added;
  appendLog(state, "rageUnder", ctx.master, {
    rule: "3.4.2.1",
    cardId: here.card.cardId,
    added,
    count: counter.count,
    abilityId: state.resolution?.standby.abilityId ?? null,
  });
  for (const [nth, run] of INHERITED_LIFE)
    if (before < nth && nth <= counter.count && state.result === null) {
      appendLog(state, "rageUnderReached", ctx.master, {
        rule: "3.4.2.1",
        cardId: here.card.cardId,
        nth,
      });
      performNested(state, run);
    }
});

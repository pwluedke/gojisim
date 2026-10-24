import { getCardTraits } from "@gojisim/cards";
import { registerCustomEffect } from "./interpreter";
import { cardOf } from "./rules";
import { appendLog, getPlayer, moved, toDiscard } from "./state";

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

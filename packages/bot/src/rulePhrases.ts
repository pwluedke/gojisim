/** #478 phase 2b: two plain phrases per rule: why it chose a move, why it left one out. */
export interface RulePhrases {
  /** Finishes "It plays this because …" (lowercase start, no final period). */
  chose: string;
  /** Finishes "It doesn't do that because …" (lowercase start, no final period). */
  leftOut: string;
}

/**
 * Every rule id the decision trace can report (`trace.ts`, the plans' `mark`/`report` calls, the
 * card rules' and play rules' verdicts, and the search's own notes), in plain words.
 */
export const RULE_PHRASES: Record<string, RulePhrases> = {
  // Rules for every deck (`cardRules.ts`).
  "card rule 1": {
    chose:
      "it keeps a strategy card in play, so the monster card that loses the game without one stays safe",
    leftOut:
      "that monster card loses the game when your strategy zones are empty, and you wouldn't have a strategy card in play",
  },
  "card rule 2": {
    chose:
      "a play this turn can clear the blocker in their zone 8, and then an invasion wins the game",
    leftOut:
      "a play this turn can clear the blocker in their zone 8 first, so invading into the blocker or ending the turn now throws away a winning invasion",
  },
  "card rule 3": {
    chose:
      "the card works in the column of their monster, so it goes where its ability counts",
    leftOut:
      "the card works in the column of their monster, and this would put it somewhere its ability doesn't count",
  },
  "card rule 4": {
    chose:
      "a card that plays itself back from the discard pile should always come back, and their returning cards are the last ones worth destroying",
    leftOut:
      "it would keep a card that plays itself back from coming back, or destroy one of their cards that just comes back again",
  },
  "card rule 5": {
    chose:
      "a strategy card that only adds counter power is saved for the turn it makes the difference",
    leftOut:
      "that strategy card only adds counter power, and right now you either have enough without it or still fall short with it",
  },
  "card rule 6": {
    chose:
      "a slow counter deck wins by countering, so it keeps its monster back",
    leftOut:
      "a slow counter deck invades only when the invasion wins the game right now",
  },
  "card rule 7": {
    chose:
      "your zone 8 is empty and their monster can reach it, so a battle card there blocks their invasion (or this play gives you the counter, which comes first)",
    leftOut:
      "it would leave your zone 8 open while their monster can reach it, when a play that blocks it (or makes the counter) is there",
  },
  "card rule 8": {
    chose:
      "this battle card's ability works only in some zones, and this puts it in one of them",
    leftOut:
      "this battle card's ability works only in some zones, and this would put it where the ability does nothing",
  },
  "card rule 9": {
    chose:
      "their monster can reach your zone 8 and you can't counter it yet, so the cards you were holding are freed to start a way to the counter",
    leftOut:
      "their monster can reach your zone 8 and you can't counter it yet, so the plays that start a way to the counter come first",
  },
  "card rule 10": {
    chose:
      "moving their monster forward only pays off when you can still counter it this turn or your zone 8 is blocked",
    leftOut:
      "it moves their monster forward when you can't counter it this turn and your zone 8 isn't blocked",
  },
  "card rule 12": {
    chose:
      "an Evolution should pick a card that is stronger than the one it stacks on",
    leftOut:
      "the Evolution would pick a card no stronger than the one it stacks on, while a stronger one is there",
  },
  "card rule 13": {
    chose:
      "this battle card's ability needs your monster further forward, so it waits for this turn's invasion to take it there",
    leftOut:
      "an invasion this turn can take your monster to the zone this card's ability needs, so it waits until after the invasion",
  },
  "card rule 14": {
    chose:
      "on the first two turns your monster cards are worth more in hand than as rage",
    leftOut:
      "it's too early to discard for rage, unless that rage helps make the counter or block your zone 8",
  },
  "card rule 15": {
    chose:
      "a monster card whose ability fires on reaching a zone is kept until your monster can reach that zone",
    leftOut:
      "that monster card's ability fires on reaching a zone your monster can't reach this turn",
  },
  "card rule 16": {
    chose:
      "when a card says to choose one, it picks a mode that does something",
    leftOut: "that mode changes nothing while another mode does something",
  },
  "card rule 17": {
    chose:
      "a revenge card does its job when it gets destroyed, so it goes ahead of your monster and stays out of costs",
    leftOut:
      "it would put a revenge card where it won't get destroyed, or spend it on an invasion while another card can pay",
  },
  "card rule 18": {
    chose:
      "making the opponent discard is worth more than milling your own deck",
    leftOut:
      "that mode only mills your own deck, while another mode makes the opponent discard",
  },
  "card rule 19": {
    chose:
      "a strategy card that only adds a status is saved for when that status isn't already in force",
    leftOut: "every status that strategy card gives is already in force",
  },
  "card rule 20": {
    chose:
      "it gives you enough counter power to counter their monster this turn, or keeps the counter power you already have",
    leftOut:
      "a play that gets you the counter this turn is there and this isn't it, or it would lose the counter power you already have",
  },
  "card rule 21": {
    chose:
      "it keeps your battle cards out of your own monster's way, where its next moves would crush them",
    leftOut:
      "it would put a battle card in the next two zones your own monster moves into, where it gets crushed, while an empty zone outside them is open",
  },
  "card rule 22": {
    chose:
      "a strategy card that only destroys is saved until it has something to destroy",
    leftOut:
      "that strategy card only destroys the opponent's battle cards, and no way of playing it destroys one now",
  },
  "card rule 22b": {
    chose:
      "a one-shot strategy card is saved until playing it changes something",
    leftOut:
      "no way of playing that strategy card would change anything in the game",
  },
  "card rule 23": {
    chose:
      "it keeps your own battle cards on the board instead of covering one of them",
    leftOut:
      "it would play over one of your own battle cards while an empty zone out of your monster's way is open",
  },
  "card rule 23b": {
    chose:
      "with no empty zone out of your monster's way, covering one of your own tokens costs less than covering a battle card",
    leftOut:
      "it would play over one of your own battle cards while one of your own tokens can be covered instead",
  },
  "card rule 24": {
    chose:
      "a card that plays itself back from the discard pile is the cheapest card to discard",
    leftOut:
      "a card that plays itself back from the discard pile can go instead, and it will come back",
  },
  "card rule 25": {
    chose:
      "it keeps your battle cards out of the zone just behind your monster, where a counter would push your monster back onto them",
    leftOut:
      "it would put a battle card just behind your monster, where a counter would push your monster back onto it and crush it",
  },
  "card rule 26": {
    chose:
      "your top monster card's invading ability is active, so it stays on top while you can invade",
    leftOut:
      "it would cover your monster's active invading ability with a card that has none, without winning or making the counter",
  },
  "card rule 27": {
    chose:
      "strategy cards stay in hand while there's a battle card you can't play soon to discard instead",
    leftOut:
      "it would discard a strategy card while a battle card you can't play this turn or next could go instead",
  },
  "card rule 28": {
    chose:
      "your only copy of a lower-rank monster card stays in hand for when your monster needs it",
    leftOut:
      "it would discard your only copy of a lower-rank monster card while a higher-rank or spare one could go instead",
  },
  "card rule 29": {
    chose: "a Tangler deck stays back early and wins by countering",
    leftOut:
      "a Tangler deck doesn't invade before its own fourth turn unless the invasion wins the game this turn",
  },
  "card rule 30": {
    chose: "it picks the answer that destroys the most of the opponent's cards",
    leftOut: "another answer can destroy more of the opponent's cards",
  },
  "card rule 33": {
    chose:
      "Godzilla Landing is saved for a turn its push can move their monster",
    leftOut:
      "their monster is already in zone 8, where Godzilla Landing's push can't move it",
  },
  "card rule 34": {
    chose:
      "Godzilla Landing's push lets you make the counter this turn, by itself or with one more battle card",
    leftOut:
      "a Godzilla Landing that sets up this turn's counter gets the head start instead",
  },

  // Play rules (`rules.ts`).
  "play rule 1": {
    chose:
      "playing a same-rank monster card on top of your monster grows its stack for the cards that count it",
    leftOut:
      "stacking a same-rank monster card on your monster gets the head start instead",
  },
  "play rule 2": {
    chose:
      "it keeps one monster card of each rank in hand to play on top of your monster for its ability",
    leftOut:
      "that monster card is kept in hand to play on top of your monster for its ability, so it isn't spent on rage or a cost while another card can pay",
  },
  "play rule 3": {
    chose:
      "your spare monster cards are worth more as rage than sitting in hand",
    leftOut:
      "a monster card in your hand can still be discarded for rage, or it is the one card kept for your monster's next rank",
  },
  "play rule 4": {
    chose:
      "this strategy card gives you enough counter power to counter their monster, and any invasion this turn has already been made",
    leftOut:
      "that strategy card only adds counter power, so it waits until it makes the counter, and for this turn's invasion first",
  },
  "play rule 5": {
    chose:
      "this battle card works in the column of their monster, so it goes there",
    leftOut:
      "this battle card works in the column of their monster, and this would put it somewhere else",
  },
  "play rule 6": {
    chose: "this battle card gets a boost in that zone, so it goes there",
    leftOut:
      "this battle card gets a boost in another zone it can go to, or it would leave your zone 8 open while their monster can reach it",
  },
  "play rule #195": {
    chose:
      "the opponent's card offers to counter its own monster for a discard, and the cheapest card you can't play now pays for it",
    leftOut:
      "the opponent's card offers to counter its own monster for a discard, and a cheaper card can pay than this one",
  },

  // Rulings the search applies for every deck (`ismcts.ts`).
  "Final Wars ruling": {
    chose:
      "Godzilla Final Wars puts the revealed cards where they give the most counter power in total",
    leftOut:
      "another place for the revealed cards gives more counter power in total",
  },
  "Constructed Future plan": {
    chose:
      "Constructed Future is played when it brings back a battle card worth having, in the order that helps most",
    leftOut:
      "Constructed Future would bring back nothing worth having now, or it would break this turn's counter",
  },

  // Monster X (`mxPlan.ts`, `mxPlanV2.ts`).
  "Monster X plan": {
    chose:
      "the Monster X plan wants it: get battle cards of many colors into your zones, stay back with Entangling Fear, and counter",
    leftOut:
      "the Monster X plan argues against it, so the moves it wants get the head start",
  },

  // Wrangler (`wranglerPlan.ts`, `wranglerPlanV2.ts`).
  "Wrangler plan Line 1": {
    chose:
      "the Wrangler plan wants it: build rage for Despair against a Mecha-King Ghidorah, or an invasion paid with a strategy card the hand doesn't need",
    leftOut:
      "the Wrangler doesn't race: it invades only when the invasion wins, never pays with a push card, and keeps Despair and Godzilla Against Mechagodzilla for a Mecha-King Ghidorah",
  },
  "Wrangler plan v1": {
    chose:
      "against a Mecha-King Ghidorah, the Wrangler builds rage so Despair can destroy it",
    leftOut:
      "against a Mecha-King Ghidorah, the Wrangler keeps Despair and Godzilla Against Mechagodzilla, and builds rage for Despair first",
  },
  "Wrangler plan v1 2": {
    chose:
      "the Wrangler churns through its deck by discarding monster cards for rage",
    leftOut:
      "the Wrangler would rather discard a monster card for rage than end the turn",
  },
  "Wrangler plan v1 3": {
    chose:
      "an invasion paid with Godzilla (2004) turns one card into two monster cards for rage",
    leftOut:
      "the invasion paid with Godzilla (2004) comes first, while the Godzilla (2023) that fetches monster cards is on top",
  },
  "Wrangler plan v2.1": {
    chose:
      "the Wrangler plan wants it: rage for a King in the front zones so it can't be destroyed, and a monster card discarded before a key card",
    leftOut:
      "the Wrangler plan argues against it: a King in the front zones needs its rage first, or a key card would go while a monster card can",
  },
  "Wrangler plan v2.2": {
    chose:
      "the Wrangler plan wants it: an invasion that fetches the monster cards it needs, or one that lines up a push or a rage reset into this turn's counter",
    leftOut:
      "the Wrangler plan argues against it: it saves Godzilla Against Mechagodzilla's rage reset for the counter and takes the invasion that sets up the counter first",
  },
  "Wrangler plan v2.3": {
    chose:
      "the Wrangler plan wants it: discard monster cards for rage, dig for battle cards, and keep the Kings safe in the back zones",
    leftOut:
      "the Wrangler plan argues against it: it pushes their monster only when the counter comes the same turn, keeps the Kings out of harm's way, and discards for rage before ending the turn",
  },

  // Tangler (`tanglerPlan.ts`).
  "Tangler plan 1": {
    chose:
      "the Tangler keeps its monster back with Entangling Fear every turn and brings out its low evolution cards early",
    leftOut:
      "Entangling Fear or a low evolution card can still be played first, and the spare Entangling Fears stay in hand",
  },
  "Tangler plan 3": {
    chose:
      "with your monster lowering their rage, discarding a battle card that's worth little on the board takes their threat down",
    leftOut:
      "a cheaper battle card can go instead, and each battle card discarded lowers their rage",
  },
  "Tangler plan 5": {
    chose:
      "with the counter already made, the rest of the hand is kept for later turns",
    leftOut:
      "you already have the counter, so the rest of the hand is kept for later turns",
  },
  "Tangler plan 6a": {
    chose:
      "the last Destoroyah battle card in hand is kept to turn on Godzilla vs. Destoroyah later",
    leftOut:
      "it would spend the last Destoroyah battle card in hand, which turns on Godzilla vs. Destoroyah, without making this turn's counter",
  },
  "Tangler plan 6b": {
    chose:
      "Godzilla vs. Destoroyah is saved for the last counter or the one that stops a losing invasion",
    leftOut:
      "Godzilla vs. Destoroyah waits for the last counter or the one that stops a losing invasion, and this isn't that turn",
  },
  "Tangler plan 7a": {
    chose:
      "the highest-rank battle card is the one least likely to be playable soon, so it goes",
    leftOut:
      "a higher-rank battle card, the one least likely to be playable soon, can go instead",
  },
  "Tangler plan 7b": {
    chose:
      "from zone 5, the Tangler moves forward only when it's safe from their counter",
    leftOut:
      "from zone 5, an invasion of two or more zones waits while their monster is behind yours in rank, or level with no counter this turn",
  },
  "Tangler plan 7c": {
    chose:
      "against Gigan, with Entangling Fear out of reach, the turn goes into building the counter",
    leftOut:
      "against Gigan, with Entangling Fear out of reach, an invasion that doesn't win waits and battle cards go out before ending the turn",
  },

  // SpaceGodzilla (`spacegPlan.ts`).
  "SpaceG plan 1": {
    chose:
      "SpaceGodzilla's engine is invading every turn, which makes Crystals",
    leftOut:
      "SpaceGodzilla would rather invade than end the turn while an invasion can be made",
  },
  "SpaceG plan 2": {
    chose:
      "each rage discard either destroys their battle cards with Crystals or makes more Crystals",
    leftOut:
      "SpaceGodzilla would rather discard for rage than end the turn while it can",
  },
  "SpaceG plan 3": {
    chose:
      "another SpaceGodzilla on top of the one in play makes more Crystals, after this turn's invasion so they land behind it",
    leftOut:
      "covering SpaceGodzilla waits for this turn's invasion, and it comes before ending the turn",
  },
  "SpaceG plan 4": {
    chose: "SpaceGodzilla aims to end the turn in zone 7",
    leftOut:
      "it would end the turn in zone 8, where their next counter can reach SpaceGodzilla",
  },
  "SpaceG plan 5": {
    chose:
      "God of Destruction's Counterattack is kept for the big counter turn",
    leftOut:
      "it would spend God of Destruction's Counterattack on rage or on an invasion that doesn't win",
  },

  // Red Fest (`festPlan.ts`).
  "Red Fest plan 2": {
    chose:
      "Red Fest pushes their monster and counters until its rank IV, invading earlier only when it lines up a push or a big play",
    leftOut:
      "Red Fest pushes and counters until its rank IV, and on the turn before the rank IV it keeps its monster cards in hand and plays out its idle cards",
  },
  "Red Fest plan 3": {
    chose: "Anguirus goes in zone 1 or 2 unless the counter needs it now",
    leftOut:
      "Anguirus goes in zone 1 or 2 unless the counter needs it now in zone 3 or 8",
  },
  "Red Fest plan 4": {
    chose:
      "a Godzilla the Ride in the discard pile turns on the other Rides' bonus",
    leftOut:
      "a Godzilla the Ride should go to the discard pile first, to turn on the other Rides' bonus",
  },
  "Red Fest plan 5": {
    chose:
      "against Monster X, Red Fest builds toward its rank IV with battle cards in its zones, rages heavily, and invades from there",
    leftOut:
      "against Monster X, Red Fest stops racing: no invasion before its rank IV unless it wins, and its finishers are held",
  },

  // A deck with no plan of its own (`noPlan.ts`).
  "No-plan play 1": {
    chose: "a card left in hand is wasted unless it has a reason to wait",
    leftOut:
      "a battle card can still be played or a spare monster card discarded for rage before ending the turn",
  },
  "No-plan play 2": {
    chose:
      "an invasion is worth it when it wins, uses an invading ability, or sets up the counter",
    leftOut:
      "the invasion wouldn't win, use an invading ability, or set up the counter, so it's only a cost",
  },
};

/** One sentence per deck plan: what the deck is trying to do (from its play guide's "How the deck wins"). */
export const DECK_GOALS: Record<string, string> = {
  "Monster X":
    "Monster X wants to build a lot of counter power quickly and counter, moving slowly and staying between zones 3 and 5, especially early.",
  Wrangler:
    "The Wrangler stays back and makes the opponent come to it: it pushes their monster forward into its Kings, makes them crush their own battle cards on the way, and counters them back with big rage, invading only when that wins.",
  Tangler:
    "The Tangler sits in zone 3 under Entangling Fear, draws and discards more than the opponent to keep their rage low, and keeps countering.",
  SpaceG:
    "SpaceGodzilla invades and discards for rage every turn to make Crystals, which power its destroys and the big God of Destruction's Counterattack counter.",
  "Red Fest":
    "Red Fest counters early for cards, pushes the opponent to zone 6 and beyond and keeps them there, then switches to invading once its monster reaches rank IV.",
  "Constructed Future":
    "This deck fills its discard pile with big battle cards such as Mecha-King Ghidorah, then plays Constructed Future to bring them back for the counter.",
};

/** For a deck with no plan, by type. */
export const TYPE_GOALS: { counter: string; invasion: string } = {
  counter:
    "A counter deck wants to build counter power and counter the opponent's monster before it reaches zone 8.",
  invasion:
    "An invasion deck wants to move its monster forward fast, clear the way, and invade into the opponent's zone 8 to win.",
};

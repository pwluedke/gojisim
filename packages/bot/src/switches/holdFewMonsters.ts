import { defineSwitch } from "./define";

/** Nov 18 decision: play rule 2 only for decks with at most this many monster cards in the main deck, or a SpaceG list with its plan; 0 keeps it for every deck. */
export default defineSwitch({
  name: "holdFewMonsters",
  default: 12,
  group: "search",
  what: "Play rule 2 (keep one monster card per rank in hand to play on top later) is used only by a deck with at most this many monster cards in its main deck, such as a counter deck, and by a SpaceGodzilla deck whose plan asks for it. Every other deck discards those cards for rage instead. At 0, every deck keeps them, as before.",
  from: "#478",
  status: "built",
});

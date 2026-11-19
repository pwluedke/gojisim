import { defineSwitch } from "./define";

/** Nov 18 decision: 1 (the default) favors one same-rank stack every turn, for every deck; 0 only when a card wants the bigger stack. */
export default defineSwitch({
  name: "stackEveryTurn",
  default: 1,
  group: "search",
  what: "Play rule 1, every turn: when you can play a monster card on top of your monster this turn, the bot favors doing it, even when no card needs a bigger stack. A deck with GAM EBP01-073 doesn't: it would rather discard its monster cards toward GAM's 8 or more, so it stacks only when a card needs the bigger stack.",
  from: "#478",
  status: "built",
});

import { defineSwitch } from "./define";

/** #444: 1 (the default) lets their monster's rank decide the invasion of 2 from zone 5; 0 off. */
export default defineSwitch({
  name: "tanglerZoneFive",
  default: 1,
  group: "tangler",
  option: "zoneFive",
  what: "The Tangler plan's zone 5 rule (report R-32): with your monster in zone 5, an invasion of 2 or more zones waits when the opponent's monster has a lower rank than yours, or the same rank and you have no counter this turn, unless their board's counter power already reaches your monster's threat (then they counter you next turn wherever you end up).",
  from: "#444",
  status: "built",
});

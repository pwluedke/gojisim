import { defineSwitch } from "./define";

/** #444: 1 (the default) lets their monster's rank decide the invasion of 2 from zone 5; 0 off. */
export default defineSwitch({
  name: "tanglerZoneFive",
  default: 1,
  group: "tangler",
  option: "zoneFive",
  what: "The Tangler plan's zone 5 line (stevilkiwina, R-32): with your monster in zone 5, an invasion of 2 or more zones waits when their monster's rank is lower than yours, or the same with no counter this turn, unless their board's counter power already reaches your threat (they counter you next turn wherever you end).",
  from: "#444",
  status: "built",
});

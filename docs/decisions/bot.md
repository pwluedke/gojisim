# Decisions: Bots

Accepted decisions about `packages/bot` and `tools/bots` (search, evaluation, tournaments, positions), numbered as they were in CLAUDE.md. New ones go at the end of the file that fits (docs/decisions/README.md).

Accepted by Monarch in the M6a review (PR #20).

164. The engine view carries the public engine status (`counterTotal`, `checkTiming`, `timedTriggers`, `manualQueue`), revealed cards with their owner and area, and, for the player who must choose, the paused `resolution` (bindings only for the ability's master). The view-leak invariant allows exactly those.
165. Hidden choice options are sorted by instance id, so a search never reveals deck order (4.8.2).
166. `BotInput.legalActions` leaves out `concede`; it is computed from the real state but depends only on what the bot can see (the no-peeking test checks this).
167. The determinizer fills each player's hidden cards from the decklist the bot knows: its own (monster deck minus `setInvadingMonster`/`newInvadingMonster` cards in the log, main deck minus every visible main-deck card; cards its own private choice or resolution names go into its deck; a mismatch throws). (Amended for Q42, hidden decklists: a bot knows only its own decklist; the opponent's hidden cards are drawn by `guessHidden` from the cards a legal deck could hold given what's public. Only the tools' `knowsDecklists` comparison passes the opponent's list.)
168. `cloneState` deep-copies by hand and shares log entries and the card catalog, which the engine never writes once created. A freeze guard (off in production) makes any such write throw in tests and stress.
169. The weighted policy lives in `@gojisim/bot` and reads the view; stress calls it.
170. The tournament harness (`tools/bots`): bot a sits in P1 in even games, the sets swap every 2 games, games past turn 500 are unfinished draws, ms per decision covers `chooseAction` only.
171. Root scripts `pnpm bench` and `pnpm bots`; `bot-reports/` is gitignored.

Accepted by Monarch in the M6b review (PR #21).

172. The freeze guard is switched by `GOJISIM_FREEZE` (read through `globalThis.process`, so the engine keeps no Node dependency) and `setFreezeGuard()`. Test fixtures replace `state.cards` instead of writing into it.
173. Every evaluation feature is own minus opponent, so `evaluate` is exactly antisymmetric.
174. `winThreat` counts an invasion as available with a card in hand, unless it's your turn and you already invaded.
175. `countersLeft` and `nextMonster` read the current monster's printed rank (decision 133).
176. `greedy` evaluates at the first decision point after the action, whoever it belongs to, or at the game's end; a single legal action is played without searching; ties within 1e-12 go to the seeded rng.
177. `@gojisim/bot` uses `rootDir: "."` and includes `data/*.json` for the weights file.
178. `pnpm bots` takes `--a-settings`/`--b-settings` as `key=value` pairs; reports label bots with their settings.

Accepted by Monarch in the M6c review (PR #22).

179. The must-block test plays the bot's whole turn and checks its zone 8 at the end (it may invade first, which neither wins from zone 5 nor ends the turn).
180. ISMCTS action keys: type + card id (+ zone or strategy zone) for plays; kind + ability id + option card id (or the option id when it names no card) for choices. Two copies of a card share a node.
181. ISMCTS tree values are stored from the side of the player who chose the move into the node; exploration 0.7; an unvisited available child is expanded first, at random; a new child starts with availability 1.
182. `rolloutTurns` counts opponent turns that end during a rollout (default 1); a rollout also stops at the game's end or after `rolloutDecisions` (60).
183. The weighted policy reads a `Board` accessor (a view, or a state in rollouts). The search budget uses `Date.now()`.
184. `ismcts` reads `iterations`, `maxMs`, `exploration`, `rollout`, `rolloutTurns`, `rolloutDecisions`, `temperature`, `blunder`; `easy`, `medium`, `hard` are registered bots, a `difficulty` setting overrides the level, explicit settings override the mapping. Blunder is rolled before the search.
185. `pnpm bots --workers N` runs shards in child processes and merges them in game order; results match a single process.

Accepted by Monarch in the M13a review (PR #64).

530. Pruning covers strategy activations only, and only from Medium (difficulty 55) up; Easy stays as before.
531. A dead activation is decided from the engine's result on the first determinization of each decision (log types, `conditionNotMet`/`abilityInactive`, no own pending choice, counter made either way), never from card names.
532. Determinizer workarounds: EBP04-010's 7.2.3/7.2.4 asks are rebuilt, earlier asks aren't; unnamed search picks get a guessed hidden card; a bound card whose copies are all elsewhere is dropped.
533. `--decks mixed` pairs the two starters with random EBP01–EBP04 test decks, seeded `<seed>-<pair>-<set>`, each pairing twice with seats swapped.
534. The pre-M13a bot stays registered as `easy-m12`, `medium-m12`, `hard-m12` for comparisons.
535. `bot-explain` defaults to no time limit and the browser's seed (`<botSeed>-<index>`), so its output is the same on any machine.
536. `bot-positions` runs at the browser's 1 s budget by default.
537. Timed tournaments run 5 games at a time on this Mac (6 performance cores).
538. The old weights stay; `counterMade` and `overCommit` were removed after tuning showed no gain; `w.<feature>` overrides stay for M13c.
539. Q23 amended (Paul, provisional): a `monsterOnto` play rule also meets 5.15.1.2's trait requirement for that card; the rank requirement is unchanged; the hand play is unchanged.
540. Release notes: the heading's date is the merge date, so a PR's own entry reads "not merged yet" and the next PR fixes it.

Accepted by Monarch in the hidden decklists review (PR #70).

596. Decision 167 is amended: the determinizer fills the bot's own hidden cards from its own list and the opponent's from `guessHidden`; only the tools' `knowsDecklists` passes the opponent's list.
597. The guess is uniform over the legal pool (step 4's recognizer replaces it behind `guessHidden`).
598. The candidate pool is cached per rank I monster and date.
599. `hard-open` is registered for comparisons alongside `hard-m12`; neither is offered in the web app.
600. The m5g e2e test's seed changes from 3 to 1, because its old seed depended on the bot's play.
601. The bot worker bundles the full card list (`@gojisim/cards/all-cards`) for the deck guess. From `pnpm build`, the worker chunk grows from 381 KB to 973 KB (82 KB to 134 KB gzipped). In the built app (Chromium, the new-game default bot, seed 7, the bot moving first, 6 runs each), the first decision's median goes from 282 ms to 288 ms (+6 ms). The worker starts about 0.7 s before its first request, and its start-up (module load to first reply, 8 runs) goes from a 12.5 to a 15 ms median. That's well under the 100 ms line, so the cards stay bundled.

Accepted by Monarch in the M13c review (PR #NNN).

651. Fixed-search trials: each bot plays `iterations=<mean>` with `--deterministic`. The mean comes from `pnpm search-rate` (10 timed games at 1 s, 5 shards, alone on the machine), and the candidate is paired with Hard's count from the same run, since Hard's mean varies between runs (593 to 694). Fixed-search trials can share the machine; only a winner's 800-game timed run runs alone, overnight. The bar is 55%. About 30% of Hard's decisions hit its 811-iteration cap.
652. A `pnpm bots` run journals each finished game under `bot-reports/runs/<seed>-<key>/` (the key hashes everything that decides the games, not the worker count); the same command resumes it, and the folder is removed once the report is written.
653. Results that changed nothing: `w.position=0.8` (800 timed games, 52.9%), greedy play-outs (400 timed, 48.0%), tactical play-outs (stopped at 183-190, 49.1%), exploration 0.5 and 1.0 (400 fixed-search, 48.7% and 50.2%), `rolloutTurns=2` (400 fixed-search at 386 vs 606 searches, 31.3%). The weights, exploration 0.7 and one play-out turn stay; `rollout=tactical` stays a setting.
654. The useless-card check (M13a pruning) costs 0.8% of the searches per second and stays.
655. The Flying Form position is made only where today's Hard takes the copy (`missedByHard`: 2 of 3 seeds at Hard's 811 iterations, no clock); either Perfect Form (ESD02-013 or EBP01-060) counts as the right pick.
656. `priorVisits` (#75): a new search node starts with that many virtual visits at its static evaluation, from the chooser's side. 20 passes the Flying Form position (19/20 at Hard, 20/20 at 100) with no other position changing; it costs about 9% of the searches (584 vs 645).

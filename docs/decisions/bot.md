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

Accepted by Monarch in the M13c review (PR #144).

651. Fixed-search trials: each bot plays `iterations=<mean>` with `--deterministic`. The mean comes from `pnpm search-rate` (10 timed games at 1 s, 5 shards, alone on the machine), and the candidate is paired with Hard's count from the same run, since Hard's mean varies between runs (593 to 694). Fixed-search trials can share the machine; only a winner's 800-game timed run runs alone, overnight. The bar is 55%. About 30% of Hard's decisions hit its 811-iteration cap.
652. A `pnpm bots` run journals each finished game under `bot-reports/runs/<seed>-<key>/` (the key hashes everything that decides the games, not the worker count); the same command resumes it, and the folder is removed once the report is written.
653. Results that changed nothing: `w.position=0.8` (800 timed games, 52.9%), greedy play-outs (400 timed, 48.0%), tactical play-outs (stopped at 183-190, 49.1%), exploration 0.5 and 1.0 (400 fixed-search, 48.7% and 50.2%), `rolloutTurns=2` (400 fixed-search at 386 vs 606 searches, 31.3%). The weights, exploration 0.7 and one play-out turn stay; `rollout=tactical` stays a setting.
654. The useless-card check (M13a pruning) costs 0.8% of the searches per second and stays.
655. The Flying Form position is made only where today's Hard takes the copy (`missedByHard`: 2 of 3 seeds at Hard's 811 iterations, no clock); either Perfect Form (ESD02-013 or EBP01-060) counts as the right pick.
656. `priorVisits` (#75): a new search node starts with that many virtual visits at its static evaluation, from the chooser's side. 20 passes the Flying Form position (19/20 at Hard, 20/20 at 100) with no other position changing; it costs about 9% of the searches (584 vs 645).
657. `priorVisits=20` is on from Hard up (difficulty 90+), where the trial ran; it stays off at Easy and Medium (Monarch, on #75). The trial: 400 fixed-search games, mixed decks, `priorVisits=20,iterations=584` vs Hard `iterations=645` (each the bot's mean searches at 1 s), 206–194, 51.5% (95% CI 46.6–56.4%): no measurable cost in strength, with Flying Form fixed (19/20). Medium wasn't trialed, and at Easy it made the #132 position worse (below). The m12 comparison bots keep none.
658. Positions for #130, #131 and #132 are made from random starter games (`makePositions.ts`: a spec takes P2's starter and the reported level) and kept only where that level makes the tester's mistake: `battra-larva-evolves-to-copy` (Medium; the tester named it Mothra Larva over Imago, the record shows Battra), `super-x-after-invade` (Medium) and `godzilla-2023-stays-in-zone-8` (Easy). How often the mistake happens over 100 seeds, no clock, `priorVisits` off → on, with copies cut from the testers' games (not committed) beside them:

     - #130 Battra (Larva) copy, Medium: committed 58% → 66%; tester's game 70% → 65%.
     - #131 Super-X before the invade, Medium: committed 88% → 86%; tester's game 84% → 54%.
     - #132 Godzilla (2023) leaves zone 8, Easy: committed 64% → 52%; tester's game 23% → 55%.

     A difference needs about 14 points to be real at 100 seeds: `priorVisits` helps only the tester's Super-X spot and hurts the tester's Easy Godzilla spot, so it isn't a fix for these. #130 and #131 stay open as their own problems.

Accepted by Monarch in the bots-plan review (PR #171).

733. A deck for `--a-deck`/`--b-deck` must pass `validateDeck`; there's no flag to play an illegal deck. The study caught several illegal lists this way before any game.
734. The stop file is `bot-reports/STOP` under the output folder, checked between games. Games in progress finish.
735. A plan matchup's seed is `<plan seed>-<matchup id>`, and its records go to `bot-reports/plans/<name>/records/<id>/`.
736. Kept records use the `GameRecord` shape plus `aSeat` and `result`, so `bot-explain` and replays read them as they are.

Accepted by Monarch in the Hard play rules review (PR #176).

737. The rules act at the search root only, computed once per decision on the first determinization from public information, behind `rules=1` (on from Hard up, `difficultySettings`).
738. Prunes leave an action out only while another stays legal (together with M13a's dead-card set). The prior is +0.15 in evaluation units on a new root child's `priorVisits` (so it's a no-op with `priorVisits=0`).
739. "Held" means: an ability, a shared trait with the active monster, a rank at or above it, and one per rank (the lowest instance id).
740. Rule 4's "counter made" check simulates the activation, then up to 4 more counter-only activations in hand, on the first determinization; it compares counter power with the opponent's threat (7.4.3).
741. Rule 6's "opponent can invade next turn" is the opponent's monster in zone 6, 7 or 8 (an icon-2 invasion from 6 reaches 8).
742. Rule 7 gets no code tonight (see above).
743. The release: the PR stays open until the morning results (Paul's first option), with no flag.
744. The rule positions are made from made-up decks (`positions/decks/`), because a position embeds its whole game record and #170's records hold players' decks.

Accepted by Monarch in the bots-pause review (PR #178).

745. The current-run file is plain text: the folder on the first line and the plan file on the second, both absolute. The shell reads it with `read -r`, so paths with spaces work.
746. `bots-status` finds the running plan with `pgrep -f "plan.ts.*<plan file name>"`, so a plan started with a relative path matches too.
747. Journal counts match the run folder by the matchup's seed prefix (`<plan seed>-<id>-`), without recomputing the run key.

Accepted by Monarch in the Hard rules gaps review (PR #190).

770. A blunder with `rules=1` picks among the moves the rules allow, judged on one determinization; with no allowed move left, among all legal moves.
771. Rule 2 in choices covers only discard-from-hand costs (`pendingChoice.rule === "5.7.1"`), and it leaves the held cards out only while another option stays.
772. Rule 4: while an invasion (`invade` or `invadeFromDeck`) is legal, a counter-only strategy is pruned even when it makes the counter, and the invasions get the prior.
773. Rule 6: the prune covers only plain stat boosts (`statBoostZones`: a continuous ability whose own condition is `zoneOf this in [zones]` and whose modifiers all change counter power or threat). Other zone conditions keep the prior. The full prune (every zone condition) measured 48 % on the guard, the prior 51 %, on the same seed.
774. A rule verdict lists the ruled-out actions by identity (`killed`). A key is dead only when all its actions are; an avoided action gets no visits at the final pick, and a blunder skips it.
775. The prune guard (rules, and rules with M13a's dead set) needs an action left that isn't `concede`. The search never passes `concede`, so this only matters for other callers (tools, tests).
776. The 23dorah count becomes "placed in the opponent's monster column when that play is legal" (Monarch), instead of the per-turn count.

Accepted by Monarch in the full-information setting review (PR #193).

777. Full information is the decklists plus the opponent's hand. The order of both decks (and of the monster deck) stays hidden, as it is for the players themselves.
778. It reuses the revealed-card path instead of a new determinization mode, so it's the same code a real reveal goes through.

Accepted by Monarch in the protection and Gigan review (PR #197).

782. #194 is part of dead-card pruning (Medium and up, `prune=1`), judged from the engine's flags after the activation, not from a card list.
783. #195 is a play rule (Hard and up, `rules=1`). It prunes declining and every payment but the cheapest, so the choice is made by the rule, not the search.
784. "Cheapest" is first a card with no legal play now (`handPlayRankOver` > 0), then the highest evaluation after the discard.
785. The tests build their positions instead of committing the tester's game record, which holds players' decks.

Accepted by Monarch in the deck recognizer review (PR #198).

786. Guards for bot changes run on the top-tier decks (today the 13 Run 2 decks; the list changes with the meta), with seats swapped and the same seed for both versions. Pass is ≥ 50 %. `--decks mixed` is for information only (Paul's rule, Nov 3).
787. The catalog is public meta archetype data in the repo. Deck lists stay local.
788. Recognition reads only public cards and is recomputed each decision. The weights are P_CORE 0.9, P_COMMON 0.5, P_OTHER 0.05, P_NONE 0.15, rank I ×4 / ×0.5, and "none of these" at 25 % before any card is public.
789. A drawn archetype's cards go first only where `guessHidden`'s legality allows (copies, colors, restriction list, invasion icon 2); then the usual fill.
790. `--decks meta` pairs every ordered deck pair, two games each with seats swapped, like `mixed`. The list file is read and validated at the start, and its decks are part of the run's journal key.

Accepted by Monarch in the recognizer archetypes review (PR #206).

801. Recognition weights are likelihood ratios: core ×4, common ×1.5, unlisted ×1, rank I ×6 / ×0.2, "none" 0.3. Legality under the rank I still scales an archetype.
802. A catalog line is one piece of evidence, however many of its cards are seen.
803. The guard is paired. Main's recognizer and this one each play Hard with `recognizer=0` on `--decks meta` (the top-tier list, every ordered pairing twice), on the same seed. This one must do at least as well as main's.

Accepted by Monarch in the cfTarget review (PR #210).

811. `cfTarget` is a test setting of the Hard rules layer, tools only. Its card choices come from card numbers, and `auto` (the default) changes nothing.
812. Any choice of cards from your own hand counts as a cost discard for it. That includes a discard an opponent's effect asks for, since that card still reaches the discard pile.

Accepted by Monarch in the cfTarget 23one review (PR #217).

822. `cfTarget=23one` counts a Mecha-King Ghidorah already in the discard pile, however it got there (a cost, a destroy, a mill). Paul's rule is "at most one there", not "at most one discarded".

Accepted by Monarch in the cfPlan review (PR #220).

826. The plan is one setting, `cfPlan` (default 1, Paul), so runs can compare it with `cfPlan=0`.
827. "Needs GoD's +20,000": short of the opponent's threat without it, and enough with it, at the current board.
828. "Can't get back to 3": Crystals after Constructed Future plus the rebuild still available this turn, as above.
829. "Gravity Beam makes the counter": counter power below the threat before it, and at least the threat after it, in the engine.

Accepted by Monarch in the cfPlan tie-break review (PR #221).

830. The tie-break applies only with a Gravity Beam in hand. Otherwise the search picks between rank 8 cards (Paul).

Accepted by Monarch in the Monster X plan review (PR #223).

832. `mxPlan=1` (default on, Hard rules layer, Monster X monster decks only) holds Paul's Monster X plan, rules 1–14 as listed above, as a preference (Paul, Nov 8). At the root, the moves it leaves are tried first and keep a lasting bias of `MX_PLAN_BIAS` = 0.2 on their value. Values run from −1 to 1, so 0.2 is 10 points of win chance, about 2 standard errors of a move's mean after 100 play-outs. `mxPlan=0` turns it off.
833. Rules 1 and 4 count the player's own turns (their first turn is turn 1).
834. Rule 7 reads the [final-wars] battle cards left in the deck; a Monster X's X counter power counts as 3,000 per color in zones.
835. Rule 14's removal for Mecha-King Ghidorah: Godzilla vs. Megaguirus (the zone wipe) and Kaizer Ghidorah EBP04-035 (the wipe from the lowest zone). A winning invasion may still pay with the last one.
836. Godzilla Final Wars zone picks (Paul's ruling, Nov 7): the Hard bot plays each pick out, with the later picks on the weakest zone left. It keeps the picks with the highest total counter power; ties keep the most battle cards in zones (an empty zone before covering a card). Occupied zones were already legal (decision 582); a human picks freely.
837. Rule 9's turn counts (d): by invading, each turn gains the best invasion icon in hand, then 1 for the end-phase advance up to zone 8, and it wins once an invasion steps out of zone 8; never while the opponent's zone 8 holds a battle card. By countering, a rank r monster needs 5 − r more counters, one a turn, plus a turn while your counter power doesn't reach its threat. (c) needs the opponent to have 2 or more battle cards, since a Monster X with 1 or fewer can't be countered.
838. When the general rules and a plan's rule-outs together leave no move at the root, the plan wins (`combineDead`); this applies to `cfPlan` and the Final Wars picks.
839. Blunder picks apply the plans as the search root does, and prefer the Monster X plan's moves (`blunderAllowed`).
840. A 0-threat Monster X is countered by 2 or more opponent battle cards totalling 0 counter power (Paul's ruling, Nov 7; 7.4.3, a tie counts as a counter). The engine already did this; a test keeps it.

Accepted by Monarch in the Monster X plan v2 review (PR #227).

850. `mxPlan=2` (v2) is the default; `mxPlan=1` is v1 and `mxPlan=0` off. Both versions are preferences through `mxPlanFavored`, with the same 0.2 bias.
851. "Early" in v2 (rules 1 and 6) is the player's own turns 1–4.
852. Rule 2's exception: the covered card's counter power is below the new card's printed counter power (a Monster X's X counts 3,000 a color in zones), and either the covered card's color is missing from the discard pile or the new card's color is missing from the zones.
853. Rule 3's key cards are Godzilla Captured!, Godzilla Final Wars, Monster Island, Godzilla Landing, Entangling Fear and Godzilla vs. Megaguirus.
854. Rule 7: "needed" means playing EBP04-035 destroys 2+ of the opponent's battle cards or their zone 8 card (played out).
855. Rule 10 plays out up to 40 other plays (battle cards and strategies) to look for another way to the counter.
856. Rule 12: an expected board wipe is a wiping card (`wipesBoard`) in the opponent's discard pile, zones, strategy zones or monster stack; or, vs King Ghidorah, their rank 3 with your counter made this turn.
857. Rule 14 (b): from your turn 5, a strategy card in hand whose rank is above your zone, when the invasion (played out) reaches that zone.

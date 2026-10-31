# Decisions

Every decision Monarch accepted in a review, numbered in the order they were made. They lived in CLAUDE.md until #94; each now sits in one area's file, whole review by whole review, with its number unchanged. Code and docs cite them as "decision N".

| Area                                                                                                               | File                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Engine and rules: `packages/engine`, the ability data in `packages/cards/data/abilities/`, and rulings             | [engine.md](engine.md)                           |
| Cards and decks: `packages/cards` (card data, errata, restrictions, images), deck lists, imports and deck legality | [cards-and-decks.md](cards-and-decks.md)         |
| Bots: `packages/bot` and `tools/bots` (search, evaluation, tournaments, positions)                                 | [bot.md](bot.md)                                 |
| Web app: `apps/web`: `/play`, `/debug`, themes, animations, sounds and announcements                               | [web.md](web.md)                                 |
| Server, deploy and feedback: `apps/server`, Railway deploys, the Test Site uploads and the feedback tools          | [server-and-feedback.md](server-and-feedback.md) |
| Repo and CI: the workspace setup, tooling and CI                                                                   | [repo-and-ci.md](repo-and-ci.md)                 |

## Adding decisions

1. A PR lists its proposed decisions under "## Decisions" in its description.
2. Once Monarch accepts them, they go at the end of the area's file under `Accepted by Monarch in the <name> review (PR #N).`, continuing the numbering from the highest number in any file. The PR adds them before it merges, or the next PR does.
3. A review that spans areas goes in the file of its main area; the index below lists every review with its file.

## Every review

| Numbers | Review                                                                                                                         | File                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 1–8     | M0 review (PR #1)                                                                                                              | [repo-and-ci.md](repo-and-ci.md)                 |
| 9–17    | M1a review (PR #2)                                                                                                             | [cards-and-decks.md](cards-and-decks.md)         |
| 18–26   | M1b review (PR #3)                                                                                                             | [cards-and-decks.md](cards-and-decks.md)         |
| 27–35   | M1c review (PR #4)                                                                                                             | [cards-and-decks.md](cards-and-decks.md)         |
| 36–39   | M1d review (PR #5)                                                                                                             | [cards-and-decks.md](cards-and-decks.md)         |
| 40–53   | M3a review (PR #6)                                                                                                             | [engine.md](engine.md)                           |
| 54–66   | M3b review (PR #7)                                                                                                             | [engine.md](engine.md)                           |
| 67–76   | M3c review (PR #8)                                                                                                             | [engine.md](engine.md)                           |
| 77–89   | M3d review (PR #9)                                                                                                             | [engine.md](engine.md)                           |
| 90–100  | M3v review (PR #10)                                                                                                            | [web.md](web.md)                                 |
| 101–113 | M3e review (PR #11)                                                                                                            | [engine.md](engine.md)                           |
| 114–124 | M3f review (PR #12)                                                                                                            | [cards-and-decks.md](cards-and-decks.md)         |
| 125–137 | M4c review (PR #14)                                                                                                            | [engine.md](engine.md)                           |
| 138–148 | M4d review (PR #15)                                                                                                            | [engine.md](engine.md)                           |
| 149–156 | M4e review (PR #16)                                                                                                            | [engine.md](engine.md)                           |
| 157–163 | M4f review (PR #17)                                                                                                            | [engine.md](engine.md)                           |
| 164–171 | M6a review (PR #20)                                                                                                            | [bot.md](bot.md)                                 |
| 172–178 | M6b review (PR #21)                                                                                                            | [bot.md](bot.md)                                 |
| 179–185 | M6c review (PR #22)                                                                                                            | [bot.md](bot.md)                                 |
| 186–193 | M5a review (PR #25)                                                                                                            | [web.md](web.md)                                 |
| 194–201 | M5b review (PR #26)                                                                                                            | [web.md](web.md)                                 |
| 202–205 | PR #26 playmat review (decision 1, mat thumbnails shrinking with the window, was rejected by Paul and replaced by the M5b fix) | [web.md](web.md)                                 |
| 206–213 | M5b fix review (PR #27)                                                                                                        | [web.md](web.md)                                 |
| 214–224 | M5c review (PR #28)                                                                                                            | [web.md](web.md)                                 |
| 225–245 | M5d review (PR #29)                                                                                                            | [web.md](web.md)                                 |
| 246–256 | M5e review (PR #30)                                                                                                            | [web.md](web.md)                                 |
| 257–268 | M5f review (PR #31)                                                                                                            | [web.md](web.md)                                 |
| 269–287 | M5g review (PR #32)                                                                                                            | [web.md](web.md)                                 |
| 288–298 | M7a review (PR #33)                                                                                                            | [cards-and-decks.md](cards-and-decks.md)         |
| 299–308 | M12a-1 review (PR #35)                                                                                                         | [engine.md](engine.md)                           |
| 309–321 | M12a-2 review (PR #36)                                                                                                         | [engine.md](engine.md)                           |
| 322–335 | M12b-1 review (PR #37)                                                                                                         | [engine.md](engine.md)                           |
| 336–345 | M12b-2 review (PR #38)                                                                                                         | [engine.md](engine.md)                           |
| 346–352 | deck legality and speed guard review (PR #39)                                                                                  | [cards-and-decks.md](cards-and-decks.md)         |
| 353–358 | Decklog import review (PR #40)                                                                                                 | [cards-and-decks.md](cards-and-decks.md)         |
| 359–367 | M12c-1 review (PRs #41 and #42)                                                                                                | [engine.md](engine.md)                           |
| 368–377 | M12c-2 review (PR #43)                                                                                                         | [engine.md](engine.md)                           |
| 378–389 | M12d-1 review (PR #44)                                                                                                         | [engine.md](engine.md)                           |
| 390–396 | M5h-1 review (PR #45)                                                                                                          | [web.md](web.md)                                 |
| 397–407 | M5h-2 review (PR #46)                                                                                                          | [web.md](web.md)                                 |
| 408–416 | M5h-3 review (PR #47)                                                                                                          | [web.md](web.md)                                 |
| 417–421 | English promos review (PR #48)                                                                                                 | [cards-and-decks.md](cards-and-decks.md)         |
| 422–428 | dev-deck auto-load review (PR #49)                                                                                             | [cards-and-decks.md](cards-and-decks.md)         |
| 429–438 | M12d-2 review (PR #50)                                                                                                         | [engine.md](engine.md)                           |
| 439–444 | CI speed review (PR #52)                                                                                                       | [repo-and-ci.md](repo-and-ci.md)                 |
| 445–455 | Showa Poster review (PR #53)                                                                                                   | [web.md](web.md)                                 |
| 456–461 | bot hand row review (PR #54)                                                                                                   | [web.md](web.md)                                 |
| 462–465 | CI fixes review (PR #55)                                                                                                       | [repo-and-ci.md](repo-and-ci.md)                 |
| 466–471 | new-game screen review (PR #56)                                                                                                | [web.md](web.md)                                 |
| 472–478 | card back border and bottom-edge hand review (PR #57)                                                                          | [web.md](web.md)                                 |
| 479–485 | First / Second pick modal review (PR #58)                                                                                      | [web.md](web.md)                                 |
| 486–496 | deploy for testers review (PR #59)                                                                                             | [server-and-feedback.md](server-and-feedback.md) |
| 497–502 | deploy docs and Import all review (PR #60)                                                                                     | [server-and-feedback.md](server-and-feedback.md) |
| 503–510 | M12f review (PR #61)                                                                                                           | [engine.md](engine.md)                           |
| 511–518 | M12g review (PR #62)                                                                                                           | [engine.md](engine.md)                           |
| 519–529 | Tester fixes 1 review (PR #63)                                                                                                 | [web.md](web.md)                                 |
| 530–540 | M13a review (PR #64)                                                                                                           | [bot.md](bot.md)                                 |
| 541–552 | M13b review (PR #65)                                                                                                           | [server-and-feedback.md](server-and-feedback.md) |
| 553–568 | bot announcements review (PR #66)                                                                                              | [web.md](web.md)                                 |
| 569–575 | one-file-per-game review (PR #67)                                                                                              | [server-and-feedback.md](server-and-feedback.md) |
| 576–581 | Good Bot! review (PR #68)                                                                                                      | [server-and-feedback.md](server-and-feedback.md) |
| 582–587 | community rulings review (PR #69)                                                                                              | [engine.md](engine.md)                           |
| 588–595 | sound effects review (PR #71)                                                                                                  | [web.md](web.md)                                 |
| 596–601 | hidden decklists review (PR #70)                                                                                               | [bot.md](bot.md)                                 |
| 602–604 | Slack watcher review (PR #101)                                                                                                 | [repo-and-ci.md](repo-and-ci.md)                 |
| 605–608 | Dependabot review (PR #102)                                                                                                    | [repo-and-ci.md](repo-and-ci.md)                 |
| 609–610 | Space Beam review (PR #103)                                                                                                    | [engine.md](engine.md)                           |
| 611–613 | Frozen replacement crash review (PR #110)                                                                                      | [engine.md](engine.md)                           |
| 614–616 | Monster Island Mailbox review (PR #111)                                                                                        | [server-and-feedback.md](server-and-feedback.md) |
| 617–618 | card sounds review (PR #112)                                                                                                   | [web.md](web.md)                                 |
| 619–619 | Q45 monster-in-zones review (PR #113)                                                                                          | [engine.md](engine.md)                           |
| 620–624 | Showa sizing review (PR #114)                                                                                                  | [web.md](web.md)                                 |
| 625–628 | Discord notes review (PR #115)                                                                                                 | [repo-and-ci.md](repo-and-ci.md)                 |
| 629–631 | Report bug context review (PR #116)                                                                                            | [server-and-feedback.md](server-and-feedback.md) |
| 632–633 | Bad Bot! move pick review (PR #117)                                                                                            | [server-and-feedback.md](server-and-feedback.md) |
| 634–639 | Railway IaC review (PR #120)                                                                                                   | [server-and-feedback.md](server-and-feedback.md) |
| 640–644 | GitHub Releases review (PR #122)                                                                                               | [repo-and-ci.md](repo-and-ci.md)                 |
| 645–647 | templates review (PR #124)                                                                                                     | [repo-and-ci.md](repo-and-ci.md)                 |
| 648–650 | decision log review (PR #125)                                                                                                  | [repo-and-ci.md](repo-and-ci.md)                 |
| 651–658 | M13c review (PR #NNN)                                                                                                          | [bot.md](bot.md)                                 |

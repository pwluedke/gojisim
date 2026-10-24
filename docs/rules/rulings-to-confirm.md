# Rulings to Confirm

Paul's provisional rulings. The engine follows them until an official ruling or FAQ says otherwise; then update the ruling here, in spec.md and in the engine.

| #   | Cards                                                                               | Question                                                                                                                                                                              | Provisional ruling (Paul)                                                                               | Date       | Status      |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| Q35 | EBP01-052 Megaguirus, and any "cannot be [destroy] by your opponent's effects" card | Can the opponent choose this card for a "[destroy] N of your opponent's battle cards" effect? 10.5.3 and 1.3.3 don't settle whether a card that can't be destroyed is a legal target. | Yes. It can be chosen; the destroy does nothing to it (1.3.3); a forced "destroy 1" may be spent on it. | 2026-10-23 | Provisional |

## Engine gaps

Known places where the engine doesn't yet follow a card's text, with the reason and when it gets fixed.

| Cards                            | Gap                                                                                                                                                                         | Fix when                                         | Since  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------ |
| EBP02-012 Godzilla (2016) Frozen | A strategy card _destroyed_ by an effect goes to the discard pile instead of offering Frozen's place-under replacement. The 7.2.3 start-phase discard does offer it (10.9). | A destroy can pause for a choice mid-resolution. | M12b-2 |

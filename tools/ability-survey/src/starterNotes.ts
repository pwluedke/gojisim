/**
 * Hand-check notes for every starter card (ESD01, ESD02), shown in survey.md under each card.
 * Each card's text and parts were read against Comprehensive Rules v1.2; "ruling Q" points to a
 * question in findings.md.
 */
export const STARTER_NOTES: Record<string, string> = {
  "ESD01-001": "Correct: no ability text (rank I monster).",
  "ESD01-002":
    "Correct. `with [burst]` filters the searched card by keyword; the search may find nothing (5.8.1.2). Triggers once per advance of an invasion (ruling Q4).",
  "ESD01-003":
    "Correct. Continuous number effect (10.8.1 layer 5), with a condition read after rage (layer 4).",
  "ESD01-004": "Correct. The opponent chooses which cards to keep (5.7.2).",
  "ESD01-005":
    "Correct. A Burst play is a play (5.11.2), so [enter] triggers. The delayed discard follows 12.5.2 to 12.5.3.",
  "ESD01-006": "Correct. `1 of` means 1 target if any is legal (10.5.3.1).",
  "ESD01-007":
    "Correct. Same column follows 4.4.5.4 (decision 49), from this card's position.",
  "ESD01-008": "Correct: reminder text only, restating 8.2.1. No ability.",
  "ESD01-009":
    'Correct. The scraped text ends with a stray "<" (data issue, findings F11).',
  "ESD01-010":
    "Correct. Two separate continuous +5,000 bonuses on another card (`other`), which stack to +10,000. See ruling Q6 for the case where City of Tokyo is itself in zone 8.",
  "ESD01-011":
    "Correct. The second ability is a replacement effect (10.2.1.3.1: 'when A, B instead'), not a trigger: the card never goes to the discard pile, so no Revenge. Ruling Q1: does it apply to rule-action destruction (11.3, 11.5)?",
  "ESD01-012":
    "Correct. A [your-turn] trigger on playing a monster card, an optional move, a zone 8 bonus and the same replacement as ESD01-011. Ruling Q5 on 'unoccupied' and on which plays count.",
  "ESD01-013":
    "Correct, but the 10.1.1.1.2 framing doesn't fit: the text is its own trigger, active while the card is in the strategy zone (10.3.4.3) until the next start phase (7.2.3). See findings F2 and ruling Q10.",
  "ESD01-014":
    "Correct. Playing from the deck by effect places the card in a zone of your choice without your monster (5.11.1.2); the 8.2.1 rank limit applies only to the main phase action. The played card's [enter] triggers.",
  "ESD01-015": "Correct.",
  "ESD01-016": "Correct. Same column as your monster card (4.4.5.4).",
  "ESD02-001": "Correct: no ability text (rank I monster).",
  "ESD02-002": "Correct.",
  "ESD02-003":
    "Correct. Plays from the discard pile into adjacent zones (4.4.5.2; the card's example matches) and in different zones where possible (5.11.1.3). Ruling Q3 covers fewer than 2 targets and occupied zones.",
  "ESD02-004":
    "Correct. The `A: B` cost form isn't defined in CR 1.2 (findings F3, ruling Q2). The rank filter is relative to the discarded card (use its last known information, 10.10).",
  "ESD02-005":
    "Correct. Its reminder ('If you invaded 2 zones, activate this effect 2 times') says When invading triggers once per advance (12.3.2). Ruling Q4 asks whether that applies to every [invading] ability.",
  "ESD02-006": "Correct. 'In play' means in a strategy zone.",
  "ESD02-007":
    "Correct. The reminder differs from 12.6.2: it says 'search ... and play it by stacking' and names the intended card, but leaves out 'reveal' and 'shuffle'. 12.6.2 governs (decision: the keyword text wins over the reminder).",
  "ESD02-008": "Correct. Same reminder wording as ESD02-007.",
  "ESD02-009":
    "Correct. An Awakening gate on an [enter] ability; the reminder adds 'this card was played in zone 8'. Ruling Q7: is Awakening checked when the card is played, at resolution, or both?",
  "ESD02-010":
    "Correct. 'Played through evolution' must be recorded on the card. Ruling Q8b: does an Evolve instruction (5.17, ESD02-014) count?",
  "ESD02-011": "Correct.",
  "ESD02-012":
    "Correct. Two independent conditions; the reminder confirms they stack (+8,000).",
  "ESD02-013": "Correct: no ability text.",
  "ESD02-014":
    "Correct, but under-specified: 5.17 needs 'a specified new battle card' and this text names none (ruling Q8a).",
  "ESD02-015":
    "Correct. Adjacency is on the opponent's layout (4.4.5.2); the card's example matches.",
};

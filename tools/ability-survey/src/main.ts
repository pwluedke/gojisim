import { mkdir, writeFile } from "node:fs/promises";
import { STARTER_NOTES } from "./starterNotes";
import {
  CATEGORIES,
  type CardSurvey,
  type Category,
  inScopeCards,
  type Params,
  type Part,
  surveyCard,
  tokenCards,
} from "./survey";

const OUT = new URL("../../../docs/abilities/", import.meta.url);

const cards = inScopeCards().map(surveyCard);
const tokens = tokenCards().map(surveyCard);

const TITLES: Record<Category, string> = {
  keyword: "Keywords and bracketed icons",
  trigger: "Triggers (grouped by event)",
  condition: "Conditions",
  effect: "Effects (grouped by verb)",
  targeting: "Targeting and choice patterns",
  cost: "Costs and optional actions",
  scaling: "Scaling (for each, equal to)",
  duration: "Durations",
};

interface Row {
  pattern: string;
  example: string;
  cards: Set<string>;
  starters: Set<string>;
  params: Map<string, Set<string>>;
}

function rows(category: Category, from: CardSurvey[]): Row[] {
  const byPattern = new Map<string, Row>();
  // Starter cards first, so examples come from the starters where possible.
  const ordered = [...from].sort(
    (a, b) => Number(b.starter) - Number(a.starter),
  );
  for (const card of ordered) {
    for (const ability of card.abilities) {
      for (const part of ability.parts.filter((p) => p.category === category)) {
        let row = byPattern.get(part.pattern);
        // A part derived from a keyword (e.g. Evolution's main phase trigger) is a poor example.
        if (row && row.example.startsWith("[") && !part.text.startsWith("["))
          row.example = part.text || ability.text;
        if (!row) {
          row = {
            pattern: part.pattern,
            example: part.text || ability.text,
            cards: new Set(),
            starters: new Set(),
            params: new Map(),
          };
          byPattern.set(part.pattern, row);
        }
        row.cards.add(card.deckCardNumber);
        if (card.starter) row.starters.add(card.deckCardNumber);
        for (const [key, value] of Object.entries(part.params ?? {})) {
          if (key === "appliesTo") continue;
          const values = row.params.get(key) ?? new Set();
          values.add(Array.isArray(value) ? value.join("+") : String(value));
          row.params.set(key, values);
        }
      }
    }
  }
  return [...byPattern.values()].sort(
    (a, b) => b.cards.size - a.cards.size || a.pattern.localeCompare(b.pattern),
  );
}

const cell = (text: string) =>
  text.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\s+/g, " ").trim();

const clip = (text: string, n = 90) =>
  text.length > n ? `${text.slice(0, n - 1)}…` : text;

function paramSummary(params: Map<string, Set<string>>): string {
  return [...params.entries()]
    .map(([key, values]) => {
      const list = [...values].sort();
      const shown = list.slice(0, 8).join(", ");
      return `${key}: ${shown}${list.length > 8 ? `, … (${list.length})` : ""}`;
    })
    .join("; ");
}

function table(category: Category, from: CardSurvey[]): string {
  const withParams = category === "effect" || category === "trigger";
  const header = withParams
    ? "| Pattern | Example | Cards | Starters | Parameters seen | Sample cards |\n| --- | --- | --- | --- | --- | --- |"
    : "| Pattern | Example | Cards | Starters | Sample cards |\n| --- | --- | --- | --- | --- |";
  const lines = rows(category, from).map((r) => {
    const samples = [
      ...r.starters,
      ...[...r.cards].filter((c) => !r.starters.has(c)),
    ]
      .slice(0, 5)
      .join(", ");
    const base = [
      `\`${cell(r.pattern)}\``,
      cell(clip(r.example)),
      String(r.cards.size),
      String(r.starters.size),
    ];
    if (withParams) base.push(cell(paramSummary(r.params)) || "-");
    base.push(samples);
    return `| ${base.join(" | ")} |`;
  });
  return [header, ...lines].join("\n");
}

function formatParams(params: Params | undefined): string {
  if (!params) return "";
  const entries = Object.entries(params).map(
    ([k, v]) => `${k}=${Array.isArray(v) ? v.join("+") : String(v)}`,
  );
  return entries.length > 0 ? ` (${entries.join(", ")})` : "";
}

function partLine(part: Part): string {
  return `${part.category}: \`${part.pattern}\`${formatParams(part.params)}`;
}

function cardSection(card: CardSurvey): string {
  const lines = [`#### ${card.deckCardNumber} ${card.name} (${card.type})`, ""];
  if (card.abilities.length === 0) lines.push("No ability text.", "");
  for (const ability of card.abilities) {
    lines.push(`> ${ability.text.replace(/\n/g, "<br>")}`, "");
    const parts = ability.parts.filter(
      (p) =>
        !(
          p.category === "keyword" && /^(trait icon|card name)/.test(p.pattern)
        ),
    );
    if (parts.length === 0) lines.push("- (reminder text only, no ability)");
    for (const part of parts) lines.push(`- ${partLine(part)}`);
    lines.push("");
  }
  const note = STARTER_NOTES[card.deckCardNumber];
  if (note) lines.push(`Hand check: ${note}`, "");
  return lines.join("\n");
}

const starters = cards.filter((c) => c.starter);
const unclassified = cards.flatMap((c) =>
  c.unclassified.map((u) => `- ${c.deckCardNumber}: "${u}"`),
);
const clarifications = new Map<string, string[]>();
for (const card of cards)
  for (const note of card.clarifications) {
    const list = clarifications.get(note) ?? [];
    list.push(card.deckCardNumber);
    clarifications.set(note, list);
  }

const md = [
  "# Ability text survey (M4a)",
  "",
  "Generated by `pnpm survey` (`tools/ability-survey`). Do not edit by hand; flags and ruling questions are in [findings.md](findings.md).",
  "",
  `Scope: ${cards.length} distinct cards (one per \`deckCardNumber\`, base print, errata applied with \`getCardText\`), without Rage cards (3.4.2.1) and Token cards. ${starters.length} of them are starter cards (ESD01, ESD02). ${tokens.length} Token cards are listed separately. A card counts once per pattern however often the pattern appears on it.`,
  "",
  "Patterns come from a regex classifier (`tools/ability-survey/src/survey.ts`); every starter card was also checked by hand (see the starter section). Card text is matched lowercased, so example text is lowercase.",
  "",
  ...CATEGORIES.flatMap((category) => [
    `## ${TITLES[category]}`,
    "",
    table(category, cards),
    "",
  ]),
  "## Token cards (9.1)",
  "",
  "Created by effects, never in a deck (6.1.1.5).",
  "",
  "| Card | Name | Text | Parts |",
  "| --- | --- | --- | --- |",
  ...tokens.map(
    (t) =>
      `| ${t.deckCardNumber} | ${cell(t.name)} | ${cell(t.abilities.map((a) => a.text).join(" / ")) || "-"} | ${
        cell(
          t.abilities
            .flatMap((a) => a.parts)
            .filter(
              (p) =>
                !(
                  p.category === "keyword" &&
                  /^(trait icon|card name)/.test(p.pattern)
                ),
            )
            .map((p) => `${p.category}: ${p.pattern}`)
            .join("; "),
        ) || "-"
      } |`,
  ),
  "",
  "## Starter cards (ESD01, ESD02), checked by hand",
  "",
  ...starters.map(cardSection),
  "## Rules clarifications in parentheses",
  "",
  "Parenthesized text that is more than a keyword's standard reminder. It is not counted as unclassified, but M4b may need it (most of it restates or narrows a rule).",
  "",
  "| Text | Cards |",
  "| --- | --- |",
  ...[...clarifications.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([text, list]) => `| ${cell(text)} | ${list.join(", ")} |`),
  "",
  "## Unclassified text",
  "",
  unclassified.length === 0
    ? "None: every clause matched at least one effect (or a choice or branch that sets one up)."
    : unclassified.join("\n"),
  "",
].join("\n");

const json = {
  description:
    "M4a ability survey: card id -> parts. Generated by `pnpm survey`; see survey.md.",
  inScope: cards.length,
  cards: Object.fromEntries(cards.map((c) => [String(c.id), c])),
  tokens: Object.fromEntries(tokens.map((t) => [String(t.id), t])),
};

await mkdir(OUT, { recursive: true });
await writeFile(new URL("survey.md", OUT), md);
await writeFile(
  new URL("survey.json", OUT),
  `${JSON.stringify(json, null, 2)}\n`,
);
console.log(
  `${cards.length} cards (${starters.length} starters), ${tokens.length} tokens, ${unclassified.length} unclassified -> docs/abilities/`,
);

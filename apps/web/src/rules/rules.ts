import RULES_TEXT from "../../../../docs/rules/comprehensive-rules-v1.2.txt?raw";

/** One numbered rule (or section heading) of the Comprehensive Rules v1.2 (M5h #11). */
export interface Rule {
  /** The body number, e.g. "7.2.1" (spec.md: the body's numbers are the ones to use). */
  number: string;
  /** How deep it is: "7" is 1, "7.2" is 2, "7.2.1" is 3. */
  depth: number;
  text: string;
}

/** Numbers compare part by part: 7.2.10 comes after 7.2.9. */
function after(a: string, b: string): boolean {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) > (y[i] ?? -1);
  }
  return false;
}

/**
 * Parses `docs/rules/comprehensive-rules-v1.2.txt` (extracted column by column, with page
 * markers) into numbered rules. The table of contents before "Rules" is skipped. A number at a
 * line start begins a rule only if it comes after the last one (the README: they ascend), so a
 * cross-reference that wraps onto a new line ("7.5.5 did not resolve") stays in its rule.
 */
export function parseRules(text: string): Rule[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === "Rules");
  const rules: Rule[] = [];
  let last = "0";
  for (const line of lines.slice(start + 1)) {
    if (/^===== Page \d+ =====$/.test(line.trim()) || line.trim() === "")
      continue;
    // "7.2.1. The ..." (dotted), or a heading at the line start: "7.2 Start Phase".
    const match =
      /^\s*(\d+(?:\.\d+)*)\.\s+(.+)$/.exec(line) ??
      /^(\d+\.\d+)\s+([A-Z].*)$/.exec(line);
    const number = match?.[1];
    if (match && number && after(number, last)) {
      rules.push({
        number,
        depth: number.split(".").length,
        text: (match[2] ?? "").trim(),
      });
      last = number;
    } else if (rules.length > 0) {
      const rule = rules[rules.length - 1] as Rule;
      rule.text = `${rule.text} ${line.trim()}`.replace(/(\w)- (\w)/g, "$1$2");
    }
  }
  return rules;
}

let parsed: Rule[] | null = null;

/** Every rule, parsed once. */
export function allRules(): Rule[] {
  parsed ??= parseRules(RULES_TEXT);
  return parsed;
}

/** A rule by its number ("8.2" or "10.5.3"), or `undefined` if the text has none. */
export function ruleByNumber(number: string): Rule | undefined {
  return allRules().find((r) => r.number === number);
}

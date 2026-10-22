import { parseArgs } from "node:util";
import { abilityCoverage, type StatusCounts } from "./coverage";

const { values } = parseArgs({
  options: {
    set: { type: "string" },
    status: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

const coverage = abilityCoverage();
const rows = coverage.rows.filter(
  (r) =>
    (!values.set || r.set === values.set) &&
    (!values.status || r.status === values.status),
);
if (values.json) {
  console.log(JSON.stringify({ ...coverage, rows }, null, 2));
} else {
  const counts = (c: StatusCounts) =>
    `${c.implemented} implemented, ${c.partial} partial, ${c.manual} manual`;
  console.log(
    `Ability coverage (docs/abilities/format.md), ${coverage.rows.length} cards`,
  );
  console.log(`  All:      ${counts(coverage.total)}`);
  console.log(`  Starters: ${counts(coverage.starters)}`);
  for (const [set, c] of Object.entries(coverage.bySet).sort())
    console.log(`  ${set.padEnd(8)}  ${counts(c)}`);
  console.log("");
  for (const r of rows)
    console.log(
      `${r.status.padEnd(11)} ${r.deckCardNumber.padEnd(11)} ${r.name}${r.deckRules.length ? `  [deck rules: ${r.deckRules.join(", ")}]` : ""}`,
    );
}

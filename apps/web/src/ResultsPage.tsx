import { useEffect, useMemo, useState } from "react";
import {
  type AgreementRow,
  agreementShare,
  type Check,
  isGuideDeck,
  type Mistake,
  mistakeRate,
  mistakeVerdict,
  type ResultsData,
  disagrees,
  type Read,
  readFor,
  type ReadWord,
  type Run,
  validateResults,
  verdict,
  winRange,
} from "@gojisim/cards/results";
import styles from "./ResultsPage.module.css";
import { ThemeHeader } from "./ThemeHeader";

/*
 * #340 (Paul, Nov 14): what each bot change did, deck by deck. The data comes from the server
 * (`GET /api/results`, behind the site sign-in) and never from the repo. Mistakes before and
 * after each fix first, then win rates per change, each guide deck over time, and the field run.
 */

type Verdict = "better" | "level" | "worse";
const VERDICT_WORDS: Record<Verdict, string> = {
  better: "Better",
  level: "Level",
  worse: "Worse",
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function VerdictTag({ v }: { v: Verdict }) {
  return (
    <span className={`${styles.tag} ${styles[v]}`} data-testid="verdict">
      {VERDICT_WORDS[v]}
    </span>
  );
}

/**
 * One bar with its 95% range, on a 0 to `max` scale; `text` is what the bar says (and what a
 * hover shows).
 */
function Bar({
  value,
  low,
  high,
  max,
  arm,
  text,
}: {
  value: number;
  low: number;
  high: number;
  max: number;
  arm: "a" | "b";
  text: string;
}) {
  const at = (x: number) => `${Math.min(100, (x / max) * 100)}%`;
  return (
    <div className={styles.barRow} title={text}>
      <span className={styles.arm}>{arm === "a" ? "A" : "B"}</span>
      <div className={styles.track}>
        <div
          className={`${styles.bar} ${arm === "a" ? styles.barA : styles.barB}`}
          style={{ width: at(value) }}
        />
        <div
          className={styles.range}
          style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }}
        />
      </div>
      <span className={styles.barText}>{text}</span>
    </div>
  );
}

/** Chart: each fix's mistake, A vs B, per 100 games or chances. */
function MistakeChart({ rows }: { rows: { check: Check; m: Mistake }[] }) {
  if (rows.length === 0)
    return (
      <p className={styles.note}>No mistake counts for these decks yet.</p>
    );
  const max = Math.max(
    ...rows.flatMap(({ m }) => [
      mistakeRate(m, m.a).high,
      mistakeRate(m, m.b).high,
    ]),
    1,
  );
  return (
    <div className={styles.rows} data-testid="mistake-chart">
      {rows.map(({ check, m }) => {
        const a = mistakeRate(m, m.a);
        const b = mistakeRate(m, m.b);
        const unit = m.per === "games" ? "per 100 games" : "per 100 chances";
        const say = (arm: { count: number; of: number }, r: typeof a) =>
          `${r.rate.toFixed(1)} ${unit} (${arm.count} in ${arm.of}; 95% range ${r.low.toFixed(1)}–${r.high.toFixed(1)})`;
        return (
          <div
            key={`${check.id}-${m.name}-${m.deck ?? ""}`}
            className={styles.row}
            data-testid="mistake-row"
          >
            <div className={styles.rowHead}>
              <strong>{m.name}</strong>
              <VerdictTag v={mistakeVerdict(m)} />
              <span className={styles.meta}>
                {check.change}
                {m.deck ? ` · ${m.deck}` : ""}
                {m.issues.length > 0
                  ? ` · reported in ${m.issues.join(", ")}`
                  : ""}
              </span>
            </div>
            <Bar
              arm="a"
              max={max}
              value={a.rate}
              low={a.low}
              high={a.high}
              text={say(m.a, a)}
            />
            <Bar
              arm="b"
              max={max}
              value={b.rate}
              low={b.low}
              high={b.high}
              text={say(m.b, b)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Chart: each change's win %, A vs B, per deck. */
function WinChart({
  checks,
  show,
}: {
  checks: Check[];
  show: (deck: string) => boolean;
}) {
  const rows = checks.flatMap((check) =>
    check.decks.filter((d) => show(d.deck)).map((d) => ({ check, d })),
  );
  if (rows.length === 0)
    return <p className={styles.note}>No checks for these decks yet.</p>;
  return (
    <div className={styles.rows} data-testid="win-chart">
      {rows.map(({ check, d }) => {
        const a = winRange(d.aWins, d.games);
        const b = winRange(d.bWins, d.games);
        const say = (wins: number, r: typeof a) =>
          `${pct(r.rate)} (${wins} of ${d.games}; 95% range ${pct(r.low)}–${pct(r.high)})`;
        return (
          <div
            key={`${check.id}-${d.deck}`}
            className={styles.row}
            data-testid="win-row"
          >
            <div className={styles.rowHead}>
              <strong>{check.change}</strong>
              <VerdictTag v={verdict(d)} />
              <span className={styles.meta}>
                {d.deck} · {check.date}
                {check.pr ? ` · ${check.pr}` : ""}
                {check.switch ? ` · switch ${check.switch}` : ""} ·{" "}
                {check.level}
              </span>
            </div>
            <Bar
              arm="a"
              max={1}
              value={a.rate}
              low={a.low}
              high={a.high}
              text={say(d.aWins, a)}
            />
            <Bar
              arm="b"
              max={1}
              value={b.rate}
              low={b.low}
              high={b.high}
              text={say(d.bWins, b)}
            />
            {d.msMedian && d.msP95 && (
              <p className={styles.meta}>
                Time per move: median {d.msMedian[0]} ms → {d.msMedian[1]} ms,
                p95 {d.msP95[0]} ms → {d.msP95[1]} ms
              </p>
            )}
            {d.invasionsPerGame && (
              <p className={styles.meta}>
                Invasions per game: {d.invasionsPerGame[0]} →{" "}
                {d.invasionsPerGame[1]}
              </p>
            )}
            {d.countersPerGame && (
              <p className={styles.meta}>
                Counters per game: {d.countersPerGame[0]} →{" "}
                {d.countersPerGame[1]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A run's overall win rate per row deck. */
function runTotals(run: Run): Map<string, { wins: number; games: number }> {
  const totals = new Map<string, { wins: number; games: number }>();
  for (const c of run.cells) {
    if (c.row === c.column) continue;
    const t = totals.get(c.row) ?? { wins: 0, games: 0 };
    totals.set(c.row, { wins: t.wins + c.wins, games: t.games + c.games });
  }
  return totals;
}

/** Chart: each shown deck's win % over time: B of each check it was in, and each field run. */
function OverTime({
  data,
  show,
}: {
  data: ResultsData;
  show: (deck: string) => boolean;
}) {
  type Point = { date: string; rate: number; label: string; games: number };
  const series = new Map<string, Point[]>();
  const add = (deck: string, p: Point) =>
    series.set(deck, [...(series.get(deck) ?? []), p]);
  for (const c of data.checks)
    for (const d of c.decks)
      if (show(d.deck))
        add(d.deck, {
          date: c.date,
          rate: d.bWins / d.games,
          label: c.change,
          games: d.games,
        });
  for (const r of data.runs)
    for (const [deck, t] of runTotals(r))
      if (show(deck))
        add(deck, {
          date: r.date,
          rate: t.wins / t.games,
          label: r.name,
          games: t.games,
        });
  const dates = [
    ...new Set([...series.values()].flat().map((p) => p.date)),
  ].sort();
  if (dates.length === 0)
    return <p className={styles.note}>No results for these decks yet.</p>;
  const W = 640;
  const H = 240;
  const pad = 32;
  const x = (date: string) =>
    pad +
    (dates.length === 1
      ? (W - 2 * pad) / 2
      : (dates.indexOf(date) * (W - 2 * pad)) / (dates.length - 1));
  const y = (rate: number) => H - pad - rate * (H - 2 * pad);
  const decks = [...series.keys()].sort();
  return (
    <div data-testid="over-time">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label="Win rate over time per deck"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={pad}
              x2={W - pad}
              y1={y(t)}
              y2={y(t)}
              className={styles.grid}
            />
            <text x={4} y={y(t) + 4} className={styles.axis}>
              {t * 100}%
            </text>
          </g>
        ))}
        {dates.map((date) => (
          <text
            key={date}
            x={x(date)}
            y={H - 8}
            textAnchor="middle"
            className={styles.axis}
          >
            {date.slice(5)}
          </text>
        ))}
        {decks.map((deck, i) => {
          const points = [...(series.get(deck) ?? [])].sort((p, q) =>
            p.date.localeCompare(q.date),
          );
          const color = `var(--series-${i % 6})`;
          return (
            <g key={deck} data-testid="over-time-series">
              <polyline
                fill="none"
                stroke={color}
                strokeWidth={2}
                points={points
                  .map((p) => `${x(p.date)},${y(p.rate)}`)
                  .join(" ")}
              />
              {points.map((p) => (
                <circle
                  key={`${p.date}-${p.label}`}
                  cx={x(p.date)}
                  cy={y(p.rate)}
                  r={4}
                  fill={color}
                >
                  <title>{`${deck}: ${pct(p.rate)} of ${p.games} games, ${p.label} (${p.date})`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <ul className={styles.legend}>
        {decks.map((deck, i) => (
          <li key={deck}>
            <span
              className={styles.swatch}
              style={{ background: `var(--series-${i % 6})` }}
            />{" "}
            {deck}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The read's short form in a heat map cell. */
const READ_SHORT: Record<ReadWord, string> = {
  "heavily favoured": "HF",
  favoured: "F",
  even: "E",
  unfavoured: "U",
  "heavily unfavoured": "HU",
  disputed: "D",
};

/**
 * Chart: a field run as a heat map, the row deck's wins against the column deck, with what
 * players say of the matchup (#340 part b) and where the bot disagrees with them.
 */
function HeatMap({
  run,
  reads,
  show,
}: {
  run: Run;
  reads: readonly Read[];
  show: (deck: string) => boolean;
}) {
  const decks = [...new Set(run.cells.flatMap((c) => [c.row, c.column]))]
    .filter(show)
    .sort();
  const cell = (row: string, column: string) =>
    run.cells.find((c) => c.row === row && c.column === column);
  const disagree = run.cells.flatMap((c) => {
    if (c.row === c.column || !show(c.row) || !show(c.column)) return [];
    const read = readFor(reads, c.row, c.column);
    // One line per matchup: from the side the read names.
    if (!read || !read.decks.includes(c.row)) return [];
    return disagrees(read.read, c.wins, c.games) ? [{ c, read }] : [];
  });
  return (
    <div data-testid="heat-map">
      <div className={styles.scroll}>
        <table className={styles.heat}>
          <thead>
            <tr>
              <th />
              {decks.map((d) => (
                <th key={d} scope="col">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decks.map((row) => (
              <tr key={row}>
                <th scope="row">{row}</th>
                {decks.map((column) => {
                  const c = cell(row, column);
                  if (!c || row === column)
                    return (
                      <td key={column} className={styles.empty}>
                        –
                      </td>
                    );
                  const rate = c.wins / c.games;
                  const read = readFor(reads, row, column);
                  const says = read
                    ? `; players say ${read.read} (${read.source}, ${read.date}${read.note ? `; ${read.note}` : ""})`
                    : "";
                  return (
                    <td
                      key={column}
                      style={{
                        background: `color-mix(in srgb, var(--color-legal) ${Math.round(rate * 100)}%, var(--color-illegal))`,
                      }}
                      title={`${row} vs ${column}: ${c.wins} of ${c.games} (${pct(rate)})${says}`}
                      data-testid="heat-cell"
                    >
                      {Math.round(rate * 100)}
                      {read && (
                        <span className={styles.says} data-testid="heat-read">
                          {" "}
                          · {READ_SHORT[read.read]}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.meta}>
        Row deck&apos;s win % against the column deck, and what players say from
        the row deck&apos;s side: HF heavily favoured, F favoured, E even, U
        unfavoured, HU heavily unfavoured, D disputed. Hover a cell for the
        source.
      </p>
      <p className={styles.meta} data-testid="read-bands">
        Rough guide to the reads, not a target: even 45–55%, favoured 55–65%,
        heavily favoured 65% and up (and the same below 50% for unfavoured). A
        mirror match should be about 50%.
      </p>
      {disagree.length > 0 && (
        <div data-testid="disagree">
          <h3 className={styles.small}>
            Where the bot and the players disagree
          </h3>
          <p className={styles.meta}>
            The bot&apos;s 95% range lies wholly outside the read&apos;s rough
            band: the weaker deck&apos;s plan may have a gap to fix.
          </p>
          <ul>
            {disagree.map(({ c, read }) => (
              <li key={`${c.row}-${c.column}`}>
                {c.row} vs {c.column}: the bot wins {pct(c.wins / c.games)} of{" "}
                {c.games}; players say {read.read} ({read.source}, {read.date}
                {read.note ? `; ${read.note}` : ""})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type Row = {
  change: string;
  date: string;
  deck: string;
  games: number;
  a: number;
  b: number;
  v: Verdict;
};

/** The table of every check's numbers, sortable. */
function NumbersTable({
  checks,
  show,
}: {
  checks: Check[];
  show: (deck: string) => boolean;
}) {
  const [sort, setSort] = useState<{ key: keyof Row; up: boolean }>({
    key: "date",
    up: false,
  });
  const rows = useMemo(() => {
    const all: Row[] = checks.flatMap((c) =>
      c.decks
        .filter((d) => show(d.deck))
        .map((d) => ({
          change: c.change,
          date: c.date,
          deck: d.deck,
          games: d.games,
          a: d.aWins / d.games,
          b: d.bWins / d.games,
          v: verdict(d),
        })),
    );
    return all.sort((x, y) => {
      const p = x[sort.key];
      const q = y[sort.key];
      const order = p < q ? -1 : p > q ? 1 : 0;
      return sort.up ? order : -order;
    });
  }, [checks, show, sort]);
  const head = (key: keyof Row, label: string) => (
    <th scope="col">
      <button
        type="button"
        className={styles.sortButton}
        onClick={() =>
          setSort((s) => ({ key, up: s.key === key ? !s.up : true }))
        }
      >
        {label}
        {sort.key === key ? (sort.up ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
  return (
    <div className={styles.scroll}>
      <table className={styles.table} data-testid="numbers-table">
        <thead>
          <tr>
            {head("date", "Date")}
            {head("change", "Change")}
            {head("deck", "Deck")}
            {head("games", "Games per arm")}
            {head("a", "A win %")}
            {head("b", "B win %")}
            {head("v", "Result")}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.change}-${r.deck}-${r.date}`}>
              <td>{r.date}</td>
              <td>{r.change}</td>
              <td>{r.deck}</td>
              <td>{r.games}</td>
              <td>{pct(r.a)}</td>
              <td>{pct(r.b)}</td>
              <td>{VERDICT_WORDS[r.v]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * #365: Kaiju Classroom's agreement: per deck, the share of bot turns that ended in the same
 * position as the player's, over time (all bot versions of the day together) and by bot version.
 */
function Agreement({
  rows,
  show,
}: {
  rows: readonly AgreementRow[];
  show: (deck: string) => boolean;
}) {
  const shown = rows.filter((r) => show(r.deck));
  if (shown.length === 0)
    return (
      <p className={styles.note} data-testid="agreement-none">
        No Kaiju Classroom turns for these decks yet.
      </p>
    );
  const decks = [...new Set(shown.map((r) => r.deck))].sort();
  const dates = [...new Set(shown.map((r) => r.date))].sort();
  const W = 640;
  const H = 240;
  const pad = 32;
  const x = (date: string) =>
    pad +
    (dates.length === 1
      ? (W - 2 * pad) / 2
      : (dates.indexOf(date) * (W - 2 * pad)) / (dates.length - 1));
  const y = (rate: number) => H - pad - rate * (H - 2 * pad);
  const versions = [
    ...new Set(shown.map((r) => `${r.deck}\u0000${r.botVersion}`)),
  ]
    .map((key) => key.split("\u0000") as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return (
    <div data-testid="agreement">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label="Kaiju Classroom agreement over time per deck"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={pad}
              x2={W - pad}
              y1={y(t)}
              y2={y(t)}
              className={styles.grid}
            />
            <text x={4} y={y(t) + 4} className={styles.axis}>
              {t * 100}%
            </text>
          </g>
        ))}
        {dates.map((date) => (
          <text
            key={date}
            x={x(date)}
            y={H - 8}
            textAnchor="middle"
            className={styles.axis}
          >
            {date.slice(5)}
          </text>
        ))}
        {decks.map((deck, i) => {
          const color = `var(--series-${i % 6})`;
          const points = dates.flatMap((date) => {
            const day = shown.filter((r) => r.deck === deck && r.date === date);
            return day.length ? [{ date, ...agreementShare(day) }] : [];
          });
          return (
            <g key={deck} data-testid="agreement-series">
              <polyline
                fill="none"
                stroke={color}
                strokeWidth={2}
                points={points
                  .map((p) => `${x(p.date)},${y(p.share)}`)
                  .join(" ")}
              />
              {points.map((p) => (
                <circle
                  key={p.date}
                  cx={x(p.date)}
                  cy={y(p.share)}
                  r={4}
                  fill={color}
                >
                  <title>{`${deck}: ${pct(p.share)} of ${p.turns} bot turns matched (${p.date})`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <ul className={styles.legend}>
        {decks.map((deck, i) => (
          <li key={deck}>
            <span
              className={styles.swatch}
              style={{ background: `var(--series-${i % 6})` }}
            />{" "}
            {deck}
          </li>
        ))}
      </ul>
      <table className={styles.table} data-testid="agreement-versions">
        <thead>
          <tr>
            <th>Deck</th>
            <th>Bot version</th>
            <th>Bot turns</th>
            <th>Same as the player</th>
            <th>About the same</th>
            <th>Worse</th>
            <th>Better</th>
          </tr>
        </thead>
        <tbody>
          {versions.map(([deck, version]) => {
            const these = shown.filter(
              (r) => r.deck === deck && r.botVersion === version,
            );
            const t = agreementShare(these);
            const sum = (k: "aboutSame" | "worse" | "better") =>
              these.reduce((n, r) => n + r[k], 0);
            return (
              <tr key={`${deck}-${version}`} data-testid="agreement-row">
                <td>{deck}</td>
                <td>{version}</td>
                <td>{t.turns}</td>
                <td>
                  {t.same} ({pct(t.share)})
                </td>
                <td>{sum("aboutSame")}</td>
                <td>{sum("worse")}</td>
                <td>{sum("better")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ResultsPage() {
  const [data, setData] = useState<ResultsData | null | "missing">(null);
  const [all, setAll] = useState(false);
  const [runId, setRunId] = useState("");
  // #365: Kaiju Classroom's agreement, from the server's own route (none: the section says so).
  const [agreement, setAgreement] = useState<AgreementRow[]>([]);
  useEffect(() => {
    let live = true;
    void fetch("/api/results/classroom", {
      headers: { accept: "application/json" },
    })
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((body) => {
        const rows = (body as { rows?: unknown } | null)?.rows;
        if (live && Array.isArray(rows)) setAgreement(rows as AgreementRow[]);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    void fetch("/api/results", { headers: { accept: "application/json" } })
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((body) => {
        if (!live) return;
        setData(
          body && validateResults(body).length === 0
            ? (body as ResultsData)
            : "missing",
        );
      })
      .catch(() => live && setData("missing"));
    return () => {
      live = false;
    };
  }, []);
  const show = useMemo(() => (deck: string) => all || isGuideDeck(deck), [all]);
  const checks = useMemo(
    () =>
      data && data !== "missing"
        ? [...data.checks].sort((p, q) => p.date.localeCompare(q.date))
        : [],
    [data],
  );
  const mistakes = checks.flatMap((check) =>
    (check.mistakes ?? [])
      .filter((m) => !m.deck || show(m.deck))
      .map((m) => ({ check, m })),
  );
  const runs =
    data && data !== "missing"
      ? [...data.runs].sort((p, q) => q.date.localeCompare(p.date))
      : [];
  const run = runs.find((r) => r.id === runId) ?? runs[0];

  return (
    <div className="gojisim">
      <ThemeHeader />
      <main className={styles.page} data-testid="results-page">
        <h1 className={styles.title}>Bot results</h1>
        <section className={styles.intro} data-testid="results-intro">
          <p>
            <strong>What this page measures.</strong> The bot improves through
            changes: card rules, deck plans from play guides, and fixes for
            mistakes testers report. Each change is checked the same way. The
            bot plays the same games twice, with the same decks and the same
            shuffles, once without the change (A) and once with it (B). Anything
            that differs between A and B comes from the change.
          </p>
          <p>
            <strong>Mistakes before and after a fix.</strong> A tester reports a
            mistake, such as passing when a counter was available. We count how
            often the bot makes that mistake in A, and again in B. This is the
            most direct measure of a fix: it shows the mistake getting rarer.
          </p>
          <p>
            <strong>Win rates before and after a change.</strong> A change can
            fix its mistake and still make the bot play worse elsewhere, so each
            check also compares the deck&apos;s wins in A and B. Most single
            changes move wins by only a few points, which a few hundred games
            can&apos;t separate from luck. So a &ldquo;Level&rdquo; result
            usually means &ldquo;no harm done&rdquo;, the result we want from a
            mistake fix.
          </p>
          <p>
            <strong>What noise is.</strong> Two runs of the same code with
            different shuffles give different win rates, because of the draws.
            That spread is the noise. With 200 games, a deck&apos;s win rate can
            land anywhere in a range about 13 points wide by luck alone. Each
            result shows its 95% range. When the paired games don&apos;t favour
            one side beyond that range, we call it &ldquo;Level&rdquo; and
            don&apos;t treat the difference as a change, so decisions
            aren&apos;t made on luck.
          </p>
          <p>
            <strong>Win rates across the field.</strong> Field runs play every
            guide deck against every other with the current code. Those numbers
            depend on both decks and on how well the bot plays each, and several
            decks are being improved at once. So a field win rate measures the
            deck and its plan together, not the deck alone. Use the A/B checks
            to see what a change did, and the field runs to see where the
            bot&apos;s play stands now.
          </p>
          <p>
            <strong>What the field numbers should look like.</strong> There is
            no fixed target such as 50% or 75%: matchups aren&apos;t even, and
            players already know which decks are favoured against which. The
            goal is for the bot&apos;s matchups to match what strong players
            see. Where the bot&apos;s number is far from what players report,
            the weaker deck&apos;s plan has a gap to fix. One check does have a
            fixed answer: in a mirror match (the same deck and plan on both
            sides), each side should win about 50%, with going first making the
            only difference.
          </p>
        </section>
        {data === null ? (
          <p>Loading…</p>
        ) : data === "missing" ? (
          <p data-testid="results-missing">
            The results aren&apos;t available right now.
          </p>
        ) : (
          <>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => setAll(e.target.checked)}
                data-testid="results-show-all"
              />
              Show all decks (the guide decks otherwise)
            </label>
            <section className={styles.section}>
              <h2 className={styles.heading}>
                Mistakes before (A) and after (B) each fix
              </h2>
              <p className={styles.caption}>
                How often the bot made each fix&apos;s mistake, on the same
                games with and without the fix, per 100 games or per 100 chances
                to make it. Bars show the 95% range.
              </p>
              <MistakeChart rows={mistakes} />
            </section>
            <section className={styles.section}>
              <h2 className={styles.heading}>
                Win rate before (A) and after (B) each change
              </h2>
              <p className={styles.caption}>
                Each deck&apos;s wins against its check&apos;s opponents, on the
                same games with and without the change. Bars show the 95% range;
                the result is judged from the paired difference.
              </p>
              <WinChart checks={checks} show={show} />
            </section>
            <section className={styles.section}>
              <h2 className={styles.heading}>
                Each deck&apos;s win rate over time
              </h2>
              <p className={styles.caption}>
                Each point is a deck&apos;s win rate after a change (B of a
                check) or across a field run, against that check&apos;s or
                run&apos;s opponents. Hover a point for its change and games.
              </p>
              <OverTime data={data} show={show} />
            </section>
            {run && (
              <section className={styles.section}>
                <h2 className={styles.heading}>Field run: {run.name}</h2>
                <p className={styles.caption}>
                  {run.date}
                  {run.commit ? ` · code ${run.commit}` : ""} · {run.plans}
                </p>
                {runs.length > 1 && (
                  <select
                    value={run.id}
                    onChange={(e) => setRunId(e.target.value)}
                    data-testid="results-run"
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.date})
                      </option>
                    ))}
                  </select>
                )}
                <HeatMap run={run} reads={data.reads ?? []} show={show} />
              </section>
            )}
            <section className={styles.section}>
              <h2 className={styles.heading}>
                Kaiju Classroom: does the bot play your turn?
              </h2>
              <p className={styles.caption}>
                In Kaiju Classroom games, players play the bot&apos;s turn
                first, then the bot plays its own. Each point is the share of a
                deck&apos;s bot turns that ended in the same position as the
                player&apos;s, that day; the table splits them by bot version
                with the players&apos; ratings of the others.
              </p>
              <Agreement rows={agreement} show={show} />
            </section>
            <section className={styles.section}>
              <h2 className={styles.heading}>Every number</h2>
              <p className={styles.caption}>
                All checks for the decks shown; click a heading to sort.
              </p>
              <NumbersTable checks={checks} show={show} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

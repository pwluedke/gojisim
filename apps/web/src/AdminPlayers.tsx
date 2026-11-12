import "./theme.css";
import { useEffect, useMemo, useState } from "react";
import styles from "./AdminPlayers.module.css";
import { ThemeHeader } from "./ThemeHeader";

/*
 * #235: the players page for admins (`/admin/players`). The server answers its API only to an
 * admin (`ADMIN_DISCORD_IDS`), 404 to anyone else; this page then says "Not found". Counts only
 * (Q42): no decks, no deck names, no game records.
 */

interface PlayerRow {
  name: string;
  firstSeen: number;
  lastSeen: number;
  botGames: number;
  onlineGames: number;
  wins: number;
  losses: number;
  botLevels: string[];
  /** Their games per season (#235 follow-up). */
  gamesBySeason: Record<string, number>;
}

interface Report {
  season: string | null;
  seasons: string[];
  currentSeason: string;
  totals: {
    players: number;
    games: number;
    gamesLast7Days: number;
    gamesBySeason: Record<string, number>;
  };
  players: PlayerRow[];
}

type Column = {
  key: keyof PlayerRow;
  label: string;
  /** The value to sort by. */
  sort: (p: PlayerRow) => string | number;
  show: (p: PlayerRow) => string;
};

/** "Nov 1, 2026" in the viewer's own time zone. */
const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { dateStyle: "medium" });

/** "beta 80 · launch 40": each season with games, in the order the seasons started. */
export function seasonCounts(
  seasons: readonly string[],
  counts: Record<string, number>,
): string {
  return seasons
    .filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => `${s} ${counts[s]}`)
    .join(" · ");
}

const COLUMNS: Column[] = [
  {
    key: "name",
    label: "Discord name",
    sort: (p) => p.name.toLowerCase(),
    show: (p) => p.name,
  },
  {
    key: "firstSeen",
    label: "First seen",
    sort: (p) => p.firstSeen,
    show: (p) => day(p.firstSeen),
  },
  {
    key: "lastSeen",
    label: "Last seen",
    sort: (p) => p.lastSeen,
    show: (p) => day(p.lastSeen),
  },
  {
    key: "botGames",
    label: "Games vs bot",
    sort: (p) => p.botGames,
    show: (p) => String(p.botGames),
  },
  {
    key: "onlineGames",
    label: "Online games",
    sort: (p) => p.onlineGames,
    show: (p) => String(p.onlineGames),
  },
  {
    key: "wins",
    label: "Wins",
    sort: (p) => p.wins,
    show: (p) => String(p.wins),
  },
  {
    key: "losses",
    label: "Losses",
    sort: (p) => p.losses,
    show: (p) => String(p.losses),
  },
  {
    key: "botLevels",
    label: "Bot levels",
    sort: (p) => p.botLevels.join(" "),
    show: (p) => p.botLevels.join(", ") || "–",
  },
];

/** The season query: all seasons ("") or one by name. */
const query = (season: string) =>
  season ? `?season=${encodeURIComponent(season)}` : "";

/**
 * The table's columns: in All seasons, each player's games per season too, as one cell ("beta 3
 * · launch 1"), sorted by their total; a season's view shows only that season's games.
 */
function columnsFor(report: Report): Column[] {
  if (report.season) return COLUMNS;
  return [
    ...COLUMNS,
    {
      key: "gamesBySeason",
      label: "By season",
      sort: (p) => Object.values(p.gamesBySeason).reduce((a, b) => a + b, 0),
      show: (p) => seasonCounts(report.seasons, p.gamesBySeason) || "–",
    },
  ];
}

export function AdminPlayers() {
  const [season, setSeason] = useState("");
  const [report, setReport] = useState<Report | null | "missing">(null);
  const [sort, setSort] = useState<{ key: keyof PlayerRow; up: boolean }>({
    key: "lastSeen",
    up: false,
  });
  useEffect(() => {
    let live = true;
    void fetch(`/api/admin/players${query(season)}`, {
      headers: { accept: "application/json" },
    })
      .then((res) => (res.ok ? (res.json() as Promise<Report>) : null))
      .then((body) => live && setReport(body ?? "missing"))
      .catch(() => live && setReport("missing"));
    return () => {
      live = false;
    };
  }, [season]);
  const rows = useMemo(() => {
    if (!report || report === "missing") return [];
    const column =
      columnsFor(report).find((c) => c.key === sort.key) ??
      (COLUMNS[2] as Column);
    return [...report.players].sort((a, b) => {
      const x = column.sort(a);
      const y = column.sort(b);
      const order = x < y ? -1 : x > y ? 1 : 0;
      return sort.up ? order : -order;
    });
  }, [report, sort]);

  if (report === "missing")
    return (
      <div className="gojisim">
        <ThemeHeader />
        <main className={styles.page}>
          <p data-testid="admin-not-found">Not found.</p>
        </main>
      </div>
    );
  const bySeason = report
    ? seasonCounts(report.seasons, report.totals.gamesBySeason)
    : "";
  const columns = report ? columnsFor(report) : COLUMNS;
  return (
    <div className="gojisim">
      <ThemeHeader />
      <main className={styles.page}>
        <h1 className={styles.title}>Players</h1>
        {!report ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className={styles.bar}>
              <label className={styles.season}>
                Season
                <select
                  data-testid="admin-season"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                >
                  <option value="">All seasons</option>
                  {report.seasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                      {s === report.currentSeason ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <a
                className={styles.button}
                href={`/api/admin/players.csv${query(season)}`}
                download
                data-testid="admin-csv"
              >
                Download CSV
              </a>
            </div>
            <dl className={styles.totals} data-testid="admin-totals">
              <div>
                <dt>Players</dt>
                <dd data-testid="admin-total-players">
                  {report.totals.players}
                </dd>
              </div>
              <div>
                <dt>Games</dt>
                <dd data-testid="admin-total-games">
                  {report.totals.games}
                  {/* Every season's games, beta included, in the all-seasons view (Paul). */}
                  {!report.season && bySeason && (
                    <span
                      className={styles.beta}
                      data-testid="admin-season-games"
                    >
                      ({bySeason})
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Last 7 days</dt>
                <dd data-testid="admin-total-week">
                  {report.totals.gamesLast7Days}
                </dd>
              </div>
            </dl>
            {report.season === "beta" && (
              <p className={styles.note}>
                <span className={styles.beta}>beta</span> Beta-season games
                only.
              </p>
            )}
            <div className={styles.scroll}>
              <table className={styles.table} data-testid="admin-table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        aria-sort={
                          sort.key === c.key
                            ? sort.up
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <button
                          type="button"
                          data-testid={`admin-sort-${c.key}`}
                          onClick={() =>
                            setSort((s) =>
                              s.key === c.key
                                ? { key: c.key, up: !s.up }
                                : { key: c.key, up: c.key === "name" },
                            )
                          }
                        >
                          {c.label}
                          {sort.key === c.key ? (sort.up ? " ▲" : " ▼") : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={`${p.name}-${p.firstSeen}`}
                      data-testid="admin-row"
                    >
                      {columns.map((c) => (
                        <td key={c.key}>{c.show(p)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <a className={styles.back} href="/">
          Back to the menu
        </a>
      </main>
    </div>
  );
}

/**
 * The destroy animation's shards (M5f, Paul's change): a card breaks into angular pieces like
 * broken glass, triangles and 4 or 5 sided polygons of varied size. The layout is seeded from the
 * card's instance id, so the same destroy breaks the same way on every replay.
 *
 * It starts from a jittered grid of quads (corners stay fixed, edge points slide along the edge,
 * inner points move freely), splits some quads into two triangles along a random diagonal, and
 * merges some whole quads with the neighboring triangle that shares an edge (a pentagon). The
 * pieces always tile the card exactly.
 */

export type Point = [number, number];

export interface Shard {
  /** Corners in card units (0 to 1 on each axis), in order around the shard. */
  points: Point[];
  /** Its center, for the rotation origin and the fly-out direction. */
  center: Point;
  /** How far it flies out (card widths) and turns (degrees). */
  distance: number;
  turn: number;
}

/** A small seeded PRNG (mulberry32) from a string (FNV-1a). */
function rngFrom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLS = 3;
const ROWS = 4;

/** The polygon's area (shoelace), always positive. */
export function area(points: readonly Point[]): number {
  let sum = 0;
  points.forEach(([x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length] as Point;
    sum += x1 * y2 - x2 * y1;
  });
  return Math.abs(sum) / 2;
}

function centroid(points: readonly Point[]): Point {
  const n = points.length;
  return [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
  ];
}

/** The shard layout for a card, seeded by its instance id. */
export function shardLayout(seed: string): Shard[] {
  const rand = rngFrom(seed);
  const jitter = (amount: number) => (rand() - 0.5) * amount;
  // Grid vertices: (COLS + 1) x (ROWS + 1).
  const v: Point[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: Point[] = [];
    for (let c = 0; c <= COLS; c++) {
      const edgeX = c === 0 || c === COLS;
      const edgeY = r === 0 || r === ROWS;
      const x = c / COLS + (edgeX ? 0 : jitter(0.7 / COLS));
      const y = r / ROWS + (edgeY ? 0 : jitter(0.7 / ROWS));
      row.push([x, y]);
    }
    v.push(row);
  }
  const at = (r: number, c: number) => (v[r] as Point[])[c] as Point;

  // Each cell: a quad, or two triangles split along one diagonal.
  type Cell =
    | { kind: "quad" }
    | { kind: "split"; diagonal: "down" | "up"; leftMerged: boolean };
  const cells: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++)
      row.push(
        rand() < 0.55
          ? {
              kind: "split",
              diagonal: rand() < 0.5 ? "down" : "up",
              leftMerged: false,
            }
          : { kind: "quad" },
      );
    cells.push(row);
  }

  const polygons: Point[][] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const cell = (cells[r] as Cell[])[c] as Cell;
      const [tl, tr, br, bl] = [
        at(r, c),
        at(r, c + 1),
        at(r + 1, c + 1),
        at(r + 1, c),
      ];
      if (cell.kind === "split") {
        // "down" runs top-left to bottom-right; "up" top-right to bottom-left. A triangle that
        // holds the left edge may already belong to the quad on its left (a pentagon).
        if (cell.diagonal === "down") {
          polygons.push([tl, tr, br]);
          if (!cell.leftMerged) polygons.push([tl, br, bl]);
        } else {
          polygons.push([tr, br, bl]);
          if (!cell.leftMerged) polygons.push([tl, tr, bl]);
        }
        continue;
      }
      // A quad whose right neighbor is split may take that neighbor's left triangle.
      const right = (cells[r] as Cell[])[c + 1];
      if (right?.kind === "split" && rand() < 0.6) {
        right.leftMerged = true;
        const extra =
          right.diagonal === "down" ? at(r + 1, c + 2) : at(r, c + 2);
        polygons.push([tl, tr, extra, br, bl]);
      } else polygons.push([tl, tr, br, bl]);
    }

  return polygons.map((points) => {
    const center = centroid(points);
    // Smaller shards fly farther; every shard turns its own way.
    const size = Math.sqrt(area(points));
    return {
      points,
      center,
      distance: 0.35 + (0.45 - Math.min(size, 0.45)) * 1.6 + rand() * 0.25,
      turn: (rand() - 0.5) * 160,
    };
  });
}

/** CSS `clip-path` for a shard, in percentages of the card. */
export function clipPath(shard: Shard): string {
  return `polygon(${shard.points
    .map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`)
    .join(", ")})`;
}

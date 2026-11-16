/**
 * Pure helpers for filtering the Lichess puzzle database (SPEC §5.2).
 * CSV columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags[,DailyDate]
 */

export interface RawPuzzle {
  id: string;
  fen: string;
  /** UCI moves; the first is the opponent's move that sets up the puzzle. */
  moves: string;
  rating: number;
  ratingDeviation: number;
  popularity: number;
  plays: number;
  themes: string[];
  /** Family tag, then (usually) the family+variation tag. Empty for puzzles from non-opening positions. */
  openingTags: string[];
}

/** What ships in data/tactics/level-N.json. */
export interface ShippedPuzzle {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  themes: string[];
  /** The most specific opening tag (variation if present). */
  opening: string;
}

export interface TacticsFilter {
  themes: string[];
  excludeThemes: string[];
  ratingMin: number;
  ratingMax: number;
  target: number;
}

export interface QualityFilter {
  maxRatingDeviation: number;
  minPopularity: number;
  minPlays: number;
}

export const DEFAULT_QUALITY: QualityFilter = { maxRatingDeviation: 100, minPopularity: 80, minPlays: 100 };

export function parsePuzzleRow(line: string): RawPuzzle | null {
  const f = line.split(',');
  if (f.length < 10 || f[0] === 'PuzzleId') return null;
  const rating = Number(f[3]);
  if (!Number.isFinite(rating)) return null;
  return {
    id: f[0],
    fen: f[1],
    moves: f[2],
    rating,
    ratingDeviation: Number(f[4]),
    popularity: Number(f[5]),
    plays: Number(f[6]),
    themes: f[7] ? f[7].split(' ') : [],
    openingTags: f[9] ? f[9].split(' ') : [],
  };
}

export function passesQuality(p: RawPuzzle, q: QualityFilter = DEFAULT_QUALITY): boolean {
  return p.ratingDeviation <= q.maxRatingDeviation && p.popularity >= q.minPopularity && p.plays >= q.minPlays;
}

/**
 * Does the puzzle come from one of the repertoire openings?
 * `levelTags` holds family+variation tags (e.g. "Sicilian_Defense_Alapin_Variation") and
 * "<Family>_Other_variations" for lines named only by family.
 */
export function matchesOpening(p: RawPuzzle, levelTags: ReadonlySet<string>): boolean {
  if (p.openingTags.length === 0) return false;
  const [family, variation] = p.openingTags;
  return levelTags.has(variation ?? `${family}_Other_variations`);
}

/** The level's themes this puzzle trains, or [] if it is out of range or conflicts with a restriction. */
export function levelThemes(p: RawPuzzle, f: TacticsFilter): string[] {
  if (p.rating < f.ratingMin || p.rating > f.ratingMax) return [];
  if (p.themes.some((t) => f.excludeThemes.includes(t))) return [];
  return f.themes.filter((t) => p.themes.includes(t));
}

/** FNV-1a: a stable pseudo-random order, so re-running the script picks the same puzzles. */
export function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function toShipped(p: RawPuzzle): ShippedPuzzle {
  return {
    id: p.id,
    fen: p.fen,
    moves: p.moves,
    rating: p.rating,
    themes: p.themes,
    opening: p.openingTags[1] ?? p.openingTags[0] ?? '',
  };
}

interface Entry {
  hash: number;
  puzzle: ShippedPuzzle;
}

/**
 * Streams candidate puzzles into per-theme buckets, keeping the `perTheme` puzzles with the
 * lowest stable hash in each, then picks `target` puzzles round-robin across themes so every
 * theme is represented.
 */
export class LevelSelector {
  private readonly buckets = new Map<string, Entry[]>();
  private readonly perTheme: number;
  readonly filter: TacticsFilter;

  constructor(filter: TacticsFilter) {
    this.filter = filter;
    this.perTheme = Math.max(20, Math.ceil((filter.target * 2) / filter.themes.length));
    for (const t of filter.themes) this.buckets.set(t, []);
  }

  offer(p: RawPuzzle): void {
    const themes = levelThemes(p, this.filter);
    if (themes.length === 0) return;
    const hash = stableHash(p.id);
    const shipped = toShipped(p);
    for (const t of themes) {
      const bucket = this.buckets.get(t)!;
      bucket.push({ hash, puzzle: shipped });
      if (bucket.length > this.perTheme * 2) this.trim(bucket);
    }
  }

  private trim(bucket: Entry[]): void {
    bucket.sort((a, b) => a.hash - b.hash);
    bucket.length = Math.min(bucket.length, this.perTheme);
  }

  /** Candidates per theme (after trimming), for reporting. */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [t, b] of this.buckets) {
      this.trim(b);
      out[t] = b.length;
    }
    return out;
  }

  finalize(): ShippedPuzzle[] {
    const queues = [...this.buckets.values()].map((b) => {
      this.trim(b);
      return [...b];
    });
    const picked = new Map<string, ShippedPuzzle>();
    let progress = true;
    while (picked.size < this.filter.target && progress) {
      progress = false;
      for (const q of queues) {
        while (q.length) {
          const e = q.shift()!;
          if (!picked.has(e.puzzle.id)) {
            picked.set(e.puzzle.id, e.puzzle);
            progress = true;
            break;
          }
        }
        if (picked.size >= this.filter.target) break;
      }
    }
    return [...picked.values()].sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
  }
}

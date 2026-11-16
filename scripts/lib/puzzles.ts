import { Chess } from 'chess.js';

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
  /**
   * Share of the set reserved for a theme (e.g. {"hangingPiece": 0.5}); the rest is shared
   * round-robin by the other themes.
   */
  weights?: Record<string, number>;
  /** Tactic themes taught at higher levels only; puzzles carrying one are left out. Filled in by the build script. */
  beyondThemes?: string[];
  /** Leave out puzzles whose first move gives up material (levels with the no-sacrifices restriction). */
  noSacrificeFirst?: boolean;
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

/** The puzzle's most specific opening tag; family-only tags become "<Family>_Other_variations". */
export function puzzleTag(p: RawPuzzle): string | null {
  if (p.openingTags.length === 0) return null;
  const [family, variation] = p.openingTags;
  return variation ?? `${family}_Other_variations`;
}

/** The side that solves the puzzle: the side to move after the opponent's setup move. */
export function solverColor(p: Pick<RawPuzzle, 'fen'>): 'white' | 'black' {
  return p.fen.split(' ')[1] === 'w' ? 'black' : 'white';
}

/**
 * Does the puzzle come from one of the level's repertoire lines, with the solver playing our side
 * of it? `sides` maps variation tags our trees reach to the color(s) we play in them.
 */
export function matchesRepertoire(p: RawPuzzle, sides: ReadonlyMap<string, readonly string[]>): boolean {
  const tag = puzzleTag(p);
  return !!tag && (sides.get(tag)?.includes(solverColor(p)) ?? false);
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Does the solution start by giving up material? True when the opponent's reply captures the piece
 * the solver just moved and that piece was worth more than what it took. Catches the sacrifices
 * Lichess doesn't tag as `sacrifice`.
 */
export function sacrificeFirst(p: Pick<RawPuzzle, 'fen' | 'moves'>): boolean {
  const moves = p.moves.split(' ');
  if (moves.length < 3) return false;
  const chess = new Chess(p.fen);
  const play = (uci: string) => chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  try {
    play(moves[0]);
    const first = play(moves[1]);
    const reply = play(moves[2]);
    const given = VALUE[first.promotion ?? first.piece];
    const taken = first.captured ? VALUE[first.captured] : 0;
    return reply.to === first.to && !!reply.captured && given > taken;
  } catch {
    return false;
  }
}

/**
 * The level's themes this puzzle trains, or [] if it is out of range, conflicts with a
 * restriction, or carries a theme taught only at a higher level.
 */
export function levelThemes(p: RawPuzzle, f: TacticsFilter): string[] {
  if (p.rating < f.ratingMin || p.rating > f.ratingMax) return [];
  if (p.themes.some((t) => f.excludeThemes.includes(t) || f.beyondThemes?.includes(t))) return [];
  const themes = f.themes.filter((t) => p.themes.includes(t));
  if (themes.length && f.noSacrificeFirst && sacrificeFirst(p)) return [];
  return themes;
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
 * Streams candidate puzzles into per-theme buckets, keeping the puzzles with the lowest stable
 * hash in each. finalize() first fills each weighted theme's share, then picks the rest
 * round-robin across the other themes so every theme is represented.
 */
export class LevelSelector {
  private readonly buckets = new Map<string, Entry[]>();
  private readonly caps = new Map<string, number>();
  readonly filter: TacticsFilter;

  constructor(filter: TacticsFilter) {
    this.filter = filter;
    const even = Math.max(20, Math.ceil((filter.target * 2) / filter.themes.length));
    for (const t of filter.themes) {
      this.buckets.set(t, []);
      this.caps.set(t, Math.max(even, Math.ceil(filter.target * (filter.weights?.[t] ?? 0) * 1.5)));
    }
  }

  offer(p: RawPuzzle): void {
    const themes = levelThemes(p, this.filter);
    if (themes.length === 0) return;
    const hash = stableHash(p.id);
    const shipped = toShipped(p);
    for (const t of themes) {
      const bucket = this.buckets.get(t)!;
      bucket.push({ hash, puzzle: shipped });
      if (bucket.length > this.caps.get(t)! * 2) this.trim(t, bucket);
    }
  }

  private trim(theme: string, bucket: Entry[]): void {
    bucket.sort((a, b) => a.hash - b.hash);
    bucket.length = Math.min(bucket.length, this.caps.get(theme)!);
  }

  /** Candidates per theme (after trimming), for reporting. */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [t, b] of this.buckets) {
      this.trim(t, b);
      out[t] = b.length;
    }
    return out;
  }

  finalize(): ShippedPuzzle[] {
    const { target, weights = {} } = this.filter;
    const queues = new Map<string, Entry[]>();
    for (const [t, b] of this.buckets) {
      this.trim(t, b);
      queues.set(t, [...b]);
    }
    const picked = new Map<string, ShippedPuzzle>();
    const take = (theme: string): boolean => {
      const q = queues.get(theme)!;
      while (q.length) {
        const e = q.shift()!;
        if (!picked.has(e.puzzle.id)) {
          picked.set(e.puzzle.id, e.puzzle);
          return true;
        }
      }
      return false;
    };
    // Weighted themes first: their share of the target.
    for (const [theme, w] of Object.entries(weights)) {
      if (!queues.has(theme)) continue;
      const quota = Math.min(target, picked.size + Math.round(target * w));
      while (picked.size < quota && take(theme));
    }
    // Then round-robin over the other themes; if they run dry, over all of them.
    const rest = [...queues.keys()].filter((t) => !(t in weights));
    for (const pool of [rest, [...queues.keys()]]) {
      let progress = true;
      while (picked.size < target && progress) {
        progress = false;
        for (const t of pool) {
          if (picked.size >= target) break;
          if (take(t)) progress = true;
        }
      }
    }
    return [...picked.values()].sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
  }
}

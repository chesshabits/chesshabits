import catalogJson from '../../data/habits.json';
import level1 from '../../data/levels/level-1.json';
import level2 from '../../data/levels/level-2.json';
import level3 from '../../data/levels/level-3.json';
import level4 from '../../data/levels/level-4.json';
import type { LevelId } from './levels';

export type HabitKind = 'check' | 'drill' | 'info';

/** Where the series explains a habit best (Building Habits v2). */
export interface HabitVideo {
  /** youtu.be link with the timestamp, e.g. https://youtu.be/<id>?t=879 */
  url: string;
  /** "ep 4" (main episode) or "full stream 6" (full VOD) */
  episode: string;
  /** "14:39" or "3:12:03" */
  at: string;
}

export interface Habit {
  label: string;
  kinds: HabitKind[];
  /** How a future check (Phase 3) would detect it, or how it is drilled. */
  source: string;
  difficulty: string | null;
  phase: number | null;
  /** Our own one-line summary. */
  guidance: string;
  video?: HabitVideo;
}

export interface TacticsConfig {
  /** Lichess puzzle themes drilled at this level (cumulative across levels). */
  themes: string[];
  /** Themes that conflict with this level's restrictions (e.g. no-sacrifices). */
  excludeThemes: string[];
  ratingMin: number;
  ratingMax: number;
  /** Number of puzzles to ship for this level. */
  target: number;
  /** Higher-level themes allowed to ride along (they don't disqualify a puzzle). */
  allowThemes?: string[];
  /** Share of the set reserved for a theme, e.g. { hangingPiece: 0.5 }. */
  weights?: Record<string, number>;
}

/** Per-level habit configuration (data/levels/level-N.json, SPEC §3 / §3.1). */
export interface LevelConfig {
  level: LevelId;
  restrictions: string[];
  /** Habit IDs, grouped where the series pairs them (e.g. no-hanging-pieces + take-free-pieces). */
  habits: string[][];
  extraKnowledge: string[];
  play: {
    /** Default bot strength (Elo) for games under the play tab. */
    botElo: number;
  };
  trainer: {
    /** false: simple practice mode with no due/new schedule (SPEC §5.1). */
    spacedRepetition: boolean;
  };
  tactics: TacticsConfig;
}

export const HABITS = (catalogJson as { habits: Record<string, Habit> }).habits;

const CONFIGS: Record<LevelId, LevelConfig> = {
  1: level1 as LevelConfig,
  2: level2 as LevelConfig,
  3: level3 as LevelConfig,
  4: level4 as LevelConfig,
};

export function levelConfig(level: LevelId): LevelConfig {
  return CONFIGS[level];
}

export function habit(id: string): Habit {
  const h = HABITS[id];
  if (!h) throw new Error(`Unknown habit ID: ${id}`);
  return h;
}

/** Opening names are shown only from the level whose habits include openings (SPEC §3: Level 3). */
export function showsOpeningNames(level: LevelId): boolean {
  return CONFIGS[level].habits.flat().includes('basic-openings-and-responses');
}

/** Every habit ID a level config refers to. */
export function habitIds(config: LevelConfig): string[] {
  return [...config.restrictions, ...config.habits.flat(), ...config.extraKnowledge];
}

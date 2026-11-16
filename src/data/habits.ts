import catalogJson from '../../data/habits.json';
import level1 from '../../data/levels/level-1.json';
import level2 from '../../data/levels/level-2.json';
import level3 from '../../data/levels/level-3.json';
import level4 from '../../data/levels/level-4.json';
import type { LevelId } from './levels';

export type HabitKind = 'check' | 'drill' | 'info';

export interface Habit {
  label: string;
  kinds: HabitKind[];
  source: string;
  difficulty: string | null;
  phase: number | null;
  guidance: string;
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
}

/** Per-level habit configuration (data/levels/level-N.json, SPEC §3 / §3.1). */
export interface LevelConfig {
  level: LevelId;
  restrictions: string[];
  /** Habit IDs, grouped where the series pairs them (e.g. no-hanging-pieces + take-free-pieces). */
  habits: string[][];
  extraKnowledge: string[];
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

/** Every habit ID a level config refers to. */
export function habitIds(config: LevelConfig): string[] {
  return [...config.restrictions, ...config.habits.flat(), ...config.extraKnowledge];
}

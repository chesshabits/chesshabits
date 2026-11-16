import type { LevelId } from '../data/levels';
import type { Puzzle } from './puzzle';

// Each level's puzzles are a separate chunk, loaded on demand.
const files = import.meta.glob<{ puzzles: Puzzle[] }>('../../data/tactics/level-*.json', { import: 'default' });

const cache = new Map<LevelId, Promise<Puzzle[]>>();

export function loadPuzzles(level: LevelId): Promise<Puzzle[]> {
  let p = cache.get(level);
  if (!p) {
    const load = files[`../../data/tactics/level-${level}.json`];
    p = load ? load().then((d) => d.puzzles) : Promise.resolve([]);
    cache.set(level, p);
  }
  return p;
}

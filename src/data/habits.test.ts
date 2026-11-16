import { describe, expect, it } from 'vitest';
import { HABITS, habitIds, levelConfig } from './habits';
import { LEVELS } from './levels';

describe('habit config', () => {
  it('only refers to habit IDs in the catalog', () => {
    for (const { id } of LEVELS) {
      const config = levelConfig(id);
      expect(config.level).toBe(id);
      for (const habitId of habitIds(config)) expect(HABITS[habitId], `${habitId} (level ${id})`).toBeDefined();
    }
  });

  it('has no-hanging-pieces + take-free-pieces at every level', () => {
    for (const { id } of LEVELS) {
      const groups = levelConfig(id).habits.map((g) => g.join('+'));
      expect(groups).toContain('no-hanging-pieces+take-free-pieces');
    }
  });

  it('has cumulative tactics themes with sensible rating ranges', () => {
    for (const { id } of LEVELS.slice(1)) {
      const prev = levelConfig((id - 1) as 1 | 2 | 3);
      const cur = levelConfig(id);
      for (const theme of prev.tactics.themes) expect(cur.tactics.themes).toContain(theme);
      expect(cur.tactics.ratingMin).toBeGreaterThan(prev.tactics.ratingMin);
      expect(cur.tactics.ratingMax).toBeGreaterThan(cur.tactics.ratingMin);
    }
  });

  it('excludes sacrifice puzzles exactly where no-sacrifices is a restriction', () => {
    for (const { id } of LEVELS) {
      const c = levelConfig(id);
      expect(c.tactics.excludeThemes.includes('sacrifice')).toBe(c.restrictions.includes('no-sacrifices'));
    }
  });
});

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

  it('places every habit in the catalog at some level', () => {
    const used = new Set(LEVELS.flatMap(({ id }) => habitIds(levelConfig(id))));
    for (const id of Object.keys(HABITS)) expect(used.has(id), id).toBe(true);
  });

  it('links each habit video to a timestamp that matches its label', () => {
    for (const [id, h] of Object.entries(HABITS)) {
      if (!h.video) continue;
      const m = h.video.url.match(/^https:\/\/youtu\.be\/[\w-]{11}\?t=(\d+)$/);
      expect(m, id).not.toBeNull();
      const parts = h.video.at.split(':').map(Number);
      const seconds = parts.reduce((acc, n) => acc * 60 + n, 0);
      expect(seconds, id).toBe(Number(m![1]));
      expect(h.video.episode, id).toMatch(/^(ep \d+|full stream \d+)$/);
    }
  });

  it('has a video for every graded habit (check or drill), apart from known gaps', () => {
    const noTimestampYet = new Set(['opposition-pawn-rook-endgames']);
    for (const { id } of LEVELS) {
      for (const habitId of habitIds(levelConfig(id))) {
        const h = HABITS[habitId];
        if (h.kinds.includes('info') || noTimestampYet.has(habitId)) continue;
        expect(h.video, `${habitId} (level ${id})`).toBeDefined();
      }
    }
  });

  it('teaches never-resign from Level 1 and the snorkel at every level', () => {
    for (const { id } of LEVELS) {
      expect(habitIds(levelConfig(id)), `level ${id}`).toContain('never-resign');
      expect(levelConfig(id).habits.flat(), `level ${id}`).toContain('snorkel');
    }
    expect(levelConfig(3).habits.flat()).toContain('rpm');
    expect(levelConfig(4).habits.flat()).not.toContain('rpm');
  });
});

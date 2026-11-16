import { describe, expect, it } from 'vitest';
import { AGAIN_DELAY, DAY, INITIAL_EASE, MIN_EASE, SOFT_DELAY, formatDue, isDue, ratingFor, schedule } from './srs';

const NOW = Date.UTC(2026, 10, 16, 12);

describe('schedule', () => {
  it('starts a new position at 1 day, then 6 days, then interval × ease', () => {
    const a = schedule(null, 'good', NOW);
    expect(a.interval).toBe(1);
    expect(a.due).toBe(NOW + DAY);
    const b = schedule(a, 'good', a.due);
    expect(b.interval).toBe(6);
    const c = schedule(b, 'good', b.due);
    expect(c.interval).toBe(Math.round(6 * b.ease));
    expect(c.reps).toBe(3);
    expect(c.ease).toBeCloseTo(INITIAL_EASE + 0.3);
  });

  it('brings a missed position back within minutes and resets its progress', () => {
    const learned = schedule(schedule(schedule(null, 'good', NOW), 'good', NOW), 'good', NOW);
    const missed = schedule(learned, 'again', NOW);
    expect(missed.due).toBe(NOW + AGAIN_DELAY);
    expect(missed.reps).toBe(0);
    expect(missed.interval).toBe(0);
    expect(missed.lapses).toBe(1);
    expect(missed.ease).toBeCloseTo(learned.ease - 0.2);
    // After relearning, it starts again from one day.
    expect(schedule(missed, 'good', NOW).interval).toBe(1);
  });

  it('a first-time miss is not counted as a lapse', () => {
    expect(schedule(null, 'again', NOW).lapses).toBe(0);
  });

  it('a soft miss returns sooner than a pass but later than a miss', () => {
    const s = schedule(null, 'soft', NOW);
    expect(s.due).toBe(NOW + SOFT_DELAY);
    expect(SOFT_DELAY).toBeGreaterThan(AGAIN_DELAY);
    expect(s.due).toBeLessThan(schedule(null, 'good', NOW).due);
  });

  it('a hinted answer grows the interval more slowly than a clean one', () => {
    const base = schedule(schedule(null, 'good', NOW), 'good', NOW); // interval 6
    const hard = schedule(base, 'hard', NOW);
    const good = schedule(base, 'good', NOW);
    expect(hard.interval).toBeLessThan(good.interval);
    expect(hard.interval).toBeGreaterThan(base.interval);
    expect(hard.ease).toBeLessThan(base.ease);
  });

  it('never drops ease below the floor', () => {
    let s = schedule(null, 'again', NOW);
    for (let i = 0; i < 20; i++) s = schedule(s, 'again', NOW);
    expect(s.ease).toBe(MIN_EASE);
  });
});

describe('ratingFor', () => {
  it('maps grades and help to ratings', () => {
    expect(ratingFor('correct', { hint: false, shown: false })).toBe('good');
    expect(ratingFor('correct', { hint: true, shown: false })).toBe('hard');
    expect(ratingFor('correct', { hint: false, shown: true })).toBe('again');
    expect(ratingFor('soft', { hint: false, shown: false })).toBe('soft');
    expect(ratingFor('wrong', { hint: false, shown: false })).toBe('again');
  });
});

describe('due helpers', () => {
  it('treats positions due within the learn-ahead window as due', () => {
    expect(isDue({ due: NOW + AGAIN_DELAY }, NOW)).toBe(true);
    expect(isDue({ due: NOW + SOFT_DELAY }, NOW)).toBe(false);
  });

  it('formats due times', () => {
    expect(formatDue(NOW, NOW)).toBe('now');
    expect(formatDue(NOW + SOFT_DELAY, NOW)).toBe('in 10 min');
    expect(formatDue(NOW + DAY, NOW)).toBe('in 24 h');
    expect(formatDue(NOW + 6 * DAY, NOW)).toBe('in 6 days');
  });
});

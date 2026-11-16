import { describe, expect, it } from 'vitest';
import type { RepertoireTree } from '../data/levels';
import { getTree } from '../data/levels';
import { gradeMove } from './grade';
import { candidatesAt, childrenAt, countDecisionPositions, sampleWeighted, sideToMove } from './tree';

const tiny: RepertoireTree = {
  games: 10,
  tree: {
    e4: {
      n: 10,
      next: {
        e5: { n: 7, next: { Nf3: { n: 7 } } },
        c5: { n: 3, next: { Nf3: { n: 3 } } },
      },
    },
  },
};

const other: RepertoireTree = {
  games: 5,
  tree: { e4: { n: 5, next: { e5: { n: 5, next: { Nc3: { n: 5 } } } } } },
};

describe('tree helpers', () => {
  it('walks to the children of a line', () => {
    expect(Object.keys(childrenAt(tiny, []) ?? {})).toEqual(['e4']);
    expect(Object.keys(childrenAt(tiny, ['e4']) ?? {})).toEqual(['e5', 'c5']);
    expect(childrenAt(tiny, ['e4', 'e5', 'Nf3'])).toEqual({});
    expect(childrenAt(tiny, ['d4'])).toBeNull();
  });

  it('sorts candidates by frequency', () => {
    expect(candidatesAt(tiny, ['e4'])).toEqual([
      { san: 'e5', n: 7 },
      { san: 'c5', n: 3 },
    ]);
  });

  it('knows whose move it is', () => {
    expect(sideToMove([])).toBe('white');
    expect(sideToMove(['e4'])).toBe('black');
  });

  it('counts decision positions for a color', () => {
    // White decides at the root and after 1...e5 / 1...c5.
    expect(countDecisionPositions(tiny, 'white')).toBe(3);
    // Black decides only after 1.e4.
    expect(countDecisionPositions(tiny, 'black')).toBe(1);
  });
});

describe('sampleWeighted', () => {
  const candidates = [
    { san: 'e5', n: 7 },
    { san: 'c5', n: 3 },
  ];

  it('maps the random roll onto the n-weighted ranges', () => {
    expect(sampleWeighted(candidates, () => 0)).toBe('e5');
    expect(sampleWeighted(candidates, () => 0.69)).toBe('e5');
    expect(sampleWeighted(candidates, () => 0.7)).toBe('c5');
    expect(sampleWeighted(candidates, () => 0.9999)).toBe('c5');
  });

  it('returns null when there is nothing to play', () => {
    expect(sampleWeighted([], () => 0.5)).toBeNull();
  });

  it('roughly follows the weights over many samples', () => {
    let seed = 1;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    let e5 = 0;
    for (let i = 0; i < 10000; i++) if (sampleWeighted(candidates, rand) === 'e5') e5++;
    expect(e5 / 10000).toBeGreaterThan(0.66);
    expect(e5 / 10000).toBeLessThan(0.74);
  });
});

describe('gradeMove', () => {
  it('accepts repertoire moves', () => {
    expect(gradeMove(tiny, ['e4', 'e5'], 'Nf3')).toEqual({ kind: 'correct', san: 'Nf3' });
  });

  it('marks moves from another level as a soft miss', () => {
    expect(gradeMove(tiny, ['e4', 'e5'], 'Nc3', [other])).toEqual({
      kind: 'soft',
      san: 'Nc3',
      expected: ['Nf3'],
    });
  });

  it('marks everything else as wrong', () => {
    expect(gradeMove(tiny, ['e4', 'e5'], 'Qh5', [other])).toEqual({
      kind: 'wrong',
      san: 'Qh5',
      expected: ['Nf3'],
    });
  });

  it('works on the real data: 3.Nc3 is Level 2 White after 1.e4 e5 2.Nf3 Nc6', () => {
    const line = ['e4', 'e5', 'Nf3', 'Nc6'];
    expect(gradeMove(getTree(2, 'white'), line, 'Nc3').kind).toBe('correct');
    expect(gradeMove(getTree(2, 'white'), line, 'Qh5').kind).toBe('wrong');
  });
});

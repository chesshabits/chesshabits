import { describe, expect, it } from 'vitest';
import { applyOverrides, getTree, loadRepertoire, type RepertoireTree } from '../data/levels';
import { explainMove, moveLabel } from './explain';
import {
  NEW_PER_DAY,
  cardId,
  deckStats,
  decisionPositions,
  nextOpponentMove,
  onTargetPath,
  pickTarget,
  practiceTarget,
} from './session';
import { countDecisionPositions } from './tree';

const NOW = Date.UTC(2026, 10, 16, 12);

const tree: RepertoireTree = {
  games: 10,
  tree: {
    e4: {
      n: 10,
      next: {
        e5: { n: 7, next: { Nf3: { n: 7, next: { Nc6: { n: 7, next: { Nc3: { n: 7 } } } } } } },
        c5: { n: 3, next: { Nf3: { n: 3 } } },
      },
    },
  },
};

describe('decisionPositions', () => {
  it('lists the positions where the user moves, most-reached first', () => {
    const white = decisionPositions(tree, 'white');
    expect(white.map((p) => p.key)).toEqual(['', 'e4 e5', 'e4 e5 Nf3 Nc6', 'e4 c5']);
    expect(white.map((p) => p.n)).toEqual([10, 7, 7, 3]);
    expect(white[1].expected).toEqual([{ san: 'Nf3', n: 7 }]);
    expect(decisionPositions(tree, 'black').map((p) => p.key)).toEqual(['e4', 'e4 e5 Nf3']);
  });

  it('agrees with countDecisionPositions on the real data', () => {
    for (const level of [1, 2, 3, 4] as const) {
      for (const color of ['white', 'black'] as const) {
        const t = getTree(level, color);
        expect(decisionPositions(t, color)).toHaveLength(countDecisionPositions(t, color));
      }
    }
  });
});

describe('deckStats and pickTarget', () => {
  const positions = decisionPositions(tree, 'white');

  it('counts everything as new on day one', () => {
    expect(deckStats(positions, new Map(), { done: 0, introduced: 0 }, NOW)).toEqual({
      total: 4,
      due: 0,
      fresh: 4,
      done: 0,
    });
  });

  it('starts with the most-reached new position', () => {
    expect(pickTarget(positions, new Map(), { done: 0, introduced: 0 }, NOW)).toEqual({ kind: 'new', line: [] });
    const seen = new Map([['', { due: NOW + 86_400_000 }]]);
    expect(pickTarget(positions, seen, { done: 1, introduced: 1 }, NOW)).toEqual({ kind: 'new', line: ['e4', 'e5'] });
  });

  it('puts due positions first, most overdue first', () => {
    const cards = new Map([
      ['', { due: NOW - 1000 }],
      ['e4 e5', { due: NOW - 5000 }],
      ['e4 e5 Nf3 Nc6', { due: NOW + 86_400_000 }],
    ]);
    expect(pickTarget(positions, cards, { done: 0, introduced: 3 }, NOW)).toEqual({ kind: 'due', line: ['e4', 'e5'] });
    expect(deckStats(positions, cards, { done: 0, introduced: 3 }, NOW)).toMatchObject({ due: 2, fresh: 1 });
  });

  it('stops offering new positions once the daily allowance is used', () => {
    const today = { done: NEW_PER_DAY, introduced: NEW_PER_DAY };
    expect(pickTarget(positions, new Map(), today, NOW)).toEqual({ kind: 'free', line: null });
    expect(deckStats(positions, new Map(), today, NOW).fresh).toBe(0);
  });
});

describe('nextOpponentMove', () => {
  it('follows the target line, then samples by frequency', () => {
    expect(nextOpponentMove(tree, ['e4'], ['e4', 'c5'], () => 0)).toBe('c5');
    expect(nextOpponentMove(tree, ['e4'], null, () => 0)).toBe('e5');
    expect(nextOpponentMove(tree, ['e4'], null, () => 0.95)).toBe('c5');
    // Off the target path: sample.
    expect(nextOpponentMove(tree, ['e4'], ['d4', 'd5'], () => 0)).toBe('e5');
    expect(nextOpponentMove(tree, ['e4', 'c5', 'Nf3'], null)).toBeNull();
  });

  it('knows when the line is still heading for the target', () => {
    expect(onTargetPath(['e4'], ['e4', 'c5'])).toBe(true);
    expect(onTargetPath(['e4', 'e5'], ['e4', 'c5'])).toBe(false);
    expect(onTargetPath(['e4'], null)).toBe(false);
  });
});

describe('cards and labels', () => {
  it('builds stable card IDs', () => {
    expect(cardId(2, 'white', ['e4', 'e5'])).toBe('2:white:e4 e5');
  });

  it('labels moves with their number', () => {
    expect(moveLabel(0, 'e4')).toBe('1.e4');
    expect(moveLabel(5, 'Nf6')).toBe('3...Nf6');
  });
});

describe('explainMove', () => {
  it('prefers a hand-written note', () => {
    expect(explainMove(['e4', 'd5', 'exd5', 'Qxd5'], 'Nc3')).toMatch(/attacks the queen/);
  });

  it('falls back to rules of thumb', () => {
    expect(explainMove(['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'Bc4', 'Bc5'], 'O-O')).toMatch(/^Castle/);
    expect(explainMove(['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'd4', 'exd4'], 'Nxd4')).toMatch(/^Recapture/);
    expect(explainMove(['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'd6'], 'Bc4')).toMatch(/Develop the bishop/);
    expect(explainMove(['e4', 'c6', 'Nf3', 'd5', 'Nc3', 'Bg4'], 'h3')).toMatch(/bishop on g4/);
  });
});

describe('repertoire overrides', () => {
  it('prunes a line from one tree only', () => {
    const trees = applyOverrides(loadRepertoire().trees, {
      prune: [{ tree: 'level2_white', line: 'e4 e5 Nf3 Nc6 Nc3', reason: 'test' }],
    });
    expect(trees.level2_white.tree.e4.next!.e5.next!.Nf3.next!.Nc6.next?.Nc3).toBeUndefined();
    expect(loadRepertoire().trees.level2_white.tree.e4.next!.e5.next!.Nf3.next!.Nc6.next?.Nc3).toBeDefined();
  });

  it('applies the shipped overrides', () => {
    const black1 = getTree(1, 'black');
    const nb5 = black1.tree.d4.next!.d5.next!.Bf4.next!.Nf6.next!.Nc3.next!.Nc6.next!.Nb5;
    expect(nb5?.next?.Bf5).toBeUndefined();
  });
});

describe('practiceTarget', () => {
  const positions = decisionPositions(tree, 'white');

  it('cycles through positions not yet played this session', () => {
    expect(practiceTarget(positions, { seen: new Set(), missed: new Map() })).toEqual({ kind: 'next', line: [] });
    expect(practiceTarget(positions, { seen: new Set(['', 'e4 e5']), missed: new Map() })).toEqual({
      kind: 'next',
      line: ['e4', 'e5', 'Nf3', 'Nc6'],
    });
  });

  it('brings a miss back after another line, oldest miss first', () => {
    const seen = new Set(['', 'e4 e5', 'e4 e5 Nf3 Nc6', 'e4 c5']);
    expect(practiceTarget(positions, { seen, missed: new Map([['e4 c5', 0]]) }).kind).toBe('free');
    expect(practiceTarget(positions, { seen, missed: new Map([['e4 c5', 1], ['e4 e5', 3]]) })).toEqual({
      kind: 'retry',
      line: ['e4', 'e5'],
    });
  });
});

describe('opening names in explanations', () => {
  it('never name an opening for a move drilled at Levels 1-2', () => {
    const names = /philidor|caro|french|sicilian|alapin|london|gambit|scotch|italian|four knights|two knights|petrov|scandinavian|queen's|king's/i;
    for (const level of [1, 2] as const) {
      for (const color of ['white', 'black'] as const) {
        for (const p of decisionPositions(getTree(level, color), color)) {
          for (const c of p.expected) expect(explainMove(p.line, c.san), `${p.key} ${c.san}`).not.toMatch(names);
        }
      }
    }
  });
});

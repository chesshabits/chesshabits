import { describe, expect, it } from 'vitest';
import { checkMove, pickPuzzle, positionAt, solverColor, themeLabel, type Puzzle } from './puzzle';

// From the Lichess puzzle database (CC0): after 15.Qxh5, Black mates with ...Qxg2.
const MATE: Puzzle = {
  id: '0000H',
  fen: 'r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15',
  moves: 'd1h5 d5g2',
  rating: 1032,
  themes: ['mate', 'mateIn1'],
  opening: 'French_Defense_Tarrasch_Variation',
};

// Back-rank mate in 1 where two different rook moves mate (any mate is accepted on the last move).
const TWO_MATES: Puzzle = {
  id: 'test1',
  fen: '6k1/5ppp/8/8/8/8/5PPP/R3R1K1 b - - 0 1',
  moves: 'g8h8 a1a8',
  rating: 600,
  themes: ['backRankMate', 'mateIn1'],
  opening: '',
};

describe('puzzle positions', () => {
  it('starts after the setup move with the solver to move', () => {
    expect(solverColor(MATE)).toBe('black');
    const { chess, last } = positionAt(MATE, 1);
    expect(last?.san).toBe('Qxh5');
    expect(chess.turn()).toBe('b');
  });
});

describe('checkMove', () => {
  it('accepts the stored solution move', () => {
    expect(checkMove(MATE, 1, 'd5', 'g2')).toEqual({ ok: true, uci: 'd5g2' });
  });

  it('rejects other moves', () => {
    expect(checkMove(MATE, 1, 'd5', 'd4').ok).toBe(false);
  });

  it('rejects illegal moves', () => {
    expect(checkMove(MATE, 1, 'a7', 'a4').ok).toBe(false);
  });

  it('accepts any checkmate on the final move', () => {
    expect(checkMove(TWO_MATES, 1, 'a1', 'a8').ok).toBe(true);
    expect(checkMove(TWO_MATES, 1, 'e1', 'e8').ok).toBe(true);
    expect(checkMove(TWO_MATES, 1, 'e1', 'e7').ok).toBe(false);
  });
});

describe('pickPuzzle', () => {
  const a = { ...MATE, id: 'a' };
  const b = { ...MATE, id: 'b' };
  const c = { ...MATE, id: 'c' };

  it('prefers puzzles never tried', () => {
    const records = new Map([['a', { id: 'a', lastAt: 1, lastResult: 'failed' as const }]]);
    expect(pickPuzzle([a, b], records, null, () => 0)?.id).toBe('b');
  });

  it('then retries the oldest failure', () => {
    const records = new Map([
      ['a', { id: 'a', lastAt: 5, lastResult: 'failed' as const }],
      ['b', { id: 'b', lastAt: 2, lastResult: 'failed' as const }],
      ['c', { id: 'c', lastAt: 1, lastResult: 'solved' as const }],
    ]);
    expect(pickPuzzle([a, b, c], records, null)?.id).toBe('b');
    expect(pickPuzzle([a, b, c], records, 'b')?.id).toBe('a');
  });

  it('never repeats the puzzle just played when there is another', () => {
    const records = new Map([['a', { id: 'a', lastAt: 1, lastResult: 'solved' as const }]]);
    expect(pickPuzzle([a], records, 'a')?.id).toBe('a');
    expect(pickPuzzle([a, b], new Map(), 'a', () => 0)?.id).toBe('b');
  });
});

describe('themeLabel', () => {
  it('makes theme IDs readable', () => {
    expect(themeLabel('hangingPiece')).toBe('take free pieces');
    expect(themeLabel('savePiece')).toBe('save hanging pieces');
    expect(themeLabel('mateIn1')).toBe('mate in 1');
    expect(themeLabel('discoveredAttack')).toBe('discovered attack');
  });
});

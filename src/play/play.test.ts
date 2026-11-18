import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { getTree, type RepertoireTree } from '../data/levels';
import { levelConfig } from '../data/habits';
import { ELO_MAX, ELO_MIN, LIMIT_STRENGTH_MIN, chooseMove, clampElo, engineSettings, uciSetup } from './elo';
import { coachTip, freeCaptures, habitMarks, hangingPieces } from './habits';
import {
  DEFAULT_OPTIONS,
  bookReply,
  flagged,
  formatClock,
  newClock,
  pressClock,
  remaining,
  stopClock,
  takebackAllowed,
  withClock,
  withTakeback,
} from './rules';

describe('engine strength', () => {
  it('clamps to 400-2000 in steps of 100', () => {
    expect(clampElo(120)).toBe(ELO_MIN);
    expect(clampElo(2600)).toBe(ELO_MAX);
    expect(clampElo(949)).toBe(900);
  });

  it("uses Stockfish's own limiter from about 1350 up", () => {
    const s = engineSettings(1700);
    expect(s.limitStrength).toBe(true);
    expect(uciSetup(s).options).toContainEqual(['UCI_Elo', 1700]);
    expect(engineSettings(LIMIT_STRENGTH_MIN - 100).limitStrength).toBe(false);
  });

  it('gets steadily weaker below that', () => {
    const elos = [400, 700, 1000, 1300];
    const s = elos.map(engineSettings);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].skill).toBeGreaterThanOrEqual(s[i - 1].skill);
      expect(s[i].depth).toBeGreaterThanOrEqual(s[i - 1].depth);
      expect(s[i].temperatureCp).toBeLessThan(s[i - 1].temperatureCp);
      expect(s[i].blunderChance).toBeLessThan(s[i - 1].blunderChance);
    }
    expect(s[0].multipv).toBeGreaterThan(1);
    expect(uciSetup(s[0]).go).toMatch(/^go depth \d+ movetime \d+$/);
  });

  const candidates = [
    { move: 'e2e4', cp: 40 },
    { move: 'h2h4', cp: -120 },
    { move: 'g1f3', cp: 30 },
  ];

  it('always plays the best line at strong settings', () => {
    expect(chooseMove(candidates, engineSettings(1800), () => 0.99)).toBe('e2e4');
  });

  it('favours better moves but sometimes errs at weak settings', () => {
    const weak = engineSettings(500);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const m = chooseMove(candidates, weak, rand);
      counts[m] = (counts[m] ?? 0) + 1;
    }
    expect(counts.e2e4).toBeGreaterThan(counts.h2h4);
    expect(counts.g1f3).toBeGreaterThan(counts.h2h4);
    expect(counts.h2h4).toBeGreaterThan(100); // real mistakes happen
    // A stronger weak setting makes fewer of them.
    let strongerBad = 0;
    for (let i = 0; i < 4000; i++) if (chooseMove(candidates, engineSettings(1200), rand) === 'h2h4') strongerBad++;
    expect(strongerBad).toBeLessThan(counts.h2h4);
  });

  it('defaults each level to its typical rating', () => {
    expect([1, 2, 3, 4].map((l) => levelConfig(l as 1 | 2 | 3 | 4).play.botElo)).toEqual([500, 900, 1300, 1700]);
  });
});

describe('book replies', () => {
  const tree: RepertoireTree = {
    games: 10,
    tree: { e4: { n: 10, next: { e5: { n: 7 }, c5: { n: 3 } } } },
  };

  it('plays series replies weighted by games, and says how many', () => {
    expect(bookReply(tree, ['e4'], () => 0)).toEqual({ san: 'e5', n: 7, total: 10 });
    expect(bookReply(tree, ['e4'], () => 0.95)).toEqual({ san: 'c5', n: 3, total: 10 });
  });

  it('is out of book once the game leaves the tree', () => {
    expect(bookReply(tree, ['d4'])).toBeNull();
    expect(bookReply(tree, ['e4', 'e5'])).toBeNull();
  });

  it('follows the real level trees', () => {
    // Playing White at Level 2: the bot answers 1.e4 from the series games.
    const reply = bookReply(getTree(2, 'white'), ['e4'], () => 0);
    expect(reply?.san).toBe('e5');
    expect(reply!.total).toBeGreaterThan(reply!.n - 1);
  });
});

describe('takebacks', () => {
  it('are on without a clock and off with one', () => {
    expect(takebackAllowed(DEFAULT_OPTIONS)).toBe(true);
    expect(takebackAllowed(withClock(DEFAULT_OPTIONS, { minutes: 5, incrementSec: 0 }))).toBe(false);
  });

  it('can be switched back on with a clock, and off without one', () => {
    const timed = withClock(DEFAULT_OPTIONS, { minutes: 5, incrementSec: 0 });
    expect(takebackAllowed(withTakeback(timed, true))).toBe(true);
    expect(takebackAllowed(withTakeback(DEFAULT_OPTIONS, false))).toBe(false);
  });

  it('go back to the default when the clock changes', () => {
    const custom = withTakeback(withClock(DEFAULT_OPTIONS, { minutes: 3, incrementSec: 2 }), true);
    expect(takebackAllowed(withClock(custom, null))).toBe(true);
    expect(takebackAllowed(withClock(custom, { minutes: 10, incrementSec: 0 }))).toBe(false);
  });
});

describe('clock', () => {
  it('runs only for the side to move and adds the increment', () => {
    let c = newClock({ minutes: 1, incrementSec: 2 });
    c = pressClock(c, 'white', 0); // White's first move starts Black's clock
    expect(remaining(c, 10_000)).toEqual({ white: 60_000, black: 50_000 });
    c = pressClock(c, 'black', 10_000);
    expect(remaining(c, 10_000)).toEqual({ white: 60_000, black: 52_000 });
    expect(remaining(c, 25_000).white).toBe(45_000);
  });

  it('flags at zero and stops', () => {
    let c = pressClock(newClock({ minutes: 1, incrementSec: 0 }), 'white', 0);
    expect(flagged(c, 59_000)).toBeNull();
    expect(flagged(c, 60_000)).toBe('black');
    c = stopClock(c, 30_000);
    expect(remaining(c, 99_000).black).toBe(30_000);
    expect(flagged(c, 99_000)).toBeNull();
  });

  it('formats time', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(61_200)).toBe('1:02');
    expect(formatClock(9_350)).toBe('0:09.3');
  });
});

describe('habits during a game', () => {
  const play = (sans: string[]) => {
    const c = new Chess();
    for (const s of sans) c.move(s);
    return c;
  };

  it('spots hanging pieces and free captures', () => {
    const c = play(['e4', 'd5', 'Nc3', 'd4']); // the d4 pawn attacks the c3 knight
    expect(hangingPieces(c, 'w')).toEqual(['c3']);
    const d = play(['e4', 'e5', 'Nf3', 'Qh4', 'a3']); // Black to move: the queen on h4 is attacked by the knight
    expect(hangingPieces(d, 'b')).toEqual(['h4']);
    const f = play(['e4', 'e5', 'Nf3', 'Qh4']);
    expect(freeCaptures(f).map((m) => m.san)).toEqual(['Nxh4']);
  });

  it('marks castling, the snorkel and rooks to the middle', () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'h3', 'O-O', 'Re1', 'd6'];
    const h = play(sans).history({ verbose: true });
    const m = habitMarks(1, h, 'w', false);
    expect(m['castle-asap']).toBe('done');
    expect(m.snorkel).toBe('done');
    expect(m['rooks-to-middle']).toBe('done');
    expect(m.rpm).toBe('todo');
  });

  it('marks a skipped free piece and a hung piece as broken', () => {
    const skipped = play(['e4', 'e5', 'Nf3', 'Qh4', 'a3']).history({ verbose: true });
    expect(habitMarks(1, skipped, 'w', false)['take-free-pieces']).toBe('broken');
    const hung = play(['e4', 'd5', 'Nc3', 'd4', 'a3', 'dxc3']).history({ verbose: true });
    expect(habitMarks(1, hung, 'w', false)['no-hanging-pieces']).toBe('broken');
  });

  it('coaches the most urgent habit first', () => {
    const hist = (sans: string[]) => play(sans).history({ verbose: true });
    expect(coachTip(1, hist(['e4', 'd5', 'Nc3', 'd4']), 'w')?.habit).toBe('no-hanging-pieces');
    expect(coachTip(1, hist(['e4', 'e5', 'Nf3', 'Qh4']), 'w')).toMatchObject({
      habit: 'take-free-pieces',
      show: { from: 'f3', to: 'h4' },
    });
    expect(coachTip(1, hist(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']), 'w')).toMatchObject({
      habit: 'castle-asap',
      show: { from: 'e1', to: 'g1' },
    });
    expect(coachTip(1, hist(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6']), 'w')?.habit).toBe('snorkel');
    expect(
      coachTip(1, hist(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'h3', 'O-O']), 'w')?.habit,
    ).toBe('rooks-to-middle');
    // Opening: a central pawn first, then knights toward the center (never to the rim).
    expect(coachTip(1, [], 'w')).toMatchObject({ habit: 'center-control', show: { to: 'e4' } });
    expect(coachTip(1, hist(['e4', 'e5']), 'w')?.show?.to).toBe('f3');
    // Not the user's turn: no tip.
    expect(coachTip(1, hist(['e4']), 'w')).toBeNull();
  });
});

describe('game end', () => {
  it('ends by the rules and never by resignation', async () => {
    const { gameResult } = await import('./usePlay');
    const mate = new Chess();
    for (const s of ['f3', 'e5', 'g4', 'Qh4#']) mate.move(s);
    expect(gameResult(mate, 'white')).toEqual({ result: '0-1', reason: 'checkmate', outcome: 'loss' });
    expect(gameResult(mate, 'black')?.outcome).toBe('win');
    const stale = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(gameResult(stale, 'white')).toEqual({ result: '1/2-1/2', reason: 'stalemate', outcome: 'draw' });
    expect(gameResult(new Chess(), 'white')).toBeNull();
  });
});

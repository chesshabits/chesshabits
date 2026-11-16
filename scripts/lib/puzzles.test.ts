import { describe, expect, it } from 'vitest';
import {
  LevelSelector,
  levelThemes,
  matchesRepertoire,
  sacrificeFirst,
  solverColor,
  parsePuzzleRow,
  passesQuality,
  stableHash,
  type RawPuzzle,
  type TacticsFilter,
} from './puzzles.ts';

const HEADER = 'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate';
const ROW =
  '0000H,r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15,d1h5 d5g2,1032,78,100,92,' +
  'mate mateIn1 middlegame oneMove,https://lichess.org/game/EwHRkfas#29,French_Defense French_Defense_Tarrasch_Variation,';

function puzzle(over: Partial<RawPuzzle> = {}): RawPuzzle {
  return {
    id: 'abc',
    fen: '8/8/8/8/8/8/8/8 w - - 0 1',
    moves: 'e2e4 e7e5',
    rating: 900,
    ratingDeviation: 75,
    popularity: 95,
    plays: 1000,
    themes: ['fork', 'middlegame', 'short'],
    openingTags: ['Italian_Game', 'Italian_Game_Giuoco_Piano'],
    ...over,
  };
}

const L2: TacticsFilter = {
  themes: ['hangingPiece', 'mateIn1', 'fork', 'pin'],
  excludeThemes: ['sacrifice'],
  ratingMin: 700,
  ratingMax: 1400,
  target: 3,
};

describe('parsePuzzleRow', () => {
  it('parses a CSV row', () => {
    const p = parsePuzzleRow(ROW)!;
    expect(p.id).toBe('0000H');
    expect(p.moves).toBe('d1h5 d5g2');
    expect(p.rating).toBe(1032);
    expect(p.plays).toBe(92);
    expect(p.themes).toEqual(['mate', 'mateIn1', 'middlegame', 'oneMove']);
    expect(p.openingTags).toEqual(['French_Defense', 'French_Defense_Tarrasch_Variation']);
  });

  it('skips the header and puzzles without an opening', () => {
    expect(parsePuzzleRow(HEADER)).toBeNull();
    const p = parsePuzzleRow('00008,8/8/8/8/8/8/8/8 b - - 0 24,f2g3 e6e7,1819,77,95,10446,crushing,https://x,,')!;
    expect(p.openingTags).toEqual([]);
  });
});

describe('filters', () => {
  it('requires enough plays, popularity and a settled rating', () => {
    expect(passesQuality(puzzle())).toBe(true);
    expect(passesQuality(puzzle({ plays: 20 }))).toBe(false);
    expect(passesQuality(puzzle({ popularity: 50 }))).toBe(false);
    expect(passesQuality(puzzle({ ratingDeviation: 200 }))).toBe(false);
  });

  it('matches only variations our trees reach, with the solver on our side', () => {
    // puzzle(): White to move in the FEN, so Black solves.
    const sides = new Map([
      ['Italian_Game_Giuoco_Piano', ['black']],
      ['French_Defense_Exchange_Variation', ['white']],
    ]);
    expect(solverColor(puzzle())).toBe('black');
    expect(matchesRepertoire(puzzle(), sides)).toBe(true);
    expect(matchesRepertoire(puzzle({ openingTags: ['French_Defense', 'French_Defense_Exchange_Variation'] }), sides)).toBe(false);
    expect(matchesRepertoire(puzzle({ openingTags: ['Italian_Game', 'Italian_Game_Evans_Gambit'] }), sides)).toBe(false);
    // Family-only tags never match: build-openings no longer emits "<Family>_Other_variations".
    expect(matchesRepertoire(puzzle({ openingTags: ['Italian_Game'] }), sides)).toBe(false);
    expect(matchesRepertoire(puzzle({ openingTags: [] }), sides)).toBe(false);
  });

  it('keeps only the level themes, in rating range, without excluded themes', () => {
    expect(levelThemes(puzzle(), L2)).toEqual(['fork']);
    expect(levelThemes(puzzle({ themes: ['fork', 'pin'] }), L2)).toEqual(['fork', 'pin']);
    expect(levelThemes(puzzle({ themes: ['skewer'] }), L2)).toEqual([]);
    expect(levelThemes(puzzle({ rating: 1500 }), L2)).toEqual([]);
    expect(levelThemes(puzzle({ rating: 600 }), L2)).toEqual([]);
    expect(levelThemes(puzzle({ themes: ['fork', 'sacrifice'] }), L2)).toEqual([]);
  });

  it('drops puzzles carrying a theme taught at a higher level', () => {
    const f = { ...L2, beyondThemes: ['deflection'] };
    expect(levelThemes(puzzle({ themes: ['fork'] }), f)).toEqual(['fork']);
    expect(levelThemes(puzzle({ themes: ['fork', 'deflection'] }), f)).toEqual([]);
  });

  it('spots solutions that start by giving up material', () => {
    // After ...Nc6 (setup), Qxf7+?? Kxf7: the queen is taken back for a pawn.
    const sac = { fen: 'rnbqkbnr/pppppppp/8/8/8/5Q2/PPPPPPPP/RNB1KBNR b KQkq - 0 1', moves: 'b8c6 f3f7 e8f7' };
    expect(sacrificeFirst(sac)).toBe(true);
    // 2.Qxf6 exf6 trades queen for knight too...
    expect(sacrificeFirst({ ...sac, moves: 'g8f6 f3f6 e7f6' })).toBe(true);
    // ...but taking a free piece is no sacrifice.
    expect(sacrificeFirst({ fen: '4k3/8/8/3n4/8/8/8/3QK3 b - - 0 1', moves: 'e8f7 d1d5 f7e7' })).toBe(false);
    expect(sacrificeFirst({ ...sac, moves: 'b8c6 f3f7' })).toBe(false);
    const f = { ...L2, noSacrificeFirst: true };
    const p = puzzle({ ...sac, themes: ['fork'] });
    expect(levelThemes(p, f)).toEqual([]);
    expect(levelThemes(p, L2)).toEqual(['fork']);
  });
});

describe('LevelSelector', () => {
  it('is deterministic and spreads picks across themes', () => {
    const run = () => {
      const s = new LevelSelector(L2);
      for (let i = 0; i < 50; i++) s.offer(puzzle({ id: `f${i}`, themes: ['fork'] }));
      for (let i = 0; i < 50; i++) s.offer(puzzle({ id: `p${i}`, themes: ['pin'] }));
      s.offer(puzzle({ id: 'm1', themes: ['mateIn1'] }));
      return s.finalize();
    };
    const a = run();
    expect(a).toHaveLength(3);
    expect(a.map((p) => p.id)).toEqual(run().map((p) => p.id));
    const firstLetters = new Set(a.map((p) => p.id[0]));
    expect(firstLetters).toEqual(new Set(['f', 'p', 'm']));
  });

  it('never ships the same puzzle twice when it has several themes', () => {
    const s = new LevelSelector({ ...L2, target: 10 });
    s.offer(puzzle({ id: 'x', themes: ['fork', 'pin'] }));
    expect(s.finalize().map((p) => p.id)).toEqual(['x']);
  });

  it('fills weighted themes first, then shares the rest', () => {
    const s = new LevelSelector({ ...L2, target: 10, weights: { hangingPiece: 0.6 } });
    for (let i = 0; i < 30; i++) s.offer(puzzle({ id: `h${i}`, themes: ['hangingPiece'] }));
    for (let i = 0; i < 30; i++) s.offer(puzzle({ id: `f${i}`, themes: ['fork'] }));
    for (let i = 0; i < 30; i++) s.offer(puzzle({ id: `p${i}`, themes: ['pin'] }));
    const ids = s.finalize().map((p) => p.id[0]);
    expect(ids).toHaveLength(10);
    expect(ids.filter((c) => c === 'h')).toHaveLength(6);
    expect(ids.filter((c) => c === 'f')).toHaveLength(2);
    expect(ids.filter((c) => c === 'p')).toHaveLength(2);
  });

  it('tops up from weighted themes when the others run dry', () => {
    const s = new LevelSelector({ ...L2, target: 10, weights: { hangingPiece: 0.5 } });
    for (let i = 0; i < 30; i++) s.offer(puzzle({ id: `h${i}`, themes: ['hangingPiece'] }));
    s.offer(puzzle({ id: 'f0', themes: ['fork'] }));
    expect(s.finalize()).toHaveLength(10);
  });

  it('keeps the shipped fields small', () => {
    const s = new LevelSelector(L2);
    s.offer(puzzle());
    expect(Object.keys(s.finalize()[0]).sort()).toEqual(['fen', 'id', 'moves', 'opening', 'rating', 'themes']);
  });
});

describe('stableHash', () => {
  it('is stable', () => {
    expect(stableHash('0000H')).toBe(stableHash('0000H'));
    expect(stableHash('0000H')).not.toBe(stableHash('0000D'));
  });
});

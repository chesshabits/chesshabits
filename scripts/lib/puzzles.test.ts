import { describe, expect, it } from 'vitest';
import {
  LevelSelector,
  levelThemes,
  matchesOpening,
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

  it('matches openings by the variation tag', () => {
    const tags = new Set(['Italian_Game_Giuoco_Piano', 'Caro-Kann_Defense_Other_variations']);
    expect(matchesOpening(puzzle(), tags)).toBe(true);
    expect(matchesOpening(puzzle({ openingTags: ['Italian_Game', 'Italian_Game_Evans_Gambit'] }), tags)).toBe(false);
    // Family-only tags match "<Family>_Other_variations".
    expect(matchesOpening(puzzle({ openingTags: ['Caro-Kann_Defense'] }), tags)).toBe(true);
    expect(matchesOpening(puzzle({ openingTags: [] }), tags)).toBe(false);
  });

  it('keeps only the level themes, in rating range, without excluded themes', () => {
    expect(levelThemes(puzzle(), L2)).toEqual(['fork']);
    expect(levelThemes(puzzle({ themes: ['fork', 'pin'] }), L2)).toEqual(['fork', 'pin']);
    expect(levelThemes(puzzle({ themes: ['skewer'] }), L2)).toEqual([]);
    expect(levelThemes(puzzle({ rating: 1500 }), L2)).toEqual([]);
    expect(levelThemes(puzzle({ rating: 600 }), L2)).toEqual([]);
    expect(levelThemes(puzzle({ themes: ['fork', 'sacrifice'] }), L2)).toEqual([]);
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

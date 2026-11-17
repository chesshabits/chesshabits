import { Chess, type Move } from 'chess.js';

/** A shipped puzzle (data/tactics/level-N.json, built by scripts/build-tactics.ts). */
export interface Puzzle {
  id: string;
  /** Position before the opponent's setup move. */
  fen: string;
  /** UCI moves: the opponent's setup move, then the solution (user, opponent, user, ...). */
  moves: string;
  rating: number;
  themes: string[];
  /** Lichess opening tag, e.g. "Italian_Game_Giuoco_Piano". */
  opening: string;
}

export interface PuzzleRecordLike {
  id: string;
  lastAt: number;
  lastResult: 'solved' | 'failed';
}

export const uciOf = (m: Pick<Move, 'from' | 'to' | 'promotion'>): string => `${m.from}${m.to}${m.promotion ?? ''}`;

export function solutionMoves(p: Puzzle): string[] {
  return p.moves.split(' ');
}

/** The position after the first `ply` puzzle moves (ply 1 = after the setup move). */
export function positionAt(p: Puzzle, ply: number): { chess: Chess; last: Move | null } {
  const chess = new Chess(p.fen);
  let last: Move | null = null;
  for (const uci of solutionMoves(p).slice(0, ply)) last = chess.move(uciToMove(uci));
  return { chess, last };
}

export function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

/** The side that solves the puzzle (the side to move after the setup move). */
export function solverColor(p: Puzzle): 'white' | 'black' {
  return new Chess(p.fen).turn() === 'w' ? 'black' : 'white';
}

/**
 * Check the user's move at `ply` (an odd index into the moves). Like Lichess, any move that
 * gives checkmate is accepted on the last move, even if it isn't the stored one.
 */
export function checkMove(p: Puzzle, ply: number, from: string, to: string): { ok: boolean; uci: string } {
  const moves = solutionMoves(p);
  const expected = moves[ply];
  const { chess } = positionAt(p, ply);
  // Promote to the expected piece if the squares match, else to a queen.
  const promotion = expected && expected.startsWith(from + to) && expected[4] ? expected[4] : 'q';
  let move: Move;
  try {
    move = chess.move({ from, to, promotion });
  } catch {
    return { ok: false, uci: `${from}${to}` };
  }
  const uci = uciOf(move);
  if (uci === expected) return { ok: true, uci };
  const isLast = ply === moves.length - 1;
  return { ok: isLast && chess.isCheckmate(), uci };
}

/**
 * Next puzzle: one never tried, else the failed one tried longest ago, else any other.
 * `exclude` avoids repeating the puzzle just played.
 */
export function pickPuzzle<T extends Puzzle>(
  puzzles: readonly T[],
  records: ReadonlyMap<string, PuzzleRecordLike>,
  exclude: string | null,
  rand: () => number = Math.random,
): T | null {
  const pool = puzzles.filter((p) => p.id !== exclude);
  if (pool.length === 0) return puzzles[0] ?? null;
  const unseen = pool.filter((p) => !records.has(p.id));
  if (unseen.length) return unseen[Math.floor(rand() * unseen.length)];
  const failed = pool
    .filter((p) => records.get(p.id)!.lastResult === 'failed')
    .sort((a, b) => records.get(a.id)!.lastAt - records.get(b.id)!.lastAt);
  if (failed.length) return failed[0];
  return pool[Math.floor(rand() * pool.length)];
}

const THEME_NAMES: Record<string, string> = {
  // Named after the habits they drill (SPEC §3): free pieces, taken or saved.
  hangingPiece: 'take free pieces',
  savePiece: 'save hanging pieces',
  mateIn1: 'mate in 1',
  mateIn2: 'mate in 2',
  mateIn3: 'mate in 3',
  xRayAttack: 'x-ray attack',
  attackingF2F7: 'attacking f2 / f7',
};

/** "hangingPiece" -> "hanging piece" */
export function themeLabel(theme: string): string {
  return THEME_NAMES[theme] ?? theme.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
}

import { Chess, type Move, type Square } from 'chess.js';
import notesJson from '../../data/repertoire-notes.json';
import type { Line } from './tree';

const NOTES = (notesJson as { notes: Record<string, Record<string, string>> }).notes;

const PIECE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);

/** Replay a line and return the position plus the last move. */
export function replay(line: Line): { chess: Chess; last: Move | null } {
  const chess = new Chess();
  let last: Move | null = null;
  for (const san of line) last = chess.move(san);
  return { chess, last };
}

/** "3.Nc3" / "3...Nf6" for the move played after `plies` half-moves. */
export function moveLabel(plies: number, san: string): string {
  const num = Math.floor(plies / 2) + 1;
  return plies % 2 === 0 ? `${num}.${san}` : `${num}...${san}`;
}

/** A one-sentence reason for a repertoire move: a hand-written note if there is one, else a rule of thumb. */
export function explainMove(line: Line, san: string): string {
  const note = NOTES[line.join(' ')]?.[san];
  if (note) return note;

  const { chess, last } = replay(line);
  let move: Move;
  try {
    move = chess.move(san);
  } catch {
    return '';
  }
  if (move.isKingsideCastle() || move.isQueensideCastle()) return 'Castle: the king is safe and the rook joins the game.';
  if (move.captured) {
    if (last && last.to === move.to) return 'Recapture and keep material level.';
    return `Take the ${PIECE[move.captured]}.`;
  }
  const backRank = move.color === 'w' ? '1' : '8';
  if ((move.piece === 'n' || move.piece === 'b') && move.from[1] === backRank) {
    return `Develop the ${PIECE[move.piece]} toward the center.`;
  }
  if (move.piece === 'p' && CENTER.has(move.to)) return 'Claim the center with a pawn.';
  if (move.piece === 'p' && (move.to === 'h3' || move.to === 'h6')) {
    const g = move.color === 'w' ? 'g4' : 'g5';
    const there = chess.get(g as Square);
    return there && there.type === 'b'
      ? `Put the question to the bishop on ${g}.`
      : `Take ${g} away from the enemy pieces.`;
  }
  if (move.piece === 'k') return 'Get the king out of check and keep it safe.';
  return 'Keep to the plan and keep developing.';
}

import type { RepertoireTree } from '../data/levels';
import { candidatesAt, type Line } from './tree';

export type Grade =
  /** The move is in this level's repertoire. */
  | { kind: 'correct'; san: string }
  /** Not this level's move, but a sound alternative ("not our line"). */
  | { kind: 'soft'; san: string; expected: string[] }
  /** Not a repertoire move. */
  | { kind: 'wrong'; san: string; expected: string[] };

/**
 * Grade the user's move at the position reached by `line`.
 *
 * "Soft miss" heuristic (placeholder until Stockfish is wired up in Phase 4):
 * a move counts as sound if the series played it from the same position in any
 * other level's tree for the same color. Later this should become an eval check
 * (e.g. within ~0.4 pawns of the best move).
 */
export function gradeMove(
  tree: RepertoireTree,
  line: Line,
  san: string,
  otherTrees: readonly RepertoireTree[] = [],
): Grade {
  const expected = candidatesAt(tree, line).map((c) => c.san);
  if (expected.includes(san)) return { kind: 'correct', san };
  const playedElsewhere = otherTrees.some((t) => candidatesAt(t, line).some((c) => c.san === san));
  return playedElsewhere ? { kind: 'soft', san, expected } : { kind: 'wrong', san, expected };
}

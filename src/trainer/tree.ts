import type { Color, MoveNode, RepertoireTree } from '../data/levels';

/** A line is the list of SAN moves played from the start position. */
export type Line = readonly string[];

export interface Candidate {
  san: string;
  n: number;
}

/** Children of the position reached by `line`, or null if the line leaves the tree. */
export function childrenAt(tree: RepertoireTree, line: Line): Record<string, MoveNode> | null {
  let children: Record<string, MoveNode> | undefined = tree.tree;
  for (const san of line) {
    const node: MoveNode | undefined = children?.[san];
    if (!node) return null;
    children = node.next;
  }
  return children ?? {};
}

/** Moves the series played from this position, most common first. */
export function candidatesAt(tree: RepertoireTree, line: Line): Candidate[] {
  const children = childrenAt(tree, line);
  if (!children) return [];
  return Object.entries(children)
    .map(([san, node]) => ({ san, n: node.n }))
    .sort((a, b) => b.n - a.n);
}

/** Whose move it is after `line` (white moves on even plies). */
export function sideToMove(line: Line): Color {
  return line.length % 2 === 0 ? 'white' : 'black';
}

/**
 * Pick a move weighted by how often the series played it (`n`).
 * `rand` returns a number in [0, 1); it's injectable for tests.
 */
export function sampleWeighted(candidates: readonly Candidate[], rand: () => number = Math.random): string | null {
  const total = candidates.reduce((sum, c) => sum + c.n, 0);
  if (total <= 0) return null;
  let roll = rand() * total;
  for (const c of candidates) {
    roll -= c.n;
    if (roll < 0) return c.san;
  }
  return candidates[candidates.length - 1].san;
}

/** Number of positions in the tree where `color` has to find a move (the drill size). */
export function countDecisionPositions(tree: RepertoireTree, color: Color): number {
  let count = 0;
  const walk = (children: Record<string, MoveNode> | undefined, ply: number) => {
    if (!children || Object.keys(children).length === 0) return;
    if (sideToMove(new Array(ply)) === color) count++;
    for (const node of Object.values(children)) walk(node.next, ply + 1);
  };
  walk(tree.tree, 0);
  return count;
}

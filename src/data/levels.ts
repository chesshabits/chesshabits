import repertoireJson from '../../data/repertoire-data.json';
import overridesJson from '../../data/repertoire-overrides.json';

export type LevelId = 1 | 2 | 3 | 4;

export interface Level {
  id: LevelId;
  name: string;
  minRating: number;
  /** Inclusive upper bound; null means no upper bound. */
  maxRating: number | null;
}

/** Rating bands from the series (SPEC §2). */
export const LEVELS: readonly Level[] = [
  { id: 1, name: 'Level 1', minRating: 0, maxRating: 699 },
  { id: 2, name: 'Level 2', minRating: 700, maxRating: 1099 },
  { id: 3, name: 'Level 3', minRating: 1100, maxRating: 1599 },
  { id: 4, name: 'Level 4', minRating: 1600, maxRating: null },
];

export function isLevelId(value: unknown): value is LevelId {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function formatRatingRange(level: Level): string {
  return level.maxRating === null
    ? `${level.minRating}+`
    : `${level.minRating}–${level.maxRating}`;
}

export function levelForRating(rating: number): Level {
  return LEVELS.find((l) => l.maxRating === null || rating <= l.maxRating) ?? LEVELS[LEVELS.length - 1];
}

// ---- Repertoire data (data/repertoire-data.json) ----

export type Color = 'white' | 'black';
export type TreeKey = `level${LevelId}_${Color}`;

/** One move in the opening tree; `n` = number of games that reached it. */
export interface MoveNode {
  n: number;
  next?: Record<string, MoveNode>;
}

export interface RepertoireTree {
  games: number;
  tree: Record<string, MoveNode>;
}

export interface RepertoireData {
  source: string;
  levels: Record<`${LevelId}`, string>;
  notes: string;
  trees: Record<TreeKey, RepertoireTree>;
}

export const TREE_KEYS: readonly TreeKey[] = LEVELS.flatMap((l) =>
  (['white', 'black'] as const).map((c) => `level${l.id}_${c}` as TreeKey),
);

export function loadRepertoire(): RepertoireData {
  return repertoireJson as RepertoireData;
}

export interface RepertoireOverrides {
  prune: { tree: string; line: string; reason: string }[];
}

/** Remove the pruned lines (data/repertoire-overrides.json) from a copy of the trees. */
export function applyOverrides(
  trees: Record<TreeKey, RepertoireTree>,
  overrides: RepertoireOverrides,
): Record<TreeKey, RepertoireTree> {
  const out = structuredClone(trees);
  for (const { tree, line } of overrides.prune) {
    const t = out[tree as TreeKey];
    if (!t) continue;
    const moves = line.split(' ');
    const last = moves.pop()!;
    let children: Record<string, MoveNode> | undefined = t.tree;
    for (const san of moves) children = children?.[san]?.next;
    if (children) delete children[last];
  }
  return out;
}

let trees: Record<TreeKey, RepertoireTree> | null = null;

/** The level's tree with manual overrides applied. */
export function getTree(level: LevelId, color: Color): RepertoireTree {
  trees ??= applyOverrides(loadRepertoire().trees, overridesJson as RepertoireOverrides);
  return trees[`level${level}_${color}`];
}

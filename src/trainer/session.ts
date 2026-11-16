import type { Color, LevelId, MoveNode, RepertoireTree } from '../data/levels';
import { isDue, type SrsState } from './srs';
import { candidatesAt, sampleWeighted, sideToMove, type Candidate, type Line } from './tree';

/** A position where the user has to find the repertoire move: one SRS card. */
export interface DecisionPosition {
  line: string[];
  key: string;
  /** Series games that reached this position. */
  n: number;
  expected: Candidate[];
}

/** One stored card (IndexedDB). */
export interface CardRecord extends SrsState {
  id: string;
  deck: string;
  line: string;
  seen: number;
  correct: number;
  lastAt: number;
}

/** New positions introduced per deck per day. */
export const NEW_PER_DAY = 10;

export const lineKey = (line: Line): string => line.join(' ');
export const deckId = (level: LevelId, color: Color): string => `${level}:${color}`;
export const cardId = (level: LevelId, color: Color, line: Line): string => `${deckId(level, color)}:${lineKey(line)}`;

/**
 * Every position in the tree where `color` must move, most-reached first. Because `n` never grows
 * along a line, a position always comes after the positions on the way to it.
 */
export function decisionPositions(tree: RepertoireTree, color: Color): DecisionPosition[] {
  const out: DecisionPosition[] = [];
  const walk = (children: Record<string, MoveNode> | undefined, line: string[], n: number) => {
    if (!children || Object.keys(children).length === 0) return;
    if (sideToMove(line) === color) {
      out.push({ line, key: lineKey(line), n, expected: candidatesAt(tree, line) });
    }
    for (const [san, node] of Object.entries(children)) walk(node.next, [...line, san], node.n);
  };
  walk(tree.tree, [], tree.games);
  return out.sort((a, b) => b.n - a.n || a.line.length - b.line.length);
}

export interface TodayCounts {
  /** Distinct positions reviewed (on schedule) today. */
  done: number;
  /** Positions seen for the first time today. */
  introduced: number;
}

export interface DeckStats {
  total: number;
  due: number;
  /** New positions still on offer today. */
  fresh: number;
  done: number;
}

export function deckStats(
  positions: readonly DecisionPosition[],
  cards: ReadonlyMap<string, Pick<CardRecord, 'due'>>,
  today: TodayCounts,
  now: number,
): DeckStats {
  let due = 0;
  let unseen = 0;
  for (const p of positions) {
    const card = cards.get(p.key);
    if (!card) unseen++;
    else if (isDue(card, now)) due++;
  }
  const fresh = Math.min(unseen, Math.max(0, NEW_PER_DAY - today.introduced));
  return { total: positions.length, due, fresh, done: today.done };
}

export type TargetKind = 'due' | 'new' | 'free';

export interface Target {
  kind: TargetKind;
  /** The position to steer the line toward, or null for free practice. */
  line: string[] | null;
}

/**
 * What the next line should practise: the most overdue position, else the most-reached new
 * position (within today's new allowance), else free practice from the start.
 */
export function pickTarget(
  positions: readonly DecisionPosition[],
  cards: ReadonlyMap<string, Pick<CardRecord, 'due'>>,
  today: TodayCounts,
  now: number,
): Target {
  let best: { line: string[]; due: number } | null = null;
  for (const p of positions) {
    const card = cards.get(p.key);
    if (card && isDue(card, now) && (!best || card.due < best.due)) best = { line: p.line, due: card.due };
  }
  if (best) return { kind: 'due', line: best.line };
  if (today.introduced < NEW_PER_DAY) {
    const fresh = positions.find((p) => !cards.has(p.key));
    if (fresh) return { kind: 'new', line: fresh.line };
  }
  return { kind: 'free', line: null };
}

/**
 * The opponent's next move: follow the target line while on the way to it, then sample from
 * the tree weighted by how often the series saw each reply.
 */
export function nextOpponentMove(
  tree: RepertoireTree,
  line: Line,
  target: Line | null,
  rand: () => number = Math.random,
): string | null {
  if (target && line.length < target.length && line.every((san, i) => san === target[i])) {
    return target[line.length];
  }
  return sampleWeighted(candidatesAt(tree, line), rand);
}

/** Is the line still heading for the target position? */
export function onTargetPath(line: Line, target: Line | null): boolean {
  return !!target && line.length <= target.length && line.every((san, i) => san === target[i]);
}

import type { RepertoireTree } from '../data/levels';
import { candidatesAt, sampleWeighted, type Line } from '../trainer/tree';

/* ---------- book ---------- */

export interface BookReply {
  san: string;
  /** Series games that played this reply. */
  n: number;
  /** Series games that reached the position. */
  total: number;
}

/**
 * The bot's reply while the game follows the series games for this level: a move weighted by how
 * often the series' opponents (or the series player, when the bot has that side) played it.
 * Null once the game leaves the tree.
 */
export function bookReply(tree: RepertoireTree, line: Line, rand: () => number = Math.random): BookReply | null {
  const candidates = candidatesAt(tree, line);
  const san = sampleWeighted(candidates, rand);
  if (!san) return null;
  const total = candidates.reduce((sum, c) => sum + c.n, 0);
  return { san, n: candidates.find((c) => c.san === san)!.n, total };
}

/* ---------- time control and takebacks ---------- */

export interface TimeControl {
  minutes: number;
  incrementSec: number;
}

export const TIME_PRESETS: readonly TimeControl[] = [
  { minutes: 3, incrementSec: 0 },
  { minutes: 5, incrementSec: 0 },
  { minutes: 10, incrementSec: 0 },
];

export const formatTimeControl = (tc: TimeControl | null) => (tc ? `${tc.minutes}+${tc.incrementSec}` : 'off');

export interface GameOptions {
  /** null = no clock (the default). */
  clock: TimeControl | null;
  /** The user's explicit takeback choice; null = follow the default for the clock setting. */
  takebackOverride: boolean | null;
}

export const DEFAULT_OPTIONS: GameOptions = { clock: null, takebackOverride: null };

/** Takebacks are on without a clock and off with one, unless the user says otherwise. */
export function takebackAllowed(o: GameOptions): boolean {
  return o.takebackOverride ?? o.clock === null;
}

/** Changing the clock resets the takeback choice to that clock's default. */
export function withClock(o: GameOptions, clock: TimeControl | null): GameOptions {
  return { ...o, clock, takebackOverride: null };
}

export function withTakeback(o: GameOptions, on: boolean): GameOptions {
  return { ...o, takebackOverride: on === (o.clock === null) ? null : on };
}

/* ---------- clock ---------- */

export type Side = 'white' | 'black';

export interface ClockState {
  /** Remaining time in ms, as of `since` for the running side. */
  white: number;
  black: number;
  incrementMs: number;
  /** Whose clock runs, or null when stopped. */
  running: Side | null;
  since: number;
}

export function newClock(tc: TimeControl): ClockState {
  const ms = tc.minutes * 60_000;
  return { white: ms, black: ms, incrementMs: tc.incrementSec * 1000, running: null, since: 0 };
}

/** Remaining time for each side at `now`. */
export function remaining(c: ClockState, now: number): Record<Side, number> {
  const used = c.running ? Math.max(0, now - c.since) : 0;
  return {
    white: Math.max(0, c.white - (c.running === 'white' ? used : 0)),
    black: Math.max(0, c.black - (c.running === 'black' ? used : 0)),
  };
}

/** `side` just moved: charge its time, add the increment, start the other clock. */
export function pressClock(c: ClockState, side: Side, now: number): ClockState {
  const left = remaining(c, now);
  const other: Side = side === 'white' ? 'black' : 'white';
  return {
    ...c,
    [side]: c.running === side ? left[side] + c.incrementMs : c[side],
    [other]: left[other],
    running: other,
    since: now,
  };
}

export function stopClock(c: ClockState, now: number): ClockState {
  const left = remaining(c, now);
  return { ...c, ...left, running: null, since: now };
}

/** The side whose flag fell, if any. */
export function flagged(c: ClockState, now: number): Side | null {
  const left = remaining(c, now);
  if (c.running && left[c.running] <= 0) return c.running;
  return null;
}

export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (ms < 10_000) return `0:${(ms / 1000).toFixed(1).padStart(4, '0')}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

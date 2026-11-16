/**
 * Spaced repetition per position (SPEC §5.1): SM-2 with a short relearning step, so a
 * missed position comes back within the same session and then on a growing schedule.
 */

export type Rating =
  /** Wrong move, or "show move" was used. */
  | 'again'
  /** "Not our line": a sound move, but not the repertoire move. */
  | 'soft'
  /** Correct after a hint. */
  | 'hard'
  /** Correct first time. */
  | 'good';

export interface SrsState {
  /** Successful reviews in a row. */
  reps: number;
  /** Current interval in days (0 while relearning). */
  interval: number;
  ease: number;
  /** When the position is next due (ms since epoch). */
  due: number;
  lapses: number;
}

export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const INITIAL_EASE = 2.5;
export const MIN_EASE = 1.3;
/** A missed position returns after this long. */
export const AGAIN_DELAY = 1 * MINUTE;
/** A "not our line" position returns after this long. */
export const SOFT_DELAY = 10 * MINUTE;
/** Positions due within this window count as due now (like Anki's learn-ahead). */
export const LEARN_AHEAD = 5 * MINUTE;

export function schedule(prev: SrsState | null, rating: Rating, now: number): SrsState {
  const s: SrsState = prev ?? { reps: 0, interval: 0, ease: INITIAL_EASE, due: now, lapses: 0 };
  switch (rating) {
    case 'again':
      return {
        reps: 0,
        interval: 0,
        ease: Math.max(MIN_EASE, s.ease - 0.2),
        due: now + AGAIN_DELAY,
        lapses: s.lapses + (prev ? 1 : 0),
      };
    case 'soft':
      return { ...s, reps: 0, interval: 0, ease: Math.max(MIN_EASE, s.ease - 0.1), due: now + SOFT_DELAY };
    case 'hard': {
      const interval = s.reps === 0 ? 1 : Math.max(s.interval + 1, Math.round(s.interval * 1.2));
      return { ...s, reps: s.reps + 1, interval, ease: Math.max(MIN_EASE, s.ease - 0.15), due: now + interval * DAY };
    }
    case 'good': {
      const interval = s.reps === 0 ? 1 : s.reps === 1 ? 6 : Math.round(s.interval * s.ease);
      return { ...s, reps: s.reps + 1, interval, ease: s.ease + 0.1, due: now + interval * DAY };
    }
  }
}

export type GradeKind = 'correct' | 'soft' | 'wrong';

/** Map a graded move plus the help used onto an SRS rating. */
export function ratingFor(grade: GradeKind, help: { hint: boolean; shown: boolean }): Rating {
  if (help.shown || grade === 'wrong') return 'again';
  if (grade === 'soft') return 'soft';
  return help.hint ? 'hard' : 'good';
}

export function isDue(state: Pick<SrsState, 'due'>, now: number): boolean {
  return state.due <= now + LEARN_AHEAD;
}

/** "in 8 min", "in 3 days", "now" */
export function formatDue(due: number, now: number): string {
  const ms = due - now;
  if (ms <= LEARN_AHEAD) return 'now';
  if (ms < 90 * MINUTE) return `in ${Math.round(ms / MINUTE)} min`;
  if (ms < 36 * 3_600_000) return `in ${Math.round(ms / 3_600_000)} h`;
  const days = Math.round(ms / DAY);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

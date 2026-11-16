import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Key } from 'chessground/types';
import { getStore, startOfDay, type ReviewRecord } from '../db';
import { levelConfig } from '../data/habits';
import { LEVELS, getTree, type Color, type LevelId } from '../data/levels';
import { explainMove, moveLabel, replay } from './explain';
import { gradeMove } from './grade';
import {
  cardId,
  deckId,
  deckStats,
  decisionPositions,
  lineKey,
  nextOpponentMove,
  onTargetPath,
  pickTarget,
  practiceTarget,
  type CardRecord,
  type DeckStats,
  type Target,
} from './session';
import { ratingFor, schedule, isDue, type Rating } from './srs';
import { candidatesAt, type Candidate } from './tree';

export type Phase = 'loading' | 'opponent' | 'user' | 'retry' | 'complete';

export interface Feedback {
  kind: 'correct' | 'soft' | 'wrong' | 'shown';
  /** e.g. "3.Bc4" */
  played: string | null;
  /** e.g. "3.Nc3" */
  expected: string;
  /** Series games behind the expected move. */
  games: number;
  text: string;
  /** The rejected move, to draw on the board. */
  wrongMove?: [Key, Key];
  /** Retrying after a miss and missed again. */
  again?: boolean;
}

interface RunState {
  target: Target;
  line: string[];
  phase: Phase;
  feedback: Feedback | null;
  hint: boolean;
  shown: boolean;
  /** Whether the current position has been graded already (only the first try counts). */
  graded: boolean;
  /** Key of the latest position where the user had to move. */
  decisionKey: string | null;
  results: Rating[];
  /** Bumped when a move is rejected, so the board snaps back. */
  sync: number;
}

const OPPONENT_DELAY = 450;

const initialRun = (): RunState => ({
  target: { kind: 'free', line: null },
  line: [],
  phase: 'loading',
  feedback: null,
  hint: false,
  shown: false,
  graded: false,
  decisionKey: null,
  results: [],
  sync: 0,
});

/** from/to squares of a SAN move after `line`. */
export function squaresOf(line: readonly string[], san: string): [Key, Key] | null {
  try {
    const m = replay(line).chess.move(san);
    return [m.from as Key, m.to as Key];
  } catch {
    return null;
  }
}

export function useTrainer(level: LevelId, color: Color) {
  const tree = useMemo(() => getTree(level, color), [level, color]);
  const others = useMemo(
    () => LEVELS.filter((l) => l.id !== level).map((l) => getTree(l.id, color)),
    [level, color],
  );
  const positions = useMemo(() => decisionPositions(tree, color), [tree, color]);
  const deck = deckId(level, color);
  /** L3–L4 schedule positions with SM-2; L1–L2 just practise (SPEC §5.1). Attempts are stored either way. */
  const spaced = levelConfig(level).trainer.spacedRepetition;

  // Practice-mode session: positions answered, misses waiting for a retry, and totals.
  const [practice, setPractice] = useState(() => ({
    seen: new Set<string>(),
    missed: new Map<string, number>(),
    played: 0,
    correct: 0,
  }));
  const practiceRef = useRef(practice);
  practiceRef.current = practice;

  const [cards, setCards] = useState<Map<string, CardRecord> | null>(null);
  const [today, setToday] = useState<{ done: Set<string>; introduced: Set<string> }>({
    done: new Set(),
    introduced: new Set(),
  });
  const [run, setRun] = useState<RunState>(initialRun);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const todayRef = useRef(today);
  todayRef.current = today;

  // Load the deck's cards and today's reviews.
  useEffect(() => {
    let cancelled = false;
    setCards(null);
    setRun(initialRun());
    (async () => {
      const store = await getStore();
      const [list, reviews] = await Promise.all([store.cards(deck), store.reviewsSince(deck, startOfDay(Date.now()))]);
      if (cancelled) return;
      const done = new Set<string>();
      const introduced = new Set<string>();
      for (const r of reviews) {
        if (r.scheduled) done.add(r.cardId);
        if (r.wasNew) introduced.add(r.cardId);
      }
      setToday({ done, introduced });
      setCards(new Map(list.map((c) => [c.line, c])));
    })();
    return () => {
      cancelled = true;
    };
  }, [deck]);

  /** Positions skipped with "s" this session; they are left out of target selection. */
  const skipped = useRef(new Set<string>());

  const startRun = useCallback(() => {
    const c = cardsRef.current;
    if (!c) return;
    const t = todayRef.current;
    const pool = positions.filter((p) => !skipped.current.has(p.key));
    let target: Target;
    if (spaced) {
      target = pickTarget(pool, c, { done: t.done.size, introduced: t.introduced.size }, Date.now());
    } else {
      // A new line starts: every pending miss is one line older.
      const p = practiceRef.current;
      const missed = new Map([...p.missed].map(([k, n]) => [k, n + 1]));
      target = practiceTarget(pool, { seen: p.seen, missed });
      const next = { ...p, missed };
      practiceRef.current = next;
      setPractice(next);
    }
    setRun((r) => ({
      ...initialRun(),
      sync: r.sync + 1,
      target,
      phase: color === 'white' ? 'user' : 'opponent',
      decisionKey: color === 'white' ? '' : null,
    }));
  }, [positions, color, spaced]);

  // First line once the deck is loaded.
  useEffect(() => {
    if (cards && run.phase === 'loading') startRun();
  }, [cards, run.phase, startRun]);

  // The opponent replies from the tree.
  useEffect(() => {
    if (run.phase !== 'opponent') return;
    const id = window.setTimeout(() => {
      setRun((r) => {
        if (r.phase !== 'opponent') return r;
        const mv = nextOpponentMove(tree, r.line, r.target.line);
        if (!mv) return { ...r, phase: 'complete' };
        const line = [...r.line, mv];
        const done = candidatesAt(tree, line).length === 0;
        return {
          ...r,
          line,
          phase: done ? 'complete' : 'user',
          decisionKey: done ? r.decisionKey : lineKey(line),
          graded: false,
          hint: false,
          shown: false,
        };
      });
    }, OPPONENT_DELAY);
    return () => window.clearTimeout(id);
  }, [run.phase, run.line, tree]);

  /** Store the first graded attempt at a position. */
  const record = useCallback(
    (line: string[], rating: Rating, correct: boolean) => {
      const key = lineKey(line);
      const id = cardId(level, color, line);
      const now = Date.now();
      const prev = cardsRef.current?.get(key) ?? null;
      const wasNew = !prev;
      // New and due positions follow the schedule; a miss always reschedules, even early.
      const scheduled = prev === null || isDue(prev, now) || rating === 'again' || rating === 'soft';
      const srs = scheduled || prev === null ? schedule(prev, rating, now) : prev;
      const card: CardRecord = {
        id,
        deck,
        line: key,
        reps: srs.reps,
        interval: srs.interval,
        ease: srs.ease,
        due: srs.due,
        lapses: srs.lapses,
        seen: (prev?.seen ?? 0) + 1,
        correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
        lastAt: now,
      };
      setCards((m) => new Map(m ?? []).set(key, card));
      setToday((t) => ({
        done: scheduled ? new Set(t.done).add(id) : t.done,
        introduced: wasNew ? new Set(t.introduced).add(id) : t.introduced,
      }));
      setPractice((p) => {
        const missed = new Map(p.missed);
        if (rating === 'again' || rating === 'soft') missed.set(key, 0);
        else missed.delete(key);
        return {
          seen: new Set(p.seen).add(key),
          missed,
          played: p.played + 1,
          correct: p.correct + (correct ? 1 : 0),
        };
      });
      const review: ReviewRecord = { deck, cardId: id, at: now, rating, scheduled, wasNew };
      void getStore().then(async (s) => {
        await s.putCard(card);
        await s.addReview(review);
      });
    },
    [level, color, deck],
  );

  const feedbackFor = useCallback(
    (kind: Feedback['kind'], line: string[], played: string | null, expected: Candidate[]): Feedback => {
      const main = expected[0];
      return {
        kind,
        played: played ? moveLabel(line.length, played) : null,
        expected: moveLabel(line.length, main.san),
        games: main.n,
        text: explainMove(line, kind === 'correct' && played ? played : main.san),
      };
    },
    [],
  );

  const advance = useCallback(
    (r: RunState, san: string, feedback: Feedback | null): RunState => {
      const line = [...r.line, san];
      // Played a different (also correct) move than the target line: practise from here instead.
      const target =
        r.target.line && line.length <= r.target.line.length && !onTargetPath(line, r.target.line)
          ? { ...r.target, line: null }
          : r.target;
      const done = candidatesAt(tree, line).length === 0;
      return { ...r, line, target, feedback, phase: done ? 'complete' : 'opponent', hint: false, shown: false };
    },
    [tree],
  );

  /** Move handlers run outside render, so they read the latest run from a ref and write side effects once. */
  const runRef = useRef(run);
  runRef.current = run;
  const commit = useCallback((next: RunState) => {
    runRef.current = next;
    setRun(next);
  }, []);

  const onMove = useCallback(
    (from: Key, to: Key) => {
      const r = runRef.current;
      if (r.phase !== 'user' && r.phase !== 'retry') return;
      let san: string;
      try {
        san = new Chess(replay(r.line).chess.fen()).move({ from, to, promotion: 'q' }).san;
      } catch {
        commit({ ...r, sync: r.sync + 1 });
        return;
      }
      const expected = candidatesAt(tree, r.line);
      if (r.phase === 'retry') {
        if (expected.some((c) => c.san === san)) {
          commit(advance(r, san, r.feedback));
        } else {
          commit({
            ...r,
            sync: r.sync + 1,
            feedback: {
              ...feedbackFor(r.feedback?.kind ?? 'wrong', r.line, san, expected),
              wrongMove: [from, to],
              again: true,
            },
          });
        }
        return;
      }
      const grade = gradeMove(tree, r.line, san, others);
      const rating = ratingFor(grade.kind, { hint: r.hint, shown: false });
      if (!r.graded) record(r.line, rating, grade.kind === 'correct');
      const results = r.graded ? r.results : [...r.results, rating];
      if (grade.kind === 'correct') {
        commit(advance({ ...r, results, graded: true }, san, feedbackFor('correct', r.line, san, expected)));
      } else {
        commit({
          ...r,
          results,
          graded: true,
          phase: 'retry',
          sync: r.sync + 1,
          feedback: { ...feedbackFor(grade.kind, r.line, san, expected), wrongMove: [from, to] },
        });
      }
    },
    [tree, others, record, advance, feedbackFor, commit],
  );

  const showHint = useCallback(() => {
    const r = runRef.current;
    if (r.phase === 'user') commit({ ...r, hint: true });
  }, [commit]);

  const showMove = useCallback(() => {
    const r = runRef.current;
    if (r.phase !== 'user') return;
    const expected = candidatesAt(tree, r.line);
    if (!r.graded) record(r.line, 'again', false);
    commit({
      ...r,
      graded: true,
      shown: true,
      phase: 'retry',
      results: r.graded ? r.results : [...r.results, 'again'],
      feedback: feedbackFor('shown', r.line, null, expected),
    });
  }, [tree, record, feedbackFor, commit]);

  /** Skip the current line; the position it was heading for is not offered again this session. */
  const skip = useCallback(() => {
    const r = runRef.current;
    const key = r.target.line ? lineKey(r.target.line) : r.decisionKey;
    if (key !== null && r.phase !== 'complete') {
      if (spaced) {
        skipped.current.add(key);
      } else {
        // Practice: count it as covered so the cycle moves on; a pending miss still comes back.
        const p = practiceRef.current;
        const next = { ...p, seen: new Set(p.seen).add(key) };
        practiceRef.current = next;
        setPractice(next);
      }
    }
    startRun();
  }, [startRun, spaced]);

  const stats: DeckStats | null = useMemo(
    () => (cards ? deckStats(positions, cards, { done: today.done.size, introduced: today.introduced.size }, Date.now()) : null),
    // Also recompute when a line starts or ends, so "due" picks up positions that just came due.
    [cards, positions, today, run.phase === 'complete', run.target],
  );

  const expected = run.phase === 'user' || run.phase === 'retry' ? candidatesAt(tree, run.line) : [];
  const decisionCard = run.decisionKey !== null ? (cards?.get(run.decisionKey) ?? null) : null;

  const practiceStats = {
    played: practice.played,
    correct: practice.correct,
    retry: practice.missed.size,
    covered: practice.seen.size,
    total: positions.length,
  };

  return {
    tree,
    positions,
    run,
    spaced,
    stats,
    practiceStats,
    expected,
    decisionCard,
    startRun,
    skip,
    onMove,
    showHint,
    showMove,
  };
}

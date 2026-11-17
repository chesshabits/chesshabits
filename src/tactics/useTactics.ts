import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Key } from 'chessground/types';
import { branch } from '../components/MoveNav';
import { getStore, startOfDay, type PuzzleRecord } from '../db';
import type { LevelId } from '../data/levels';
import { loadPuzzles } from './data';
import { checkMove, pickPuzzle, replayUci, solutionMoves, uciOf, uciToMove, type Puzzle } from './puzzle';

export type TacticsPhase = 'loading' | 'setup' | 'user' | 'opponent' | 'showing' | 'solved' | 'failed';

interface State {
  puzzle: Puzzle | null;
  /**
   * UCI moves on the board from the puzzle position. While solving, a prefix of the solution;
   * once the puzzle is over, free play from any viewed position (branching).
   */
  played: string[];
  phase: TacticsPhase;
  mistakes: number;
  hint: boolean;
  shown: boolean;
  /** Last rejected move, drawn on the board. */
  wrong: [Key, Key] | null;
  sync: number;
}

const SETUP_DELAY = 600;
const REPLY_DELAY = 400;
const SHOW_STEP = 700;
const RECENT = 8;

const fresh = (puzzle: Puzzle | null, sync: number): State => ({
  puzzle,
  played: [],
  phase: puzzle ? 'setup' : 'loading',
  mistakes: 0,
  hint: false,
  shown: false,
  wrong: null,
  sync: sync + 1,
});

export const isFinished = (phase: TacticsPhase) => phase === 'solved' || phase === 'failed';

export function useTactics(level: LevelId, theme: string | null) {
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const [records, setRecords] = useState<Map<string, PuzzleRecord> | null>(null);
  const [state, setState] = useState<State>(() => fresh(null, 0));
  const [session, setSession] = useState({ solved: 0, failed: 0, streak: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    let cancelled = false;
    setPuzzles(null);
    setRecords(null);
    (async () => {
      const [list, store] = await Promise.all([loadPuzzles(level), getStore()]);
      const recs = await store.puzzles(level);
      if (cancelled) return;
      setPuzzles(list);
      setRecords(new Map(recs.map((r) => [r.id, r])));
    })();
    return () => {
      cancelled = true;
    };
  }, [level]);

  const pool = useMemo(
    () => (puzzles && theme ? puzzles.filter((p) => p.themes.includes(theme)) : (puzzles ?? [])),
    [puzzles, theme],
  );

  const commit = (s: State) => {
    stateRef.current = s;
    setState(s);
  };

  const next = useCallback(() => {
    const recs = recordsRef.current;
    if (!recs) return;
    const p = pickPuzzle(pool, recs, stateRef.current.puzzle?.id ?? null);
    commit(fresh(p, stateRef.current.sync));
  }, [pool]);

  /** Start the current puzzle again (the first-try result is kept). */
  const retry = useCallback(() => {
    const s = stateRef.current;
    if (s.puzzle) commit(fresh(s.puzzle, s.sync));
  }, []);

  /** Reopen a puzzle by ID (the "recent" list). */
  const open = useCallback(
    (id: string) => {
      const p = puzzles?.find((x) => x.id === id);
      if (p) commit(fresh(p, stateRef.current.sync));
    },
    [puzzles],
  );

  // First puzzle once loaded, and a new one when the theme filter changes.
  const loaded = records !== null;
  useEffect(() => {
    if (loaded && pool.length) next();
  }, [loaded, pool, next]);

  const finish = useCallback(
    (s: State, solved: boolean) => {
      const p = s.puzzle!;
      const clean = solved && s.mistakes === 0 && !s.hint && !s.shown;
      const prev = recordsRef.current?.get(p.id);
      const rec: PuzzleRecord = {
        id: p.id,
        level,
        attempts: (prev?.attempts ?? 0) + 1,
        firstTry: prev ? prev.firstTry : clean,
        solved: (prev?.solved ?? 0) + (clean ? 1 : 0),
        lastAt: Date.now(),
        lastResult: clean ? 'solved' : 'failed',
      };
      setRecords((m) => new Map(m ?? []).set(p.id, rec));
      setSession((x) => ({
        solved: x.solved + (clean ? 1 : 0),
        failed: x.failed + (clean ? 0 : 1),
        streak: clean ? x.streak + 1 : 0,
      }));
      void getStore().then((st) => st.putPuzzle(rec));
    },
    [level],
  );

  // Automatic moves: the setup move, opponent replies, and stepping through a shown solution.
  useEffect(() => {
    const s = state;
    if (!s.puzzle) return;
    const moves = solutionMoves(s.puzzle);
    const delay = s.phase === 'setup' ? SETUP_DELAY : s.phase === 'opponent' ? REPLY_DELAY : s.phase === 'showing' ? SHOW_STEP : 0;
    if (!delay) return;
    const id = window.setTimeout(() => {
      const cur = stateRef.current;
      if (cur.phase !== s.phase || cur.played.length !== s.played.length || cur.puzzle !== s.puzzle) return;
      const played = moves.slice(0, cur.played.length + 1);
      const done = played.length >= moves.length;
      if (cur.phase === 'showing') commit({ ...cur, played, phase: done ? 'failed' : 'showing' });
      else commit({ ...cur, played, phase: done ? 'solved' : 'user', wrong: null });
    }, delay);
    return () => window.clearTimeout(id);
  }, [state]);

  /**
   * A move on the board. While solving it is checked against the solution; once the puzzle is
   * over it is free play from the viewed ply `at` (later moves are dropped).
   */
  const onMove = useCallback(
    (from: Key, to: Key, at: number | null) => {
      const s = stateRef.current;
      if (!s.puzzle) return;
      if (isFinished(s.phase)) {
        const ply = at ?? s.played.length;
        const board = replayUci(s.puzzle.fen, s.played.slice(0, ply)).chess;
        let uci: string;
        try {
          uci = uciOf(new Chess(board.fen()).move({ from, to, promotion: 'q' }));
        } catch {
          commit({ ...s, sync: s.sync + 1 });
          return;
        }
        commit({ ...s, played: branch(s.played, ply, uci), wrong: null, sync: s.sync + 1 });
        return;
      }
      if (s.phase !== 'user') return;
      const moves = solutionMoves(s.puzzle);
      const ply = s.played.length;
      const { ok } = checkMove(s.puzzle, ply, from, to);
      if (!ok) {
        commit({ ...s, mistakes: s.mistakes + 1, wrong: [from, to], sync: s.sync + 1 });
        return;
      }
      const played = moves.slice(0, ply + 1);
      if (played.length >= moves.length) {
        // A different mating move may have been accepted: show the stored one so the board matches.
        const done: State = { ...s, played, phase: 'solved', wrong: null, sync: s.sync + 1 };
        commit(done);
        finish(done, true);
      } else {
        commit({ ...s, played, phase: 'opponent', wrong: null });
      }
    },
    [finish],
  );

  const showHint = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === 'user') commit({ ...s, hint: true });
  }, []);

  const showSolution = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'user') return;
    const shown: State = { ...s, shown: true, phase: 'showing', wrong: null };
    commit(shown);
    finish(shown, false);
  }, [finish]);

  const expectedMove = (() => {
    if (!state.puzzle || state.phase !== 'user') return null;
    const m = uciToMove(solutionMoves(state.puzzle)[state.played.length]);
    return [m.from as Key, m.to as Key] as [Key, Key];
  })();

  const todayStart = startOfDay(Date.now());
  const stats = records
    ? {
        attempted: records.size,
        cleanFirstTry: [...records.values()].filter((r) => r.firstTry).length,
        today: [...records.values()].filter((r) => r.lastAt >= todayStart).length,
      }
    : null;

  /** Puzzles played most recently (this level), newest first. */
  const recent = useMemo(() => {
    if (!records || !puzzles) return [];
    const byId = new Map(puzzles.map((p) => [p.id, p]));
    return [...records.values()]
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, RECENT)
      .flatMap((r) => {
        const p = byId.get(r.id);
        return p ? [{ puzzle: p, record: r }] : [];
      });
  }, [records, puzzles]);

  return {
    puzzles,
    pool,
    records,
    recent,
    state,
    session,
    stats,
    expectedMove,
    next,
    retry,
    open,
    onMove,
    showHint,
    showSolution,
  };
}

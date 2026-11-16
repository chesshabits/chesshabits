import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'chessground/types';
import { getStore, startOfDay, type PuzzleRecord } from '../db';
import type { LevelId } from '../data/levels';
import { loadPuzzles } from './data';
import { checkMove, pickPuzzle, solutionMoves, uciToMove, type Puzzle } from './puzzle';

export type TacticsPhase = 'loading' | 'setup' | 'user' | 'opponent' | 'showing' | 'solved' | 'failed';

interface State {
  puzzle: Puzzle | null;
  ply: number;
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

const fresh = (puzzle: Puzzle | null, sync: number): State => ({
  puzzle,
  ply: 0,
  phase: puzzle ? 'setup' : 'loading',
  mistakes: 0,
  hint: false,
  shown: false,
  wrong: null,
  sync: sync + 1,
});

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

  const next = useCallback(() => {
    const recs = recordsRef.current;
    if (!recs) return;
    const p = pickPuzzle(pool, recs, stateRef.current.puzzle?.id ?? null);
    setState((s) => fresh(p, s.sync));
  }, [pool]);

  // First puzzle once loaded, and a new one when the theme filter changes (not on every record update).
  const loaded = records !== null;
  useEffect(() => {
    if (loaded && pool.length) next();
  }, [loaded, pool, next]);

  const commit = (s: State) => {
    stateRef.current = s;
    setState(s);
  };

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
    let delay = 0;
    if (s.phase === 'setup') delay = SETUP_DELAY;
    else if (s.phase === 'opponent') delay = REPLY_DELAY;
    else if (s.phase === 'showing') delay = SHOW_STEP;
    else return;
    const id = window.setTimeout(() => {
      const cur = stateRef.current;
      if (cur.phase !== s.phase || cur.ply !== s.ply || cur.puzzle !== s.puzzle) return;
      const ply = cur.ply + 1;
      if (cur.phase === 'showing') {
        commit({ ...cur, ply, phase: ply >= moves.length ? 'failed' : 'showing' });
      } else {
        commit({ ...cur, ply, phase: ply >= moves.length ? 'solved' : 'user', wrong: null });
      }
    }, delay);
    return () => window.clearTimeout(id);
  }, [state]);

  const onMove = useCallback(
    (from: Key, to: Key) => {
      const s = stateRef.current;
      if (s.phase !== 'user' || !s.puzzle) return;
      const moves = solutionMoves(s.puzzle);
      const { ok } = checkMove(s.puzzle, s.ply, from, to);
      if (!ok) {
        commit({ ...s, mistakes: s.mistakes + 1, wrong: [from, to], sync: s.sync + 1 });
        return;
      }
      const ply = s.ply + 1;
      if (ply >= moves.length) {
        // A different mating move was accepted: show the stored one so the board matches.
        const done: State = { ...s, ply, phase: 'solved', wrong: null, sync: s.sync + 1 };
        commit(done);
        finish(done, true);
      } else {
        commit({ ...s, ply, phase: 'opponent', wrong: null });
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
    const shownState: State = { ...s, shown: true, phase: 'showing', wrong: null };
    commit(shownState);
    finish(shownState, false);
  }, [finish]);

  const expectedMove = (() => {
    if (!state.puzzle || state.phase !== 'user') return null;
    const uci = solutionMoves(state.puzzle)[state.ply];
    const m = uciToMove(uci);
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

  return {
    puzzles,
    pool,
    records,
    state,
    session,
    stats,
    expectedMove,
    next,
    onMove,
    showHint,
    showSolution,
  };
}

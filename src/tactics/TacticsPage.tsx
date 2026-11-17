import { useMemo, useState } from 'react';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Board } from '../components/Board';
import { MoveList, StepButtons, moveLabel, useLineView } from '../components/MoveNav';
import { HabitsPanel, ProgressRow, Row, Section, Tabs } from '../components/Panels';
import { levelConfig, showsOpeningNames } from '../data/habits';
import type { LevelId } from '../data/levels';
import { tagLabel } from '../data/openings';
import { useKeys } from '../hooks';
import { tacticsLabel } from '../nav';
import { replayUci, solverColor, solutionMoves, startPly, themeLabel } from './puzzle';
import { isFinished, useTactics } from './useTactics';

interface Props {
  level: LevelId;
  desktop: boolean;
}

/** Opening-filtered tactics ("free pieces" at Level 1), SPEC §5.2. */
export function TacticsPage({ level, desktop }: Props) {
  const [theme, setTheme] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState<'moves' | 'puzzle' | 'themes' | 'stats'>('moves');
  const t = useTactics(level, theme);
  const { state } = t;
  const p = state.puzzle;
  const solver = p ? solverColor(p) : 'white';
  const orientation = flipped ? (solver === 'white' ? 'black' : 'white') : solver;
  const finished = isFinished(state.phase);

  // Every move on the board, and which of them the board shows (← / → step through them).
  const full = useMemo(() => (p ? replayUci(p.fen, state.played) : null), [p, state.played]);
  const lineView = useLineView(state.played.length, `${p?.id}:${state.sync}`);
  const view = useMemo(
    () => (p ? replayUci(p.fen, state.played.slice(0, lineView.shown)) : null),
    [p, state.played, lineView.shown],
  );
  const lastMove: [Key, Key] | undefined = view?.last ? [view.last.from as Key, view.last.to as Key] : undefined;
  const live = lineView.view === null;
  const turn = view ? (view.chess.turn() === 'w' ? 'white' : 'black') : solver;
  // While solving, only the solver moves (at the live position); once it's over, either side, from any move.
  const movable = finished ? turn : state.phase === 'user' && live ? solver : null;

  const shapes = useMemo<DrawShape[]>(() => {
    if (!live) return [];
    const out: DrawShape[] = [];
    if (state.wrong) out.push({ orig: state.wrong[0], dest: state.wrong[1], brush: 'bad' });
    if (state.hint && t.expectedMove) out.push({ orig: t.expectedMove[0], brush: 'accent' });
    return out;
  }, [live, state.wrong, state.hint, t.expectedMove]);

  useKeys({
    f: () => setFlipped((v) => !v),
    h: () => t.showHint(),
    s: () => t.next(),
    r: p ? () => t.retry() : undefined,
    n: finished ? () => t.next() : undefined,
    Enter: finished ? () => t.next() : undefined,
    ArrowLeft: () => lineView.step(-1),
    ArrowRight: () => lineView.step(1),
    Home: lineView.first,
    End: lineView.last,
  });

  // Theme counts for the filter.
  const config = levelConfig(level);
  const themeCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const pz of t.puzzles ?? []) for (const th of pz.themes) if (config.tactics.themes.includes(th)) c.set(th, (c.get(th) ?? 0) + 1);
    return config.tactics.themes.filter((th) => c.get(th)).map((th) => ({ theme: th, n: c.get(th)! }));
  }, [t.puzzles, config]);

  let label = 'your move';
  let text = '';
  if (!p) text = t.puzzles && t.pool.length === 0 ? 'No puzzles for this filter.' : 'Loading puzzles…';
  else if (state.phase === 'setup') text = `${cap(solver === 'white' ? 'black' : 'white')} is about to move…`;
  else if (state.phase === 'user' || state.phase === 'opponent')
    text = state.played.length <= 1 ? `Find the best move for ${solver}.` : 'Keep going: find the next move.';
  else if (state.phase === 'showing') {
    label = 'solution';
    text = 'Here is the solution.';
  } else if (state.phase === 'solved') {
    label = 'solved';
    text = state.mistakes || state.hint ? 'Solved, with help. It will come back later.' : 'Solved. Well spotted.';
  } else if (state.phase === 'failed') {
    label = 'solution shown';
    text = 'This one will come back later.';
  }
  if (finished) text += ' Keep playing from any move, or try it again.';

  const prompt = (
    <div className="prompt" aria-live="polite">
      <div className="label">
        <span className={state.phase === 'failed' ? 'bad' : undefined}>{label}</span>
        <span className="dim">{p ? `puzzle ${p.rating}` : ''}</span>
      </div>
      {state.wrong && state.phase === 'user' && (
        <div className="feedback">
          <span className="bad">✕ </span>Not the move. Try again, or use a hint.
        </div>
      )}
      {state.phase === 'solved' && (
        <div className="feedback">
          <span className="accent">✓ </span>
          {state.mistakes ? `${state.mistakes} wrong ${state.mistakes === 1 ? 'try' : 'tries'}` : 'first try'}
        </div>
      )}
      <p>{text}</p>
      {desktop && <Buttons t={t} finished={finished} className="btn-pair" />}
    </div>
  );

  // Opening names only from Level 3 (SPEC §7.1); puzzles still come from our lines at every level.
  const namesOpenings = showsOpeningNames(level);
  const info = p && (
    <Section id="puzzle" title="puzzle" icon="grid" summary={p.rating}>
      <Row label="rating" value={p.rating} />
      {namesOpenings && (
        <div className="row">
          <span className="dim">opening</span>
          <span style={{ textAlign: 'right' }}>{p.opening ? tagLabel(p.opening) : '—'}</span>
        </div>
      )}
      <div className="row">
        <span className="dim">themes</span>
        <span style={{ textAlign: 'right' }}>
          {finished
            ? p.themes.filter((th) => config.tactics.themes.includes(th)).map(themeLabel).join(', ') || '—'
            : 'shown when done'}
        </span>
      </div>
      <Row label="moves" value={`${Math.ceil((solutionMoves(p).length - 1) / 2)} to find`} />
      <a className="row" href={`https://lichess.org/training/${p.id}`} target="_blank" rel="noopener noreferrer">
        <span>on lichess</span>
        <span className="count">#{p.id} ↗</span>
      </a>
    </Section>
  );

  const moves = p && full && (
    <Section id="puzzle-moves" title="moves" icon="list" summary={finished ? 'free play' : `${Math.max(0, state.played.length - 1)} played`}>
      <MoveList
        line={full.sans}
        firstPly={startPly(p)}
        view={lineView.view}
        onView={lineView.setView}
        pending={state.phase === 'user'}
        extraFrom={finished ? solutionMoves(p).length : undefined}
      />
      <StepButtons view={lineView} length={state.played.length} />
    </Section>
  );

  const recent = t.recent.length > 0 && (
    <Section id="recent" title="recent" icon="clock" summary={t.recent.length}>
      {t.recent.map(({ puzzle, record }) => (
        <button
          key={puzzle.id}
          type="button"
          className="row"
          aria-pressed={puzzle.id === p?.id}
          onClick={() => t.open(puzzle.id)}
        >
          <span>
            #{puzzle.id} <span className="dim">· {puzzle.rating}</span>
          </span>
          <span className={record.lastResult === 'solved' ? 'accent' : 'bad'}>{record.lastResult === 'solved' ? '✓' : '✕'}</span>
        </button>
      ))}
    </Section>
  );

  const filter = (
    <Section id="themes" title="themes" icon="tag" summary={theme ? themeLabel(theme) : 'all'}>
      <button type="button" className="row" aria-pressed={theme === null} onClick={() => setTheme(null)}>
        <span>all</span>
        <span className="count">{t.puzzles?.length ?? '…'}</span>
      </button>
      {themeCounts.map((x) => (
        <button
          key={x.theme}
          type="button"
          className="row"
          aria-pressed={theme === x.theme}
          onClick={() => setTheme(x.theme)}
        >
          <span>{themeLabel(x.theme)}</span>
          <span className="count">{x.n}</span>
        </button>
      ))}
    </Section>
  );

  const total = t.puzzles?.length ?? 0;
  const statsPanel = (
    <Section id="tactics" title={tacticsLabel(level)} icon="bars" summary={`${t.session.solved} ✓`}>
      <Row label="this session" value={`${t.session.solved} ✓ · ${t.session.failed} ✕`} />
      <Row label="streak" value={t.session.streak} />
      <Row label="today" value={t.stats?.today ?? '…'} />
      <ProgressRow label="tried" done={t.stats?.attempted ?? 0} total={total} what="puzzles tried" />
    </Section>
  );

  const board = (
    <Board
      fen={view ? view.chess.fen() : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
      orientation={orientation}
      movable={movable}
      lastMove={lastMove}
      shapes={shapes}
      onMove={(from, to) => t.onMove(from, to, lineView.view)}
      syncKey={state.sync}
      label={finished ? 'Puzzle board, free play' : `Puzzle board, ${solver} to move`}
    />
  );

  const opening = namesOpenings && p?.opening ? tagLabel(p.opening) : '';
  const glyph = (c: string) => (c === 'white' ? '♔' : '♚');
  const top = orientation === 'white' ? 'black' : 'white';
  const bottom = orientation;
  const who = (c: string) => (c === solver ? `you · ${c}` : c);

  if (desktop) {
    return (
      <>
        <aside className="side left" aria-label="Progress and habits">
          {statsPanel}
          <HabitsPanel level={level} />
        </aside>
        <main className="center board-area">
          <div className="board-strip">
            <span>
              {glyph(top)} {who(top)}
            </span>
            <span>{opening}</span>
          </div>
          <div className="board-frame">{board}</div>
          <div className="board-strip">
            <span>
              {glyph(bottom)} {who(bottom)}
            </span>
            <span>{live ? 'f flip · h hint · r retry · ← → step' : lineView.shown && full && p
                ? `viewing ${moveLabel(startPly(p) + lineView.shown - 1, full.sans[lineView.shown - 1])} · → to return`
                : 'viewing the start · → to return'}</span>
          </div>
        </main>
        <aside className="side right" aria-label="Puzzle">
          {prompt}
          {moves}
          {info}
          {recent}
          {filter}
        </aside>
      </>
    );
  }

  return (
    <>
      <div className="m-strip">
        <span>
          {glyph(solver)} {solver} to move
          {opening ? ` · ${opening}` : ''}
        </span>
        <span>{p?.rating ?? ''}</span>
      </div>
      <div className="m-board">{board}</div>
      {prompt}
      <Buttons t={t} finished={finished} className="btn-bar" />
      <Tabs tabs={['moves', 'puzzle', 'themes', 'stats'] as const} value={tab} onChange={setTab} />
      {tab === 'moves' && moves}
      {tab === 'puzzle' && (
        <>
          {info}
          {recent}
        </>
      )}
      {tab === 'themes' && filter}
      {tab === 'stats' && (
        <>
          {statsPanel}
          <HabitsPanel level={level} />
        </>
      )}
    </>
  );
}

function Buttons({ t, finished, className }: { t: ReturnType<typeof useTactics>; finished: boolean; className: string }) {
  const { state } = t;
  if (finished) {
    return (
      <div className={className}>
        <button type="button" onClick={t.retry}>
          try again
        </button>
        <button type="button" className="primary" onClick={t.next}>
          next puzzle →
        </button>
      </div>
    );
  }
  const active = state.phase === 'user';
  return (
    <div className={className}>
      <button type="button" onClick={t.showHint} disabled={!active || state.hint}>
        hint
      </button>
      <button type="button" onClick={t.showSolution} disabled={!active}>
        show solution
      </button>
    </div>
  );
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

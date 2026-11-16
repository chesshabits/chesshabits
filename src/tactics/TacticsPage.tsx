import { useMemo, useState } from 'react';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Board } from '../components/Board';
import { DrillNav, HabitsPanel, ProgressRow, Row, Section, Tabs, type DrillCounts } from '../components/Panels';
import { levelConfig, showsOpeningNames } from '../data/habits';
import type { LevelId } from '../data/levels';
import { tagLabel } from '../data/openings';
import { useKeys } from '../hooks';
import { positionAt, solverColor, solutionMoves, themeLabel } from './puzzle';
import { useTactics } from './useTactics';

interface Props {
  level: LevelId;
  desktop: boolean;
  counts: DrillCounts;
}

/** Opening-filtered tactics (SPEC §5.2). */
export function TacticsPage({ level, desktop, counts }: Props) {
  const [theme, setTheme] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState<'puzzle' | 'themes' | 'stats'>('puzzle');
  const t = useTactics(level, theme);
  const { state } = t;
  const p = state.puzzle;
  const solver = p ? solverColor(p) : 'white';
  const orientation = flipped ? (solver === 'white' ? 'black' : 'white') : solver;
  const finished = state.phase === 'solved' || state.phase === 'failed';

  const view = useMemo(() => (p ? positionAt(p, state.ply) : null), [p, state.ply]);
  const lastMove: [Key, Key] | undefined = view?.last ? [view.last.from as Key, view.last.to as Key] : undefined;

  const shapes = useMemo<DrawShape[]>(() => {
    const out: DrawShape[] = [];
    if (state.wrong) out.push({ orig: state.wrong[0], dest: state.wrong[1], brush: 'bad' });
    if (state.hint && t.expectedMove) out.push({ orig: t.expectedMove[0], brush: 'accent' });
    return out;
  }, [state.wrong, state.hint, t.expectedMove]);

  useKeys({
    f: () => setFlipped((v) => !v),
    h: () => t.showHint(),
    s: () => t.next(),
    n: finished ? () => t.next() : undefined,
    Enter: finished ? () => t.next() : undefined,
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
    text = state.ply <= 1 ? `Find the best move for ${solver}.` : 'Keep going: find the next move.';
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

  const filter = (
    <Section id="themes" title={`themes · level ${level}`} icon="tag" summary={theme ? themeLabel(theme) : 'all'}>
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
    <Section id="tactics" title="tactics" icon="bars" summary={`${t.session.solved} ✓`}>
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
      movable={state.phase === 'user' ? solver : null}
      lastMove={lastMove}
      shapes={shapes}
      onMove={t.onMove}
      syncKey={state.sync}
      label={`Puzzle board, ${solver} to move`}
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
        <aside className="side left" aria-label="Tactics progress and drills">
          {statsPanel}
          <DrillNav page="tactics" mode="white" counts={counts} level={level} />
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
            <span>f flip · h hint · s skip</span>
          </div>
        </main>
        <aside className="side right" aria-label="Puzzle">
          {prompt}
          {info}
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
      <Tabs tabs={['puzzle', 'themes', 'stats'] as const} value={tab} onChange={setTab} />
      {tab === 'puzzle' && info}
      {tab === 'themes' && filter}
      {tab === 'stats' && (
        <>
          {statsPanel}
          <DrillNav page="tactics" mode="white" counts={counts} level={level} />
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

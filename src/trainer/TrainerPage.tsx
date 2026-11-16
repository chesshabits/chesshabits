import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DrawShape } from 'chessground/draw';
import type { Color as CgColor, Key } from 'chessground/types';
import { Board } from '../components/Board';
import { DrillNav, HabitsPanel, MoveList, Row, Sec, Tabs, TodayPanel, type DrillCounts } from '../components/Panels';
import type { Color, LevelId } from '../data/levels';
import { openingName, shortOpeningName } from '../data/openings';
import { useKeys, useNow } from '../hooks';
import { moveLabel, replay } from './explain';
import { formatDue } from './srs';
import { candidatesAt } from './tree';
import { squaresOf, useTrainer, type Feedback } from './useTrainer';

const MAX_PLY = 12;
const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');
const TARGET_LABEL = { due: 'review', new: 'new position', free: 'practice' } as const;

function FeedbackLine({ f }: { f: Feedback }) {
  if (f.kind === 'correct') {
    return (
      <div className="feedback">
        <span className="accent">✓ </span>
        <strong>{f.played}</strong> <span className="dim">{f.text}</span>
      </div>
    );
  }
  if (f.kind === 'shown') {
    return (
      <div className="feedback">
        The repertoire move is <strong className="accent">{f.expected}</strong>. <span className="dim">{f.text}</span> Play
        it to continue.
      </div>
    );
  }
  if (f.again) {
    return (
      <div className="feedback">
        <span className="bad">✕ </span>
        <strong>{f.played}</strong> still isn't it. Play <strong className="accent">{f.expected}</strong> (the arrow) to
        continue.
      </div>
    );
  }
  if (f.kind === 'soft') {
    return (
      <div className="feedback">
        <span className="accent">≈ </span>
        Not our line. <strong>{f.played}</strong> is sound, but this level's repertoire plays{' '}
        <strong className="accent">{f.expected}</strong> ({f.games} {f.games === 1 ? 'game' : 'games'}).{' '}
        <span className="dim">{f.text}</span> Play it to continue.
      </div>
    );
  }
  return (
    <div className="feedback">
      <span className="bad">✕ </span>
      <strong>{f.played}</strong> isn't the repertoire move. Play <strong className="accent">{f.expected}</strong>.{' '}
      <span className="dim">{f.text}</span>
    </div>
  );
}

interface Props {
  level: LevelId;
  color: Color;
  desktop: boolean;
  counts: DrillCounts;
}

export function TrainerPage({ level, color, desktop, counts }: Props) {
  const t = useTrainer(level, color);
  const { run } = t;
  const now = useNow();
  const [flipped, setFlipped] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [tab, setTab] = useState<'moves' | 'replies' | 'today'>('moves');

  // A new move or a new line returns the board to the live position.
  useEffect(() => setViewPly(null), [run.line.length, run.sync]);
  useEffect(() => setFlipped(false), [color]);

  const orientation: CgColor = flipped ? other(color) : color;
  const shownPly = viewPly ?? run.line.length;
  const view = useMemo(() => replay(run.line.slice(0, shownPly)), [run.line, shownPly]);
  const lastMove: [Key, Key] | undefined = view.last ? [view.last.from as Key, view.last.to as Key] : undefined;
  const live = viewPly === null;
  const canMove = live && (run.phase === 'user' || run.phase === 'retry');

  const shapes = useMemo<DrawShape[]>(() => {
    if (!live) return [];
    const main = t.expected[0];
    const sq = main ? squaresOf(run.line, main.san) : null;
    if (run.phase === 'retry' && sq) {
      const out: DrawShape[] = [{ orig: sq[0], dest: sq[1], brush: 'accent' }];
      if (run.feedback?.wrongMove) out.unshift({ orig: run.feedback.wrongMove[0], dest: run.feedback.wrongMove[1], brush: 'bad' });
      return out;
    }
    if (run.phase === 'user' && run.hint && sq) return [{ orig: sq[0], brush: 'accent' }];
    return [];
  }, [live, run.phase, run.hint, run.line, run.feedback, t.expected]);

  const step = (d: number) => {
    const next = Math.max(0, Math.min(run.line.length, shownPly + d));
    setViewPly(next === run.line.length ? null : next);
  };

  useKeys({
    f: () => setFlipped((v) => !v),
    h: () => t.showHint(),
    s: () => t.skip(),
    n: run.phase === 'complete' ? () => t.startRun() : undefined,
    Enter: run.phase === 'complete' ? () => t.startRun() : undefined,
    ArrowLeft: () => step(-1),
    ArrowRight: () => step(1),
  });

  // Prompt text.
  const opp = other(color);
  const lastOppIndex = (() => {
    for (let i = run.line.length - 1; i >= 0; i--) if ((i % 2 === 0 ? 'white' : 'black') === opp) return i;
    return -1;
  })();
  const lastOpp = lastOppIndex >= 0 ? moveLabel(lastOppIndex, run.line[lastOppIndex]) : null;
  let promptText: ReactNode;
  if (run.phase === 'loading') promptText = 'Loading your progress…';
  else if (run.phase === 'opponent') promptText = run.line.length === 0 ? `${cap(opp)} is choosing a first move…` : `${cap(opp)} is replying…`;
  else if (run.phase === 'complete') {
    const ok = run.results.filter((r) => r === 'good' || r === 'hard').length;
    const soft = run.results.filter((r) => r === 'soft').length;
    const miss = run.results.filter((r) => r === 'again').length;
    promptText = (
      <>
        Line complete: the series games end here. {ok} ✓{soft ? ` · ${soft} ≈` : ''}
        {miss ? ` · ${miss} ✕` : ''}
      </>
    );
  } else if (run.phase === 'user') {
    promptText =
      run.line.length === 0
        ? 'You have White. Play the repertoire first move.'
        : `${cap(opp)} played ${lastOpp}. Find the repertoire move.`;
  }

  const prompt = (
    <div className="prompt" aria-live="polite">
      <div className="label">
        <span>{run.phase === 'complete' ? 'line complete' : 'your move'}</span>
        <span className="dim">{TARGET_LABEL[run.target.kind]}</span>
      </div>
      {run.feedback && (run.phase === 'retry' || run.feedback.kind === 'correct') && <FeedbackLine f={run.feedback} />}
      {promptText && run.phase !== 'retry' && <p>{promptText}</p>}
      {desktop && <PromptButtons t={t} className="btn-pair" />}
    </div>
  );

  // Opponent replies at the last opponent move ("black's replies here · series games").
  const replyLine = lastOppIndex >= 0 ? run.line.slice(0, lastOppIndex) : [];
  const replies = lastOppIndex >= 0 || color === 'black' ? candidatesAt(t.tree, replyLine) : [];
  const repliesPanel = (
    <>
      <Sec>{opp}'s replies here · series games</Sec>
      {replies.length === 0 ? (
        <div className="empty">White moves first: no replies yet.</div>
      ) : (
        replies.map((c, i) => (
          <div key={c.san} className={i === replies.length - 1 ? 'row end' : 'row'}>
            <span className={c.san === run.line[lastOppIndex] ? 'accent' : undefined}>{moveLabel(replyLine.length, c.san)}</span>
            <span className="count">{c.n}</span>
          </div>
        ))
      )}
    </>
  );

  const card = t.decisionCard;
  const historyPanel = (
    <>
      <Row
        label="this position"
        value={card ? `seen ${card.seen}× · ${card.correct} ✓` : run.decisionKey !== null ? 'new' : '—'}
      />
      <Row
        end
        label="next review"
        value={card ? formatDue(card.due, now) : run.decisionKey !== null ? 'after this' : '—'}
      />
    </>
  );

  const movesPanel = (
    <MoveList
      line={run.line}
      viewPly={viewPly}
      onView={(ply) => setViewPly(ply === run.line.length ? null : ply)}
      pending={run.phase === 'user' || run.phase === 'retry'}
      highlightLast={run.phase === 'user'}
    />
  );

  const name = shortOpeningName(openingName(run.line));
  const top = orientation === 'white' ? 'black' : 'white';
  const glyph = (c: Color) => (c === 'white' ? '♔' : '♚');
  const who = (c: Color) => (c === color ? `you · ${c}` : `${c} · series replies`);

  const board = (
    <Board
      fen={view.chess.fen()}
      orientation={orientation}
      movable={canMove ? color : null}
      lastMove={lastMove}
      shapes={shapes}
      onMove={t.onMove}
      syncKey={run.sync}
      label={`Board, ${color} to train. ${live ? '' : 'Viewing an earlier move.'}`}
    />
  );

  if (desktop) {
    return (
      <>
        <aside className="side left" aria-label="Today and drills">
          <TodayPanel stats={t.stats} />
          <DrillNav page="openings" mode={color} counts={counts} />
          <HabitsPanel level={level} />
        </aside>
        <main className="center board-area">
          <div className="board-strip">
            <span>
              {glyph(top)} {who(top)}
            </span>
            <span>
              {name} · ply {run.line.length} / {MAX_PLY}
            </span>
          </div>
          <div className="board-frame">{board}</div>
          <div className="board-strip">
            <span>
              {glyph(other(top))} {who(other(top))}
            </span>
            <span>{live ? 'f flip · h hint · s skip · ← → step' : `viewing ply ${shownPly} · → to return`}</span>
          </div>
        </main>
        <aside className="side right" aria-label="Your move">
          {prompt}
          <Sec>moves</Sec>
          {movesPanel}
          {repliesPanel}
          {historyPanel}
        </aside>
      </>
    );
  }

  return (
    <>
      <div className="m-strip">
        <span>
          {glyph(opp)} {opp} · {name}
        </span>
        <span>
          {run.line.length} / {MAX_PLY}
        </span>
      </div>
      <div className="m-board">{board}</div>
      {prompt}
      <PromptButtons t={t} className="btn-bar" />
      <Tabs tabs={['moves', 'replies', 'today'] as const} value={tab} onChange={setTab} />
      {tab === 'moves' && movesPanel}
      {tab === 'replies' && (
        <>
          {repliesPanel}
          {historyPanel}
        </>
      )}
      {tab === 'today' && (
        <>
          <TodayPanel stats={t.stats} />
          <DrillNav page="openings" mode={color} counts={counts} />
          <HabitsPanel level={level} />
        </>
      )}
    </>
  );
}

function PromptButtons({ t, className }: { t: ReturnType<typeof useTrainer>; className: string }) {
  const { run } = t;
  if (run.phase === 'complete') {
    return (
      <div className={className}>
        <button type="button" className="primary" onClick={t.startRun}>
          next line →
        </button>
      </div>
    );
  }
  const active = run.phase === 'user';
  return (
    <div className={className}>
      <button type="button" onClick={t.showHint} disabled={!active || run.hint}>
        hint
      </button>
      <button type="button" onClick={t.showMove} disabled={!active}>
        show move
      </button>
    </div>
  );
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

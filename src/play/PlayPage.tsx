import { useMemo, useState, type ReactNode } from 'react';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Board } from '../components/Board';
import { MoveList, StepButtons, useLineView } from '../components/MoveNav';
import { Row, Section } from '../components/Panels';
import { habit } from '../data/habits';
import type { Color, LevelId } from '../data/levels';
import { useKeys } from '../hooks';
import { ELO_MAX, ELO_MIN, ELO_STEP, LIMIT_STRENGTH_MIN } from './elo';
import { formatEval } from './engine';
import { coachTip, habitMarks, type Mark } from './habits';
import { TIME_PRESETS, formatClock, formatTimeControl, remaining, withClock, withTakeback, type TimeControl } from './rules';
import { replaySans, usePlay } from './usePlay';

const MARK: Record<Mark, { sym: string; cls: string; word: string }> = {
  done: { sym: '✓', cls: 'accent', word: 'done' },
  todo: { sym: '○', cls: 'dim', word: 'not yet' },
  broken: { sym: '✗', cls: 'bad', word: 'broken' },
};
const other = (c: Color): Color => (c === 'white' ? 'black' : 'white');
const glyph = (c: Color) => (c === 'white' ? '♔' : '♚');
const levelForElo = (elo: number) => (elo < 700 ? 1 : elo < 1100 ? 2 : elo < 1600 ? 3 : 4);

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** Play a full game against the bot (SPEC §9: before Phase 2). */
export function PlayPage({ level, desktop }: { level: LevelId; desktop: boolean }) {
  const p = usePlay(level);
  const { game, history } = p;
  const [flipped, setFlipped] = useState(false);
  const [coachOn, setCoachOn] = useState(true);
  const [showMe, setShowMe] = useState(false);
  const [customClock, setCustomClock] = useState<TimeControl>({ minutes: 15, incrementSec: 10 });
  const me = p.userColor === 'white' ? 'w' : 'b';
  const orientation: Color = flipped ? other(p.userColor) : p.userColor;

  const lineView = useLineView(game.sans.length, game.id);
  const live = lineView.view === null;
  const view = useMemo(() => replaySans(game.sans.slice(0, lineView.shown)), [game.sans, lineView.shown]);
  const lastMove = view.history.at(-1);
  const over = !!game.result;

  const tip = useMemo(
    () => (coachOn && live && p.userTurn && !over ? coachTip(level, history, me) : null),
    [coachOn, live, p.userTurn, over, level, history, me],
  );
  const marks = useMemo(() => habitMarks(level, history, me, over), [level, history, me, over]);
  const shapes = useMemo<DrawShape[]>(() => {
    if (!showMe || !tip?.show) return [];
    return [{ orig: tip.show.from as Key, dest: tip.show.to as Key | undefined, brush: 'accent' }];
  }, [showMe, tip]);

  useKeys({
    ArrowLeft: () => lineView.step(-1),
    ArrowRight: () => lineView.step(1),
    Home: lineView.first,
    End: lineView.last,
    f: () => setFlipped((v) => !v),
    u: p.canTakeback ? p.takeback : undefined,
  });

  const clocks = game.clock ? remaining(game.clock, p.now) : null;
  const clockFor = (c: Color) =>
    clocks ? (
      <span className={game.clock?.running === c ? 'clock running' : 'clock'} aria-label={`${c} clock`}>
        {formatClock(clocks[c])}
      </span>
    ) : null;

  const status = over
    ? `${game.result!.outcome === 'win' ? 'you won' : game.result!.outcome === 'loss' ? 'you lost' : 'draw'} · ${game.result!.reason}`
    : game.thinking
      ? 'bot is thinking…'
      : p.userTurn
        ? 'your move'
        : '';
  const moveNo = Math.floor(game.sans.length / 2) + 1;
  const bookTag = game.inBook ? 'in book · series games' : `stockfish · ~${p.elo}`;

  const board = (
    <Board
      fen={view.chess.fen()}
      orientation={orientation}
      movable={live && p.userTurn && !over && !game.thinking ? p.userColor : null}
      lastMove={lastMove ? [lastMove.from as Key, lastMove.to as Key] : undefined}
      shapes={shapes}
      onMove={(from, to) => {
        setShowMe(false);
        p.onMove(from, to);
      }}
      syncKey={game.sans.length + game.takebacks * 1000}
      label={`Game against the bot, you play ${p.userColor}`}
    />
  );

  const coachCard = over ? (
    <div className="coach" aria-live="polite">
      <div className="label accent">game over</div>
      <p>
        {game.result!.result} · {game.result!.reason}.{' '}
        {game.result!.outcome === 'loss' ? 'You played it out: that is the habit.' : 'Saved for review.'}
      </p>
      <div className="btn-pair">
        <button type="button" className="primary" onClick={() => p.newGame()}>
          new game
        </button>
        <button type="button" onClick={() => p.newGame(other(p.userColor))}>
          play {other(p.userColor)}
        </button>
      </div>
    </div>
  ) : coachOn ? (
    <div className="coach" aria-live="polite">
      <div className="label accent">coach · {tip ? habit(tip.habit).label : 'all good'}</div>
      <p>{tip ? tip.text : p.userTurn ? 'Nothing urgent. Keep following your habits.' : 'Waiting for the bot…'}</p>
      <div className="btn-pair">
        <button type="button" onClick={() => setShowMe((v) => !v)} disabled={!tip?.show} aria-pressed={showMe}>
          show me
        </button>
        <button type="button" onClick={() => setCoachOn(false)}>
          hide coach
        </button>
      </div>
    </div>
  ) : (
    <button type="button" className="coach-off" onClick={() => setCoachOn(true)}>
      show coach
    </button>
  );

  const clockSelect = (
    <select
      className="select"
      aria-label="Clock"
      value={p.options.clock ? (TIME_PRESETS.some((t) => formatTimeControl(t) === formatTimeControl(p.options.clock)) ? formatTimeControl(p.options.clock) : 'custom') : 'off'}
      onChange={(e) => {
        const v = e.target.value;
        const tc = v === 'off' ? null : v === 'custom' ? customClock : TIME_PRESETS.find((t) => formatTimeControl(t) === v)!;
        p.setOptions(withClock(p.options, tc));
      }}
    >
      <option value="off">off</option>
      {TIME_PRESETS.map((t) => (
        <option key={formatTimeControl(t)} value={formatTimeControl(t)}>
          {formatTimeControl(t)}
        </option>
      ))}
      <option value="custom">custom…</option>
    </select>
  );

  const customRow = p.options.clock && !TIME_PRESETS.some((t) => formatTimeControl(t) === formatTimeControl(p.options.clock)) && (
    <div className="row">
      <span className="dim">custom</span>
      <span className="custom-clock">
        <input
          type="number"
          min={1}
          max={180}
          aria-label="Minutes"
          value={customClock.minutes}
          onChange={(e) => {
            const tc = { ...customClock, minutes: Math.max(1, Math.min(180, Number(e.target.value) || 1)) };
            setCustomClock(tc);
            p.setOptions(withClock(p.options, tc));
          }}
        />
        +
        <input
          type="number"
          min={0}
          max={60}
          aria-label="Increment in seconds"
          value={customClock.incrementSec}
          onChange={(e) => {
            const tc = { ...customClock, incrementSec: Math.max(0, Math.min(60, Number(e.target.value) || 0)) };
            setCustomClock(tc);
            p.setOptions(withClock(p.options, tc));
          }}
        />
      </span>
    </div>
  );

  const eloSelect = (
    <select className="select" aria-label="Bot strength" value={p.elo} onChange={(e) => p.setElo(Number(e.target.value))}>
      {Array.from({ length: (ELO_MAX - ELO_MIN) / ELO_STEP + 1 }, (_, i) => ELO_MIN + i * ELO_STEP).map((e) => (
        <option key={e} value={e}>
          level {levelForElo(e)} · ~{e}
        </option>
      ))}
    </select>
  );

  const gameSection = (
    <Section id="play-game" title="game" icon="grid" summary={`move ${moveNo}`}>
      <Row label="move" value={moveNo} />
      <Row label="you" value={p.userColor} />
      <div className="row">
        <span className="dim">bot</span>
        {eloSelect}
      </div>
      <div className="row">
        <span className="dim">clock</span>
        {clockSelect}
      </div>
      {customRow}
      <div className="row">
        <span className="dim">takeback</span>
        <Switch on={p.canTakeback} onChange={(v) => p.setOptions(withTakeback(p.options, v))} label="Allow takebacks" />
      </div>
      <p className="note">Bot strength applies right away; a new clock starts with the next game.</p>
      <div className="btn-bar">
        <button type="button" className="primary" onClick={() => p.newGame()}>
          new game
        </button>
        <button type="button" onClick={() => p.newGame(other(p.userColor))}>
          play {other(p.userColor)}
        </button>
      </div>
    </Section>
  );

  const markIds = Object.keys(marks);
  const count = (m: Mark) => markIds.filter((id) => marks[id] === m).length;
  const habitsSection = (
    <Section
      id="play-habits"
      title={`level ${level} habits`}
      icon="checklist"
      summary={`✓ ${count('done')} · ○ ${count('todo')}${count('broken') ? ` · ✗ ${count('broken')}` : ''}`}
    >
      {markIds.map((id) => (
        <div key={id} className="row">
          <span>{habit(id).label}</span>
          <span className={MARK[marks[id]].cls} aria-label={MARK[marks[id]].word}>
            {MARK[marks[id]].sym}
          </span>
        </div>
      ))}
    </Section>
  );

  const movesSection = (
    <Section id="play-moves" title="moves" icon="list" summary={`ply ${game.sans.length}`}>
      <MoveList line={game.sans} view={lineView.view} onView={lineView.setView} pending={p.userTurn && !over} />
      <StepButtons view={lineView} length={game.sans.length} />
    </Section>
  );

  const botSection = (
    <Section id="play-bot" title="bot" icon="reply" summary={game.inBook ? 'in book' : `~${p.elo}`}>
      <Row label="in book" value={game.inBook ? 'yes · series games' : 'no'} />
      <Row
        label="last reply"
        value={game.last ? `${game.last.label}${game.last.book ? ` · ${game.last.book.n} of ${game.last.book.total} games` : ''}` : '—'}
      />
      <Row label="after book" value={`stockfish · ~${p.elo}${p.elo < LIMIT_STRENGTH_MIN ? ' (weakened)' : ''}`} />
      <div className="row">
        <span className="dim">engine eval</span>
        <Switch on={p.evalOn} onChange={p.setEvalOn} label="Show engine evaluation" />
      </div>
      {p.evalOn && <Row label="eval (white)" value={formatEval(p.evalCp)} />}
    </Section>
  );

  const topSide = other(orientation);
  const strip = (c: Color, extra: ReactNode) => (
    <div className="board-strip">
      <span>
        {glyph(c)} {c === p.userColor ? `you · ${c}` : `bot · level ${levelForElo(p.elo)}`}
        {extra}
      </span>
      {clockFor(c)}
    </div>
  );
  const sideExtra = (c: Color) =>
    c === p.userColor ? (
      <span className="dim"> · {status}</span>
    ) : (
      <span className={game.inBook ? 'tag accent' : 'tag'}> · {bookTag}</span>
    );

  if (desktop) {
    return (
      <>
        <aside className="side left" aria-label="Game and habits">
          {gameSection}
          {habitsSection}
        </aside>
        <main className="center board-area play">
          {strip(topSide, sideExtra(topSide))}
          <div className="board-frame">{board}</div>
          {strip(orientation, sideExtra(orientation))}
          <div className="board-strip">
            <span>{live ? `← → step · f flip${p.canTakeback ? ' · u undo' : ''}` : 'earlier move · → to return'}</span>
            <span>drag or click</span>
          </div>
          <div className="coach-wrap">{coachCard}</div>
        </main>
        <aside className="side right" aria-label="Moves and bot">
          {movesSection}
          {botSection}
        </aside>
      </>
    );
  }

  const icon = (d: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
      <path d={d} />
    </svg>
  );
  return (
    <>
      <div className="m-strip">
        <span>
          {glyph(topSide)} {topSide === p.userColor ? `you · ${status}` : `bot · ${bookTag}`}
        </span>
        {clockFor(topSide)}
      </div>
      <div className="m-board">{board}</div>
      <div className="m-strip">
        <span>
          {glyph(orientation)} {orientation === p.userColor ? `you · ${status}` : `bot · ${bookTag}`}
        </span>
        {clockFor(orientation)}
      </div>
      {coachCard}
      <div className="toolbar" role="toolbar" aria-label="Game controls">
        <button type="button" aria-label="Previous move" onClick={() => lineView.step(-1)}>
          {icon('M15 5l-7 7 7 7')}
        </button>
        <button type="button" aria-label="Next move" onClick={() => lineView.step(1)}>
          {icon('M9 5l7 7-7 7')}
        </button>
        <button type="button" aria-label="Flip board" onClick={() => setFlipped((v) => !v)}>
          {icon('M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3')}
        </button>
        <button type="button" aria-label="Take back" onClick={p.takeback} disabled={!p.canTakeback || game.thinking}>
          {icon('M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3')}
        </button>
        <button type="button" aria-label="New game" onClick={() => p.newGame()}>
          {icon('M12 5v14M5 12h14')}
        </button>
      </div>
      {movesSection}
      {habitsSection}
      {gameSection}
      {botSection}
    </>
  );
}

export default PlayPage;

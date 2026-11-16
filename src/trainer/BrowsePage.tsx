import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Key } from 'chessground/types';
import { Board } from '../components/Board';
import { DrillNav, HabitsPanel, MoveList, Row, Section, Tabs, type DrillCounts } from '../components/Panels';
import { showsOpeningNames } from '../data/habits';
import { getTree, type Color, type LevelId } from '../data/levels';
import { openingName, shortOpeningName } from '../data/openings';
import { useKeys } from '../hooks';
import { moveLabel, replay } from './explain';
import { decisionPositions } from './session';
import { candidatesAt, sideToMove } from './tree';
import { squaresOf } from './useTrainer';

interface Props {
  level: LevelId;
  desktop: boolean;
  counts: DrillCounts;
}

/** "Browse lines" (SPEC §5.1): walk the level's tree with game counts. */
export function BrowsePage({ level, desktop, counts }: Props) {
  const [color, setColor] = useState<Color>('white');
  const [line, setLine] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState<'moves here' | 'line' | 'drill'>('moves here');
  const tree = getTree(level, color);

  useEffect(() => setLine([]), [level, color]);

  const candidates = useMemo(() => candidatesAt(tree, line), [tree, line]);
  const total = candidates.reduce((s, c) => s + c.n, 0);
  const toMove = sideToMove(line);
  const yours = toMove === color;
  const view = useMemo(() => replay(line), [line]);
  const lastMove: [Key, Key] | undefined = view.last ? [view.last.from as Key, view.last.to as Key] : undefined;
  const orientation = flipped ? (color === 'white' ? 'black' : 'white') : color;

  const allowed = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates) {
      const sq = squaresOf(line, c.san);
      if (sq) set.add(`${sq[0]}${sq[1]}`);
    }
    return set;
  }, [candidates, line]);
  const filterDests = useCallback((from: Key, to: Key) => allowed.has(`${from}${to}`), [allowed]);

  const play = (san: string) => setLine((l) => [...l, san]);
  const onMove = (from: Key, to: Key) => {
    const c = candidates.find((c) => {
      const sq = squaresOf(line, c.san);
      return sq && sq[0] === from && sq[1] === to;
    });
    if (c) play(c.san);
  };

  useKeys({
    f: () => setFlipped((v) => !v),
    ArrowLeft: () => setLine((l) => l.slice(0, -1)),
    ArrowRight: () => candidates[0] && play(candidates[0].san),
    Home: () => setLine([]),
  });

  const shapes = useMemo(
    () =>
      candidates
        .map((c, i) => {
          const sq = squaresOf(line, c.san);
          return sq ? { orig: sq[0], dest: sq[1], brush: i === 0 ? 'accent' : 'dim' } : null;
        })
        .filter((s) => s !== null),
    [candidates, line],
  );

  const positions = useMemo(() => decisionPositions(tree, color).length, [tree, color]);

  const colorSwitch = (
    <div className="btn-pair" role="group" aria-label="Repertoire color">
      {(['white', 'black'] as const).map((c) => (
        <button key={c} type="button" className={c === color ? 'primary' : undefined} aria-pressed={c === color} onClick={() => setColor(c)}>
          {c}
        </button>
      ))}
    </div>
  );

  const header = (
    <div className="prompt">
      <div className="label">
        <span>browse lines</span>
        <span className="dim">level {level}</span>
      </div>
      <p>
        {candidates.length === 0
          ? 'The series games end here. Step back with ← or pick an earlier move.'
          : yours
            ? 'Your repertoire move here. Click a move, or play it on the board.'
            : `${toMove === 'white' ? 'White' : 'Black'}'s replies in the series games, by frequency.`}
      </p>
      {colorSwitch}
    </div>
  );

  const movesHere = (
    <Section
      id="browse-moves"
      title={yours ? 'your move here' : `${toMove}'s replies`}
      icon={yours ? 'target' : 'reply'}
      summary={`${total} games`}
    >
      {candidates.length === 0 ? (
        <div className="empty">End of the tree.</div>
      ) : (
        candidates.map((c) => (
          <button key={c.san} type="button" className="row" onClick={() => play(c.san)}>
            <span className={yours ? 'accent' : 'fg'}>
              {moveLabel(line.length, c.san)}
            </span>
            <span className="count">
              {c.n} · {Math.round((c.n / total) * 100)}%
            </span>
          </button>
        ))
      )}
    </Section>
  );

  const lineList = (
    <Section id="line" title="line" icon="list" summary={`ply ${line.length}`}>
      <MoveList line={line} viewPly={null} onView={(ply) => setLine((l) => l.slice(0, ply))} />
      <div className="btn-bar">
        <button type="button" onClick={() => setLine((l) => l.slice(0, -1))} disabled={line.length === 0}>
          ← back
        </button>
        <button type="button" onClick={() => setLine([])} disabled={line.length === 0}>
          start
        </button>
      </div>
    </Section>
  );

  // Opening names only from Level 3 (SPEC §7.1).
  const name = showsOpeningNames(level) ? shortOpeningName(openingName(line)) : null;
  const board = (
    <Board
      fen={view.chess.fen()}
      orientation={orientation}
      movable={candidates.length ? toMove : null}
      filterDests={filterDests}
      lastMove={lastMove}
      shapes={shapes}
      onMove={onMove}
      label={`Repertoire tree, ${color}, level ${level}`}
    />
  );

  if (desktop) {
    return (
      <>
        <aside className="side left" aria-label="Drills">
          <Section id="tree" title="tree" icon="branch" summary={`${tree.games} games`}>
            <Row label="series games" value={tree.games} />
            <Row label="positions to learn" value={positions} />
          </Section>
          <DrillNav page="repertoire" mode="browse" counts={counts} level={level} />
          <HabitsPanel level={level} />
        </aside>
        <main className="center board-area">
          <div className="board-strip">
            <span>{color} repertoire</span>
            <span>
              {name ? `${name} · ` : ''}ply {line.length}
            </span>
          </div>
          <div className="board-frame">{board}</div>
          <div className="board-strip">
            <span>{candidates.length} {candidates.length === 1 ? 'move' : 'moves'} here</span>
            <span>f flip · ← back · → main line</span>
          </div>
        </main>
        <aside className="side right" aria-label="Moves">
          {header}
          {movesHere}
          {lineList}
        </aside>
      </>
    );
  }

  return (
    <>
      <div className="m-strip">
        <span>
          {color}
          {name ? ` · ${name}` : ''}
        </span>
        <span>ply {line.length}</span>
      </div>
      <div className="m-board">{board}</div>
      {header}
      <Tabs tabs={['moves here', 'line', 'drill'] as const} value={tab} onChange={setTab} />
      {tab === 'moves here' && movesHere}
      {tab === 'line' && lineList}
      {tab === 'drill' && (
        <>
          <DrillNav page="repertoire" mode="browse" counts={counts} level={level} />
          <HabitsPanel level={level} />
        </>
      )}
    </>
  );
}

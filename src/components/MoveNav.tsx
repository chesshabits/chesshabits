import { useCallback, useEffect, useState } from 'react';

/**
 * Which ply of a line the board shows. `view` is null while following the live end of the line;
 * stepping back sets it, and it returns to null when it reaches the end again. It also resets
 * whenever `resetKey` changes (a new move, a new puzzle).
 */
export function useLineView(length: number, resetKey: unknown) {
  const [view, setViewState] = useState<number | null>(null);
  useEffect(() => setViewState(null), [length, resetKey]);
  const setView = useCallback(
    (ply: number | null) => setViewState(ply === null || ply >= length ? null : Math.max(0, ply)),
    [length],
  );
  const shown = view ?? length;
  return {
    view,
    shown,
    setView,
    step: (d: number) => setView(shown + d),
    first: () => setView(0),
    last: () => setView(null),
  };
}

/** Play `move` from the viewed ply: moves after it are dropped (a new branch). */
export function branch<T>(line: readonly T[], view: number | null, move: T): T[] {
  return [...line.slice(0, view ?? line.length), move];
}

/** "3." / "3..." numbering from an absolute ply (0 = White's first move). */
export function moveLabel(absPly: number, san: string): string {
  const num = Math.floor(absPly / 2) + 1;
  return absPly % 2 === 0 ? `${num}.${san}` : `${num}...${san}`;
}

interface MoveListProps {
  /** SAN moves of the line. */
  line: readonly string[];
  /** Absolute ply of line[0] (0 = White's first move; puzzles start mid-game). */
  firstPly?: number;
  /** The ply shown on the board (count of moves applied), or null for the live end. */
  view: number | null;
  onView?: (ply: number) => void;
  /** Show an empty slot for the move the user is about to play. */
  pending?: boolean;
  /** Color the latest move (the one the user is answering). */
  highlightLast?: boolean;
  /** Moves from this index on are dimmed (e.g. free play after a puzzle). */
  extraFrom?: number;
}

/** Two-column move list; clicking a move shows the position after it. */
export function MoveList({ line, firstPly = 0, view, onView, pending, highlightLast, extraFrom }: MoveListProps) {
  type Row = { num: number; white?: number; black?: number };
  const rows: Row[] = [];
  const total = line.length + (pending ? 1 : 0);
  for (let i = 0; i < total; i++) {
    const abs = firstPly + i;
    const num = Math.floor(abs / 2) + 1;
    if (abs % 2 === 0 || rows.length === 0) rows.push({ num });
    rows[rows.length - 1][abs % 2 === 0 ? 'white' : 'black'] = i;
  }
  const shown = view ?? line.length;

  const cell = (i: number | undefined, isWhiteCell: boolean, rowIndex: number) => {
    if (i === undefined) {
      // A line that starts with Black's move: the first row's White cell is "…".
      return rowIndex === 0 && isWhiteCell && firstPly % 2 === 1 ? <span className="dim">…</span> : <span />;
    }
    if (i >= line.length) return <span className="dim">_</span>;
    const san = line[i];
    const cls = [
      highlightLast && i === line.length - 1 ? 'accent' : '',
      extraFrom !== undefined && i >= extraFrom ? 'dim' : '',
    ]
      .join(' ')
      .trim();
    return (
      <button
        type="button"
        aria-current={view !== null && shown === i + 1 ? 'true' : undefined}
        aria-label={`Show position after ${moveLabel(firstPly + i, san)}`}
        className={cls || undefined}
        onClick={() => onView?.(i + 1)}
      >
        {san}
      </button>
    );
  };

  if (rows.length === 0) return <div className="empty">No moves yet.</div>;

  return (
    <div>
      {rows.map((r, idx) => {
        const hasPending = pending && (r.white === line.length || r.black === line.length);
        return (
          <div key={r.num} className={hasPending ? 'moves-grid current' : 'moves-grid'}>
            <span className="dim">{r.num}.</span>
            {cell(r.white, true, idx)}
            {cell(r.black, false, idx)}
          </div>
        );
      })}
    </div>
  );
}

const NAV_ICONS = {
  first: 'M6 5v14M18 5l-9 7 9 7z',
  prev: 'M16 5l-9 7 9 7z',
  next: 'M8 5l9 7-9 7z',
  last: 'M18 5v14M6 5l9 7-9 7z',
};

/** First / previous / next / last buttons for a line view. */
export function StepButtons({
  view,
  length,
}: {
  view: ReturnType<typeof useLineView>;
  length: number;
}) {
  const btn = (key: keyof typeof NAV_ICONS, label: string, onClick: () => void, disabled: boolean) => (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={NAV_ICONS[key]} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </button>
  );
  const atStart = view.shown === 0;
  const atEnd = view.view === null;
  return (
    <div className="btn-bar step-bar" role="group" aria-label="Step through moves">
      {btn('first', 'First move', view.first, atStart || length === 0)}
      {btn('prev', 'Previous move (←)', () => view.step(-1), atStart || length === 0)}
      {btn('next', 'Next move (→)', () => view.step(1), atEnd)}
      {btn('last', 'Latest move', view.last, atEnd)}
    </div>
  );
}

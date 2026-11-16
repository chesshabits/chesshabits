import type { ReactNode } from 'react';
import { habit, levelConfig } from '../data/habits';
import type { LevelId } from '../data/levels';
import { routeHref, type OpeningsMode, type Page } from '../hooks';
import { moveLabel } from '../trainer/explain';

export function Sec({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return <div className={accent ? 'sec accent' : 'sec'}>{children}</div>;
}

export function Row({ label, value, end, dimLabel = true }: { label: ReactNode; value: ReactNode; end?: boolean; dimLabel?: boolean }) {
  return (
    <div className={end ? 'row end' : 'row'}>
      <span className={dimLabel ? 'dim' : undefined}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ProgressRow({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-row">
      <div className="top">
        <span className="dim">{label}</span>
        <span>
          {done} / {total}
        </span>
      </div>
      <div className="bar" role="img" aria-label={`${done} of ${total} done today`}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export interface TodayNumbers {
  due: number;
  fresh: number;
  done: number;
}

export function TodayPanel({ stats, title = 'today' }: { stats: TodayNumbers | null; title?: string }) {
  const s = stats ?? { due: 0, fresh: 0, done: 0 };
  return (
    <>
      <Sec>{title}</Sec>
      <Row label="due" value={stats ? s.due : '…'} />
      <Row label="new" value={stats ? s.fresh : '…'} />
      <ProgressRow label="done" done={s.done} total={s.done + s.due + s.fresh} />
    </>
  );
}

export interface DrillCounts {
  white: number;
  black: number;
  tactics: number | null;
}

export function DrillNav({
  page,
  mode,
  counts,
}: {
  page: Page;
  mode: OpeningsMode;
  counts: DrillCounts;
}) {
  const item = (href: string, label: string, count: ReactNode, active: boolean, end = false) => (
    <a href={href} className={end ? 'row end' : 'row'} aria-current={active ? 'page' : undefined}>
      <span>{label}</span>
      <span className="count">{count}</span>
    </a>
  );
  return (
    <>
      <Sec>drill</Sec>
      {item(routeHref('openings', 'white'), 'repertoire · white', counts.white, page === 'openings' && mode === 'white')}
      {item(routeHref('openings', 'black'), 'repertoire · black', counts.black, page === 'openings' && mode === 'black')}
      {item(routeHref('tactics'), 'opening tactics', counts.tactics ?? '…', page === 'tactics')}
      {item(routeHref('openings', 'browse'), 'browse lines', '→', page === 'openings' && mode === 'browse', true)}
    </>
  );
}

/** The level's habits, restrictions and extra knowledge (data/levels/level-N.json). */
export function HabitsPanel({ level }: { level: LevelId }) {
  const config = levelConfig(level);
  const groups = config.habits;
  const restriction = config.restrictions;
  return (
    <>
      <Sec>level {level} habits</Sec>
      {groups.map((ids, i) => {
        const last = i === groups.length - 1 && restriction.length === 0 && config.extraKnowledge.length === 0;
        return (
          <details key={ids.join('+')} className={last ? 'habit end' : 'habit'}>
            <summary>{ids.map((id) => habit(id).label).join(' + ')}</summary>
            {ids.map((id) => (
              <p key={id}>{habit(id).guidance}</p>
            ))}
          </details>
        );
      })}
      {restriction.length > 0 && (
        <details className={config.extraKnowledge.length ? 'habit restriction' : 'habit restriction end'}>
          <summary>{restriction.map((id) => habit(id).label).join(' · ')}</summary>
          {restriction.map((id) => (
            <p key={id}>
              <span className="dim">{habit(id).label}: </span>
              {habit(id).guidance}
            </p>
          ))}
        </details>
      )}
      {config.extraKnowledge.length > 0 && (
        <>
          <Sec>extra knowledge</Sec>
          {config.extraKnowledge.map((id, i) => (
            <details key={id} className={i === config.extraKnowledge.length - 1 ? 'habit end' : 'habit'}>
              <summary>{habit(id).label}</summary>
              <p>{habit(id).guidance}</p>
            </details>
          ))}
        </>
      )}
    </>
  );
}

/**
 * Two-column move list. `viewPly` is the ply shown on the board (null = latest);
 * clicking a move shows the position after it.
 */
export function MoveList({
  line,
  viewPly,
  onView,
  pending,
  highlightLast,
}: {
  line: readonly string[];
  viewPly: number | null;
  onView?: (ply: number) => void;
  /** Show an empty row for the move the user is about to play. */
  pending?: boolean;
  /** Color the latest move (the one the user is answering). */
  highlightLast?: boolean;
}) {
  const rows: { num: number; white?: number; black?: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    const num = Math.floor(i / 2) + 1;
    if (i % 2 === 0) rows.push({ num, white: i });
    else rows[rows.length - 1].black = i;
  }
  const nextPly = line.length;
  const pendingRow = pending ? Math.floor(nextPly / 2) + 1 : null;
  const showPendingRow = pending && nextPly % 2 === 0;
  const shown = viewPly ?? line.length;

  const cell = (ply: number | undefined) => {
    if (ply === undefined) return <span />;
    const san = line[ply];
    const isLast = ply === line.length - 1;
    return (
      <button
        type="button"
        aria-current={viewPly !== null && shown === ply + 1 ? 'true' : undefined}
        aria-label={`Show position after ${moveLabel(ply, san)}`}
        className={highlightLast && isLast ? 'accent' : undefined}
        onClick={() => onView?.(ply + 1)}
      >
        {san}
      </button>
    );
  };

  if (rows.length === 0 && !pending) {
    return <div className="empty">No moves yet.</div>;
  }

  return (
    <div>
      {rows.map((r, i) => {
        const isPendingHere = pending && !showPendingRow && i === rows.length - 1;
        const isLastRow = i === rows.length - 1 && !showPendingRow;
        return (
          <div
            key={r.num}
            className={['moves-grid', isLastRow ? 'end' : '', isPendingHere ? 'current' : ''].join(' ').trim()}
          >
            <span className="dim">{r.num}.</span>
            {cell(r.white)}
            {isPendingHere ? <span className="dim">_</span> : cell(r.black)}
          </div>
        );
      })}
      {showPendingRow && (
        <div className="moves-grid end current">
          <span className="dim">{pendingRow}.</span>
          <span className="dim">_</span>
          <span />
        </div>
      )}
    </div>
  );
}

/** Mobile panel tabs. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="m-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t} type="button" role="tab" aria-selected={t === value} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

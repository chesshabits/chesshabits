import { useCallback, useId, useState, type ReactNode } from 'react';
import { habit, levelConfig } from '../data/habits';
import type { LevelId } from '../data/levels';
import { routeHref, type OpeningsMode, type Page } from '../hooks';
import { loadSections, saveSections } from '../storage';

/** Plain (non-collapsible) section label, e.g. inside the level picker. */
export function Sec({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return <div className={accent ? 'sec accent' : 'sec'}>{children}</div>;
}

const ICONS = {
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  target: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  checklist: 'M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M12 20h8M4 20h4',
  list: 'M4 6h16M4 12h16M4 18h10',
  reply: 'M6 4v8a4 4 0 0 0 4 4h8M14 12l4 4-4 4',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 8v4l3 2',
  bars: 'M5 20V10M12 20V4M19 20v-7',
  tag: 'M4 4h8l8 8-8 8-8-8zM8 8h.01',
  grid: 'M4 4h16v16H4zM4 12h16M12 4v16',
  branch: 'M6 4v16M6 12h6a4 4 0 0 0 4-4V4M16 20v-4',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  repeat: 'M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4',
} as const;

export type IconName = keyof typeof ICONS;

/** Open/closed state of every collapsible section, saved per browser. */
const sectionState = loadSections();

function useSectionOpen(id: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => sectionState[id] !== false);
  const toggle = useCallback(() => {
    setOpen((o) => {
      sectionState[id] = !o;
      saveSections(sectionState);
      return !o;
    });
  }, [id]);
  return [open, toggle];
}

/**
 * A collapsible sidebar section: a 44px header band (chevron, accent icon, title, summary)
 * over child rows set in from a vertical guide line. Expand/collapse is animated.
 */
export function Section({
  id,
  title,
  icon,
  summary,
  children,
}: {
  id: string;
  title: ReactNode;
  icon: IconName;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, toggle] = useSectionOpen(id);
  const bodyId = useId();
  return (
    <section className="group" data-open={open}>
      <button type="button" className="group-head" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
        <svg className="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
          <path d={ICONS[icon]} />
        </svg>
        <span className="group-title">{title}</span>
        {summary !== undefined && summary !== null && <span className="group-sum">{summary}</span>}
      </button>
      <div className="group-body" id={bodyId} inert={!open}>
        <div className="group-clip">
          <div className="group-guide">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function Row({ label, value, dimLabel = true }: { label: ReactNode; value: ReactNode; end?: boolean; dimLabel?: boolean }) {
  return (
    <div className="row">
      <span className={dimLabel ? 'dim' : undefined}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ProgressRow({ label, done, total, what = 'done today' }: { label: string; done: number; total: number; what?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-row">
      <div className="top">
        <span className="dim">{label}</span>
        <span>
          {done} / {total}
        </span>
      </div>
      <div className="bar" role="img" aria-label={`${done} of ${total} ${what}`}>
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

/** Spaced-repetition levels (L3–L4): today's due / new / done. */
export function TodayPanel({ stats }: { stats: TodayNumbers | null }) {
  const s = stats ?? { due: 0, fresh: 0, done: 0 };
  const total = s.done + s.due + s.fresh;
  return (
    <Section id="today" title="today" icon="calendar" summary={stats ? `${s.done} / ${total}` : '…'}>
      <Row label="due" value={stats ? s.due : '…'} />
      <Row label="new" value={stats ? s.fresh : '…'} />
      <ProgressRow label="done" done={s.done} total={total} />
    </Section>
  );
}

export interface PracticeNumbers {
  played: number;
  correct: number;
  retry: number;
  covered: number;
  total: number;
}

/** Practice levels (L1–L2): this session's numbers, no schedule. */
export function PracticePanel({ stats }: { stats: PracticeNumbers }) {
  return (
    <Section id="practice" title="practice" icon="repeat" summary={`${stats.correct} / ${stats.played} ✓`}>
      <Row label="played" value={stats.played} />
      <Row label="correct" value={stats.correct} />
      <Row label="misses to retry" value={stats.retry} />
      <ProgressRow label="covered" done={stats.covered} total={stats.total} what="positions played this session" />
    </Section>
  );
}

export interface DeckCounts {
  white: number;
  black: number;
}

/** The repertoire trainer's views: white, black, browse lines (under the "play" or "openings" tab). */
export function RepertoireNav({
  page,
  mode,
  counts,
}: {
  page: Page;
  mode: OpeningsMode;
  counts: DeckCounts;
}) {
  const item = (m: OpeningsMode, label: string, count: ReactNode) => (
    <a href={routeHref(page, m)} className="row" aria-current={mode === m ? 'page' : undefined}>
      <span>{label}</span>
      <span className="count">{count}</span>
    </a>
  );
  return (
    <Section id="repertoire" title="repertoire" icon="target" summary={counts.white + counts.black}>
      {item('white', 'as white', counts.white)}
      {item('black', 'as black', counts.black)}
      {item('browse', 'browse lines', '→')}
    </Section>
  );
}

/** "▶ ep 4 · 14:39": where the series explains a habit, opening in a new tab. */
function VideoLink({ id }: { id: string }) {
  const v = habit(id).video;
  if (!v) return null;
  return (
    <a
      className="video-link"
      href={v.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch ${habit(id).label} in the series, ${v.episode} at ${v.at}`}
    >
      ▶ {v.episode} · {v.at}
    </a>
  );
}

/** The level's habits, restrictions and extra knowledge (data/levels/level-N.json). */
export function HabitsPanel({ level }: { level: LevelId }) {
  const config = levelConfig(level);
  const groups = config.habits;
  const restriction = config.restrictions;
  return (
    <>
      <Section id="habits" title={`level ${level} habits`} icon="checklist" summary={groups.length}>
        {groups.map((ids) => (
          <details key={ids.join('+')} className="habit">
            <summary>{ids.map((id) => habit(id).label).join(' + ')}</summary>
            {ids.map((id) => (
              <p key={id}>
                {ids.length > 1 && <span className="dim">{habit(id).label}: </span>}
                {habit(id).guidance} <VideoLink id={id} />
              </p>
            ))}
          </details>
        ))}
        {restriction.length > 0 && (
          <details className="habit restriction">
            <summary>{restriction.map((id) => habit(id).label).join(' · ')}</summary>
            {restriction.map((id) => (
              <p key={id}>
                <span className="dim">{habit(id).label}: </span>
                {habit(id).guidance}
              </p>
            ))}
          </details>
        )}
      </Section>
      {config.extraKnowledge.length > 0 && (
        <Section id="extra" title="extra knowledge" icon="book" summary={config.extraKnowledge.length}>
          {config.extraKnowledge.map((id) => (
            <details key={id} className="habit">
              <summary>{habit(id).label}</summary>
              <p>
                {habit(id).guidance} <VideoLink id={id} />
              </p>
            </details>
          ))}
        </Section>
      )}
    </>
  );
}

/** Mobile panel tabs. */
export function Tabs<T extends string>({
  tabs,
  labels,
  value,
  onChange,
}: {
  tabs: readonly T[];
  labels?: Partial<Record<T, string>>;
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="m-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t} type="button" role="tab" aria-selected={t === value} onClick={() => onChange(t)}>
          {labels?.[t] ?? t}
        </button>
      ))}
    </div>
  );
}

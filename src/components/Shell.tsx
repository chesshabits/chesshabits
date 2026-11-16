import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SERIES_URL, SUPPORT_URL } from '../config';
import { LEVELS, formatRatingRange, type LevelId } from '../data/levels';
import { routeHref, type Page } from '../hooks';
import { ThemeToggle } from './theme';

const PAGES: Page[] = ['repertoire', 'tactics', 'review', 'about'];

// Placeholders until the URLs exist (SPEC §11): both fall back to the About page.
const seriesHref = SERIES_URL ?? '#/about';
const supportHref = SUPPORT_URL ?? '#/about';
const external = (url: string | null) => (url ? { target: '_blank', rel: 'noopener noreferrer' } : {});

function Logo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
      <path d="M4 4h16v16H4z" />
      <path d="M4 12h16M12 4v16" />
    </svg>
  );
}

function Brand() {
  return (
    <a href={routeHref('repertoire')} className="brand" aria-label="chesshabits.io, home">
      <Logo />
      chesshabits.io
    </a>
  );
}

interface ShellProps {
  page: Page;
  level: LevelId | null;
  onLevel: (level: LevelId) => void;
  children: ReactNode;
}

export function DesktopShell({ page, level, onLevel, children }: ShellProps) {
  return (
    <div className="shell">
      <header className="header">
        <Brand />
        <nav className="nav" aria-label="Main">
          {PAGES.map((p) => (
            <a key={p} href={routeHref(p)} aria-current={p === page ? 'page' : undefined}>
              {p}
            </a>
          ))}
        </nav>
        <div className="cluster">
          <div role="group" aria-label="Level" style={{ display: 'flex' }}>
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                className="level-btn"
                aria-pressed={level === l.id}
                title={`Level ${l.id} · ${formatRatingRange(l)}`}
                onClick={() => onLevel(l.id)}
              >
                L{l.id}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </header>
      <div className="body">{children}</div>
      <footer className="footer">
        <a className="series" href={seriesHref} {...external(SERIES_URL)}>
          built around the building habits youtube series ↗
        </a>
        <a className="support" href={supportHref} {...external(SUPPORT_URL)}>
          <span>support the site</span>
          <span aria-hidden="true">♥</span>
        </a>
      </footer>
    </div>
  );
}

function LevelMenu({ level, onPick, onClose }: { level: LevelId | null; onPick: (l: LevelId) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[aria-selected="true"], button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="level-menu" role="listbox" aria-label="Level" ref={ref}>
      {LEVELS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="option"
          className="row"
          aria-selected={level === l.id}
          onClick={() => onPick(l.id)}
        >
          <span>level {l.id}</span>
          <span>{formatRatingRange(l)}</span>
        </button>
      ))}
    </div>
  );
}

export function MobileShell({ page, level, onLevel, children }: ShellProps) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="m-shell">
      <header className="m-header">
        <Brand />
        <button
          type="button"
          className={level ? 'level-toggle' : 'level-toggle unset'}
          aria-expanded={menu}
          aria-haspopup="listbox"
          aria-label={level ? `Level ${level}, change level` : 'Pick your level'}
          onClick={() => setMenu((m) => !m)}
        >
          {level ? `L${level}` : 'L?'}
        </button>
        <ThemeToggle />
      </header>
      {menu && (
        <LevelMenu
          level={level}
          onClose={() => setMenu(false)}
          onPick={(l) => {
            onLevel(l);
            setMenu(false);
          }}
        />
      )}
      <main className="m-scroll">
        {children}
        <div className="m-links">
          <a className="series" href={seriesHref} {...external(SERIES_URL)}>
            built around the building habits youtube series ↗
          </a>
          <a className="support" href={supportHref} {...external(SUPPORT_URL)}>
            <span>support the site</span>
            <span aria-hidden="true">♥</span>
          </a>
        </div>
      </main>
      <nav className="m-tabbar" aria-label="Main">
        {PAGES.map((p) => (
          <a key={p} href={routeHref(p)} aria-current={p === page ? 'page' : undefined}>
            {p}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** First visit: pick a level before drilling. */
export function LevelPicker({ onPick }: { onPick: (l: LevelId) => void }) {
  return (
    <section className="picker" aria-labelledby="pick-level">
      <div className="sec" id="pick-level">
        pick your level
      </div>
      <p>Drills, repertoire and habits follow your level. Pick the band that matches your blitz or rapid rating; you can change it any time.</p>
      {LEVELS.map((l) => (
        <button key={l.id} type="button" className="row" onClick={() => onPick(l.id)}>
          <span>level {l.id}</span>
          <span className="count">{formatRatingRange(l)}</span>
        </button>
      ))}
    </section>
  );
}

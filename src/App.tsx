import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AboutPage, PlaySoon, ReviewPage } from './components/About';
import { HabitsPanel, type DeckCounts } from './components/Panels';
import { DesktopShell, LevelPicker, MobileShell } from './components/Shell';
import { ThemeProvider } from './components/theme';
import { getTree, type LevelId } from './data/levels';
import { DESKTOP_QUERY, routeHref, useMediaQuery, useRoute } from './hooks';
import { resolveRoute, tabsFor } from './nav';
import { loadLevel, saveLevel } from './storage';
import { TacticsPage } from './tactics/TacticsPage';
import { BrowsePage } from './trainer/BrowsePage';
import { TrainerPage } from './trainer/TrainerPage';
import { decisionPositions } from './trainer/session';

function useDeckCounts(level: LevelId | null): DeckCounts {
  return useMemo(
    () => ({
      white: level ? decisionPositions(getTree(level, 'white'), 'white').length : 0,
      black: level ? decisionPositions(getTree(level, 'black'), 'black').length : 0,
    }),
    [level],
  );
}

function Pages({ level, onLevel, desktop }: { level: LevelId | null; onLevel: (l: LevelId) => void; desktop: boolean }) {
  const raw = useRoute();
  const route = resolveRoute(raw, level);
  const counts = useDeckCounts(level);

  // Keep the address bar on the resolved route (e.g. "openings" at a level without that tab).
  const href = routeHref(route.page, route.mode);
  useEffect(() => {
    if (level && window.location.hash !== href) history.replaceState(null, '', href);
  }, [href, level]);

  useEffect(() => {
    const tab = tabsFor(level).find((t) => t.page === route.page);
    document.title = `${tab?.label ?? route.page} · Chess Habits`;
  }, [route.page, level]);

  const left: ReactNode = level ? <HabitsPanel level={level} /> : null;

  let content: ReactNode;
  if (route.page === 'about') {
    content = <AboutPage desktop={desktop} left={left} />;
  } else if (!level) {
    content = desktop ? (
      <>
        <aside className="side left" aria-hidden="true" />
        <main className="center">
          <LevelPicker onPick={onLevel} />
        </main>
        <aside className="side right" aria-hidden="true" />
      </>
    ) : (
      <div className="center">
        <LevelPicker onPick={onLevel} />
      </div>
    );
  } else if (route.page === 'review') {
    content = <ReviewPage desktop={desktop} left={left} />;
  } else if (route.page === 'tactics') {
    content = <TacticsPage key={level} level={level} desktop={desktop} />;
  } else if (!route.mode) {
    // "play" at levels where it will be the bot (L3–L4).
    content = <PlaySoon desktop={desktop} left={left} />;
  } else if (route.mode === 'browse') {
    content = <BrowsePage key={level} level={level} desktop={desktop} counts={counts} page={route.page} />;
  } else {
    content = (
      <TrainerPage
        key={`${level}:${route.mode}`}
        level={level}
        color={route.mode}
        desktop={desktop}
        counts={counts}
        page={route.page}
      />
    );
  }

  const Shell = desktop ? DesktopShell : MobileShell;
  return (
    <Shell page={route.page} level={level} onLevel={onLevel}>
      {content}
    </Shell>
  );
}

export default function App() {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [level, setLevel] = useState<LevelId | null>(loadLevel);
  const chooseLevel = (l: LevelId) => {
    setLevel(l);
    saveLevel(l);
  };
  return (
    <ThemeProvider>
      <Pages level={level} onLevel={chooseLevel} desktop={desktop} />
    </ThemeProvider>
  );
}

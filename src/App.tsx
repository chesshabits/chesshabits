import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AboutPage, ReviewPage } from './components/About';
import { DrillNav, HabitsPanel, type DrillCounts } from './components/Panels';
import { DesktopShell, LevelPicker, MobileShell } from './components/Shell';
import { ThemeProvider } from './components/theme';
import { getTree, type LevelId } from './data/levels';
import { DESKTOP_QUERY, useMediaQuery, useRoute } from './hooks';
import { loadLevel, saveLevel } from './storage';
import { TacticsPage } from './tactics/TacticsPage';
import { loadPuzzles } from './tactics/data';
import { BrowsePage } from './trainer/BrowsePage';
import { TrainerPage } from './trainer/TrainerPage';
import { decisionPositions } from './trainer/session';

function useDrillCounts(level: LevelId | null): DrillCounts {
  const [tactics, setTactics] = useState<number | null>(null);
  useEffect(() => {
    setTactics(null);
    if (!level) return;
    let cancelled = false;
    void loadPuzzles(level).then((p) => !cancelled && setTactics(p.length));
    return () => {
      cancelled = true;
    };
  }, [level]);
  return useMemo(
    () => ({
      white: level ? decisionPositions(getTree(level, 'white'), 'white').length : 0,
      black: level ? decisionPositions(getTree(level, 'black'), 'black').length : 0,
      tactics,
    }),
    [level, tactics],
  );
}

function Pages({ level, onLevel, desktop }: { level: LevelId | null; onLevel: (l: LevelId) => void; desktop: boolean }) {
  const route = useRoute();
  const counts = useDrillCounts(level);

  useEffect(() => {
    const titles = { repertoire: 'repertoire', tactics: 'tactics', review: 'game review', about: 'about' };
    document.title = `${titles[route.page]} · Chess Habits`;
  }, [route.page]);

  const left: ReactNode = level ? (
    <>
      <DrillNav page={route.page} mode={route.mode} counts={counts} level={level} />
      <HabitsPanel level={level} />
    </>
  ) : null;

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
    content = <TacticsPage key={level} level={level} desktop={desktop} counts={counts} />;
  } else if (route.mode === 'browse') {
    content = <BrowsePage key={level} level={level} desktop={desktop} counts={counts} />;
  } else {
    content = <TrainerPage key={`${level}:${route.mode}`} level={level} color={route.mode} desktop={desktop} counts={counts} />;
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

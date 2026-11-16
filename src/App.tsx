import { useEffect, useState } from 'react';
import { type LevelId } from './data/levels';
import { loadLevel, saveLevel } from './storage';
import { LevelPicker } from './components/LevelPicker';
import { Home } from './components/Home';
import { About } from './components/About';

import { SOURCE_URL } from './config';

type Route = 'home' | 'about';

function routeFromHash(): Route {
  return window.location.hash === '#/about' ? 'about' : 'home';
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [level, setLevel] = useState<LevelId | null>(loadLevel);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const chooseLevel = (id: LevelId) => {
    setLevel(id);
    saveLevel(id);
  };

  return (
    <div className="app">
      <header className="header">
        <a href="#/" className="brand">Chess Habits</a>
        <nav>
          <a href="#/" aria-current={route === 'home' ? 'page' : undefined}>Home</a>
          <a href="#/about" aria-current={route === 'about' ? 'page' : undefined}>About</a>
        </nav>
      </header>

      <main className="main">
        {route === 'about' ? (
          <About />
        ) : (
          <>
            <LevelPicker value={level} onChange={chooseLevel} />
            <Home level={level} />
          </>
        )}
      </main>

      <footer className="footer">
        <a href={SOURCE_URL}>Source code</a>
        <span aria-hidden="true">·</span>
        <a href="https://www.gnu.org/licenses/gpl-3.0.html">GPL-3.0</a>
      </footer>
    </div>
  );
}

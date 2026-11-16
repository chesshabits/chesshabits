import type { ReactNode } from 'react';
import { SERIES_URL, SOURCE_URL, SUPPORT_URL } from '../config';
import { NOTICES } from '../data/notices';
import { Sec } from './Panels';

function Notices() {
  return (
    <>
      <Sec>third-party notices</Sec>
      {NOTICES.map((n, i) => (
        <a
          key={n.name}
          className={i === NOTICES.length - 1 ? 'row end' : 'row'}
          href={n.url}
          target="_blank"
          rel="noopener noreferrer"
          title={n.what}
        >
          <span className="fg">{n.name}</span>
          <span className="count">{n.license}</span>
        </a>
      ))}
    </>
  );
}

export function AboutContent() {
  return (
    <article className="prose">
      <h1>about chess habits</h1>
      <p>
        Chess Habits is a free, open-source trainer for good chess habits and a simple, level-based opening
        repertoire. Drills inspired by the Building Habits series.
      </p>
      <p>
        Pick your level, then drill the repertoire for White and Black and solve tactics taken from the same openings.
        Game review, which checks your own games for each habit, comes in a later version.
      </p>

      <h2>the series</h2>
      <p>
        The repertoire is built from the opening moves played in the series' games, split by level. Chess Habits is an
        independent project: it is not affiliated with or endorsed by the series or its creators.{' '}
        {SERIES_URL ? (
          <a href={SERIES_URL} target="_blank" rel="noopener noreferrer">
            Watch the series ↗
          </a>
        ) : (
          <span className="dim">A link to the series playlist is coming soon.</span>
        )}
      </p>

      <h2>source code and license</h2>
      <p>
        Chess Habits is free software under the{' '}
        <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer">
          GNU General Public License v3.0
        </a>
        . The full source code is at{' '}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          {SOURCE_URL.replace('https://', '')}
        </a>
        . Third-party components and their licenses are listed on this page and in the repository.
      </p>

      <h2>support the site</h2>
      <p>
        No ads, no paywalls, no accounts.{' '}
        {SUPPORT_URL ? (
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
            Support the site and the team that builds it ♥
          </a>
        ) : (
          'Donations to support the site and the team that builds it will open here once the app is finished.'
        )}
      </p>

      <h2>privacy</h2>
      <p>
        Everything stays in your browser: your level, theme and training progress are stored locally on this device.
        There is no backend and nothing is tracked.
      </p>
    </article>
  );
}

export function AboutPage({ desktop, left }: { desktop: boolean; left: ReactNode }) {
  if (desktop) {
    return (
      <>
        <aside className="side left" aria-label="Drills">
          {left}
        </aside>
        <main className="center top">
          <AboutContent />
        </main>
        <aside className="side right" aria-label="Third-party notices">
          <Notices />
        </aside>
      </>
    );
  }
  return (
    <>
      <div className="center top">
        <AboutContent />
      </div>
      <Notices />
    </>
  );
}

export function ReviewPage({ desktop, left }: { desktop: boolean; left: ReactNode }) {
  const content = (
    <article className="prose">
      <h1>game review</h1>
      <p>Coming in phase 3.</p>
      <p className="dim">
        Import your chess.com games by username and see, move by move, where you followed or broke each habit for your
        level, and where you left the repertoire. Missed habits will turn into personal puzzles later on.
      </p>
      <p>
        Until then: drill the <a href="#/openings/white">repertoire</a> and the{' '}
        <a href="#/tactics">opening tactics</a>.
      </p>
    </article>
  );
  if (desktop) {
    return (
      <>
        <aside className="side left" aria-label="Drills">
          {left}
        </aside>
        <main className="center top">{content}</main>
        <aside className="side right" aria-hidden="true" />
      </>
    );
  }
  return <div className="center top">{content}</div>;
}

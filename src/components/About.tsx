import { SOURCE_URL } from '../config';

const NOTICES = [
  { name: 'chessground', license: 'GPL-3.0', url: 'https://github.com/lichess-org/chessground' },
  { name: 'Stockfish (planned)', license: 'GPL-3.0', url: 'https://github.com/official-stockfish/Stockfish' },
  { name: 'chess.js', license: 'BSD-2-Clause', url: 'https://github.com/jhlywa/chess.js' },
  { name: 'Lichess puzzle database', license: 'CC0', url: 'https://database.lichess.org/#puzzles' },
];

export function About() {
  return (
    <article className="about">
      <h2>About</h2>
      <p>Chess Habits is a free, open-source trainer for good chess habits and a simple opening repertoire.</p>
      <p>Drills inspired by the Building Habits series.</p>

      <h3>License</h3>
      <p>
        Chess Habits is free software, licensed under the{' '}
        <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU General Public License v3.0</a>. The full source
        code is available at <a href={SOURCE_URL}>{SOURCE_URL.replace('https://', '')}</a>.
      </p>

      <h3>Third-party notices</h3>
      <ul>
        {NOTICES.map((n) => (
          <li key={n.name}>
            <a href={n.url}>{n.name}</a>: {n.license}
          </li>
        ))}
      </ul>
    </article>
  );
}

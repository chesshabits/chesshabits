import { type LevelId, getTree } from '../data/levels';

export function Home({ level }: { level: LevelId | null }) {
  if (level === null) {
    return <p className="placeholder">Pick a level to get started.</p>;
  }
  const white = getTree(level, 'white');
  const black = getTree(level, 'black');
  return (
    <section className="placeholder">
      <h2>Level {level} drills</h2>
      <p>
        The repertoire trainer is coming soon. Your Level {level} repertoire is built from {white.games} games
        as White and {black.games} as Black.
      </p>
    </section>
  );
}

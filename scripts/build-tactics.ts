/**
 * Builds the opening-filtered tactics subset that ships with the app (SPEC §5.2).
 *
 *   node scripts/build-openings.ts   # first, if the trees changed
 *   node scripts/build-tactics.ts [--input path/to/puzzles.csv[.zst]]
 *
 * Streams the Lichess puzzle database (CC0, lichess_db_puzzle.csv.zst; downloaded once to
 * .cache/lichess/, which is gitignored), keeps puzzles whose OpeningTags match the level's
 * repertoire openings (data/openings.json), applies the level's theme set, excluded themes and
 * rating range (data/levels/level-N.json), and writes data/tactics/level-N.json.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createZstdDecompress } from 'node:zlib';
import {
  DEFAULT_QUALITY,
  LevelSelector,
  matchesOpening,
  parsePuzzleRow,
  passesQuality,
  type TacticsFilter,
} from './lib/puzzles.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const DEFAULT_INPUT = join(ROOT, '.cache', 'lichess', 'lichess_db_puzzle.csv.zst');
const LEVELS = [1, 2, 3, 4] as const;

async function ensureDownloaded(path: string): Promise<void> {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  console.log(`downloading ${DB_URL} (about 300 MB) ...`);
  const res = await fetch(DB_URL, { headers: { 'User-Agent': 'chesshabits-data-script' } });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(path));
}

/** Decompress with the zstd CLI when available (Node's zlib zstd rejects some frames), else zlib. */
function openInput(path: string): Readable {
  if (!path.endsWith('.zst')) return createReadStream(path);
  if (spawnSync('zstd', ['--version']).status === 0) {
    const child = spawn('zstd', ['-dc', path], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.on('exit', (code) => {
      if (code) throw new Error(`zstd exited with ${code}`);
    });
    return child.stdout;
  }
  const out = createReadStream(path).pipe(createZstdDecompress());
  out.on('error', (err) => {
    throw err;
  });
  return out;
}

async function main() {
  const argIndex = process.argv.indexOf('--input');
  const input = argIndex > 0 ? process.argv[argIndex + 1] : DEFAULT_INPUT;
  if (input === DEFAULT_INPUT) await ensureDownloaded(input);

  const openings = JSON.parse(readFileSync(join(ROOT, 'data', 'openings.json'), 'utf8')) as {
    levels: Record<string, { tags: string[] }>;
  };

  const levels = LEVELS.map((level) => {
    const config = JSON.parse(readFileSync(join(ROOT, 'data', 'levels', `level-${level}.json`), 'utf8')) as {
      tactics: TacticsFilter;
    };
    return {
      level,
      tags: new Set(openings.levels[level].tags),
      selector: new LevelSelector(config.tactics),
    };
  });

  const lines = createInterface({ input: openInput(input), crlfDelay: Infinity });

  let total = 0;
  let inOpenings = 0;
  const seenTags = new Set<string>();
  for await (const line of lines) {
    const p = parsePuzzleRow(line);
    if (!p) continue;
    total++;
    if (total % 500_000 === 0) console.log(`  ${total.toLocaleString()} puzzles read`);
    if (p.openingTags.length) seenTags.add(p.openingTags[1] ?? `${p.openingTags[0]}_Other_variations`);
    if (!passesQuality(p, DEFAULT_QUALITY)) continue;
    let matched = false;
    for (const l of levels) {
      if (!matchesOpening(p, l.tags)) continue;
      matched = true;
      l.selector.offer(p);
    }
    if (matched) inOpenings++;
  }

  mkdirSync(join(ROOT, 'data', 'tactics'), { recursive: true });
  console.log(`read ${total.toLocaleString()} puzzles; ${inOpenings.toLocaleString()} pass quality and match a repertoire opening`);
  const unmatched = [...new Set(levels.flatMap((l) => [...l.tags]))].filter((t) => !seenTags.has(t));
  if (unmatched.length) console.log(`opening tags with no puzzles (check spelling vs the puzzle DB): ${unmatched.join(', ')}`);
  for (const l of levels) {
    const counts = l.selector.counts();
    const puzzles = l.selector.finalize();
    const out = {
      source:
        'Lichess puzzle database (CC0, database.lichess.org), filtered to this level\'s repertoire openings, ' +
        'themes and rating range by scripts/build-tactics.ts. Do not edit by hand.',
      level: l.level,
      puzzles,
    };
    const path = join(ROOT, 'data', 'tactics', `level-${l.level}.json`);
    const json = JSON.stringify(out);
    writeFileSync(path, json + '\n');
    const thin = Object.entries(counts)
      .filter(([, n]) => n < 20)
      .map(([t, n]) => `${t} ${n}`);
    console.log(
      `level ${l.level}: ${puzzles.length} puzzles, ${(json.length / 1024).toFixed(0)} KB` +
        (thin.length ? ` (thin themes: ${thin.join(', ')})` : ''),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import type { Candidate } from './elo';

/** Stockfish (WASM, single-threaded) in a Web Worker, loaded on first use. */
const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

export interface Analysis {
  /** Candidate lines, best first; scores from the side to move. */
  lines: Candidate[];
  bestmove: string | null;
}

export interface AnalyseOptions {
  options: [string, string | number | boolean][];
  go: string;
}

const MATE = 10_000;

/** Parse a UCI "info" line into (multipv index, candidate). */
export function parseInfo(line: string): { k: number; c: Candidate } | null {
  if (!line.startsWith('info') || !line.includes(' pv ')) return null;
  const k = Number(line.match(/ multipv (\d+)/)?.[1] ?? 1);
  const cp = line.match(/ score cp (-?\d+)/);
  const mate = line.match(/ score mate (-?\d+)/);
  const move = line.match(/ pv (\S+)/)?.[1];
  if (!move || (!cp && !mate)) return null;
  const score = cp ? Number(cp[1]) : Math.sign(Number(mate![1])) * (MATE - Math.abs(Number(mate![1])));
  return { k, c: { move, cp: score } };
}

export class Engine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private queue: Promise<unknown>;

  private constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data);
      for (const l of this.listeners) l(line);
    };
    this.queue = this.until('uci', 'uciok').then(() => this.until('isready', 'readyok'));
  }

  private static instance: Engine | null = null;

  /** The shared engine, created (and its WASM downloaded) on first use. */
  static get(): Engine {
    Engine.instance ??= new Engine();
    return Engine.instance;
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  /** Send a command and resolve on the first line starting with `done`. */
  private until(cmd: string, done: string, onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const listener = (line: string) => {
        onLine?.(line);
        if (line.startsWith(done)) {
          this.listeners.delete(listener);
          resolve(line);
        }
      };
      this.listeners.add(listener);
      this.send(cmd);
    });
  }

  /** Analyse a position. Calls are queued, one at a time. */
  analyse(fen: string, opts: AnalyseOptions): Promise<Analysis> {
    const run = async (): Promise<Analysis> => {
      for (const [name, value] of opts.options) this.send(`setoption name ${name} value ${value}`);
      await this.until('isready', 'readyok');
      this.send(`position fen ${fen}`);
      const lines = new Map<number, Candidate>();
      const best = await this.until(opts.go, 'bestmove', (line) => {
        const info = parseInfo(line);
        if (info) lines.set(info.k, info.c);
      });
      const bestmove = best.split(' ')[1];
      return {
        lines: [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c),
        bestmove: bestmove && bestmove !== '(none)' ? bestmove : null,
      };
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** Evaluation for the eval toggle: full strength, a quick fixed depth, from White's side. */
export async function evaluate(fen: string): Promise<number | null> {
  const a = await Engine.get().analyse(fen, {
    options: [
      ['UCI_LimitStrength', false],
      ['Skill Level', 20],
      ['MultiPV', 1],
    ],
    go: 'go depth 12',
  });
  const cp = a.lines[0]?.cp;
  if (cp === undefined) return null;
  return fen.split(' ')[1] === 'w' ? cp : -cp;
}

export function formatEval(cp: number | null): string {
  if (cp === null) return '…';
  if (Math.abs(cp) >= MATE - 500) return `${cp > 0 ? '+' : '-'}M${MATE - Math.abs(cp)}`;
  const pawns = cp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

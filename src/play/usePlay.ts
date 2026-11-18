import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move } from 'chess.js';
import type { Key } from 'chessground/types';
import { getStore } from '../db';
import { levelConfig } from '../data/habits';
import { getTree, type Color, type LevelId } from '../data/levels';
import { childrenAt } from '../trainer/tree';
import { chooseMove, clampElo, engineSettings, uciSetup } from './elo';
import { Engine, evaluate } from './engine';
import {
  DEFAULT_OPTIONS,
  bookReply,
  flagged,
  formatTimeControl,
  newClock,
  pressClock,
  stopClock,
  takebackAllowed,
  type ClockState,
  type GameOptions,
} from './rules';

export interface GameResult {
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: string;
  /** From the user's point of view. */
  outcome: 'win' | 'loss' | 'draw';
}

export interface LastReply {
  /** "5...d6" */
  label: string;
  /** Series games behind a book reply. */
  book: { n: number; total: number } | null;
}

interface Game {
  id: number;
  sans: string[];
  result: GameResult | null;
  takebacks: number;
  startedAt: number;
  inBook: boolean;
  last: LastReply | null;
  clock: ClockState | null;
  thinking: boolean;
}

const BOOK_DELAY = 450;
const label = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}${san}`;

export function replaySans(sans: readonly string[]): { chess: Chess; history: Move[] } {
  const chess = new Chess();
  const history: Move[] = [];
  for (const s of sans) history.push(chess.move(s));
  return { chess, history };
}

/** Game end by the rules: mate, stalemate, insufficient material, threefold, fifty moves. Never resigns. */
export function gameResult(chess: Chess, me: Color): GameResult | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'black' : 'white';
    return { result: winner === 'white' ? '1-0' : '0-1', reason: 'checkmate', outcome: winner === me ? 'win' : 'loss' };
  }
  const reason = chess.isStalemate()
    ? 'stalemate'
    : chess.isInsufficientMaterial()
      ? 'insufficient material'
      : chess.isThreefoldRepetition()
        ? 'threefold repetition'
        : 'fifty-move rule';
  return { result: '1/2-1/2', reason, outcome: 'draw' };
}

export function usePlay(level: LevelId) {
  const [userColor, setUserColor] = useState<Color>('white');
  const [elo, setEloState] = useState(() => levelConfig(level).play.botElo);
  const [options, setOptions] = useState<GameOptions>(DEFAULT_OPTIONS);
  const [evalOn, setEvalOn] = useState(false);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [game, setGame] = useState<Game>(() => fresh(0, null));
  const gameRef = useRef(game);
  gameRef.current = game;

  function fresh(id: number, clock: ClockState | null): Game {
    return { id, sans: [], result: null, takebacks: 0, startedAt: Date.now(), inBook: true, last: null, clock, thinking: false };
  }
  const commit = (g: Game) => {
    gameRef.current = g;
    setGame(g);
  };

  const tree = useMemo(() => getTree(level, userColor), [level, userColor]);
  const { chess, history } = useMemo(() => replaySans(game.sans), [game.sans]);
  const me = userColor === 'white' ? 'w' : 'b';
  const userTurn = chess.turn() === me;
  const canTakeback = takebackAllowed(options);

  const newGame = useCallback(
    (color: Color = userColor) => {
      setUserColor(color);
      setEvalCp(null);
      commit(fresh(gameRef.current.id + 1, options.clock ? newClock(options.clock) : null));
    },
    [userColor, options.clock],
  );

  /** Save a finished game for Review. */
  const save = useCallback(
    (g: Game, result: GameResult) => {
      const pgnGame = replaySans(g.sans).chess;
      const bot = `bot (~${elo})`;
      pgnGame.setHeader('Event', 'Chess Habits: play vs bot');
      pgnGame.setHeader('Date', new Date(g.startedAt).toISOString().slice(0, 10).replace(/-/g, '.'));
      pgnGame.setHeader('White', userColor === 'white' ? 'you' : bot);
      pgnGame.setHeader('Black', userColor === 'black' ? 'you' : bot);
      pgnGame.setHeader('Result', result.result);
      pgnGame.setHeader('Termination', result.reason);
      if (options.clock) pgnGame.setHeader('TimeControl', `${options.clock.minutes * 60}+${options.clock.incrementSec}`);
      void getStore().then((s) =>
        s.addGame({
          level,
          userColor,
          botElo: elo,
          timeControl: options.clock ? formatTimeControl(options.clock) : null,
          takebacksAllowed: canTakeback,
          takebacks: g.takebacks,
          result: result.result,
          reason: result.reason,
          pgn: pgnGame.pgn(),
          startedAt: g.startedAt,
          endedAt: Date.now(),
        }),
      );
    },
    [level, userColor, elo, options.clock, canTakeback],
  );

  /** Append a move (SAN) for whoever is to move; handles the clock and game end. */
  const apply = useCallback(
    (g: Game, san: string, extra: Partial<Game> = {}): Game => {
      const { chess: board } = replaySans(g.sans);
      const mover: Color = board.turn() === 'w' ? 'white' : 'black';
      board.move(san);
      const t = Date.now();
      let clock = g.clock ? pressClock(g.clock, mover, t) : null;
      const result = gameResult(board, userColor);
      if (result && clock) clock = stopClock(clock, t);
      const next: Game = { ...g, ...extra, sans: [...g.sans, san], clock, result, thinking: false };
      if (result) save(next, result);
      return next;
    },
    [userColor, save],
  );

  /** The user's move on the board. */
  const onMove = useCallback(
    (from: Key, to: Key) => {
      const g = gameRef.current;
      if (g.result || g.thinking) return;
      const board = replaySans(g.sans).chess;
      if (board.turn() !== me) return;
      let san: string;
      try {
        san = board.move({ from, to, promotion: 'q' }).san;
      } catch {
        commit({ ...g });
        return;
      }
      commit(apply(g, san));
    },
    [me, apply],
  );

  // The bot's turn: a book reply while the game follows the series games, then the engine.
  useEffect(() => {
    if (game.result || userTurn || game.thinking) return;
    const id = game.id;
    commit({ ...game, thinking: true });
    let cancelled = false;
    const sans = game.sans;
    const ply = sans.length;
    (async () => {
      const book = game.inBook ? bookReply(tree, sans) : null;
      let san: string;
      let last: LastReply;
      if (book) {
        await new Promise((r) => setTimeout(r, BOOK_DELAY));
        san = book.san;
        last = { label: label(ply, san), book: { n: book.n, total: book.total } };
      } else {
        const settings = engineSettings(elo);
        const fen = replaySans(sans).chess.fen();
        const a = await Engine.get().analyse(fen, uciSetup(settings));
        const uci = a.lines.length ? chooseMove(a.lines, settings) : a.bestmove;
        if (!uci) return;
        const board = replaySans(sans).chess;
        san = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
        last = { label: label(ply, san), book: null };
      }
      const g = gameRef.current;
      if (cancelled || g.id !== id || g.sans.length !== ply) return;
      commit(apply(g, san, { inBook: !!book, last }));
    })();
    return () => {
      cancelled = true;
      const g = gameRef.current;
      if (g.id === id && g.thinking && g.sans.length === ply) commit({ ...g, thinking: false });
    };
    // Runs per position; `game` itself changes when "thinking" flips, which must not restart it.
  }, [game.id, game.sans, game.result, userTurn]);

  // Clock: tick while running and flag at zero.
  useEffect(() => {
    if (!game.clock?.running || game.result) return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      const g = gameRef.current;
      if (!g.clock || g.result) return;
      const side = flagged(g.clock, n);
      if (side) {
        const winner = side === 'white' ? 'black' : 'white';
        const result: GameResult = {
          result: winner === 'white' ? '1-0' : '0-1',
          reason: 'time',
          outcome: winner === userColor ? 'win' : 'loss',
        };
        const next = { ...g, clock: stopClock(g.clock, n), result, thinking: false };
        commit(next);
        save(next, result);
      }
    }, 100);
    return () => window.clearInterval(t);
  }, [game.clock, game.result, userColor, save]);

  /** Undo the user's last move (and the bot's reply). Recorded in the saved game. */
  const takeback = useCallback(() => {
    const g = gameRef.current;
    if (!canTakeback || g.thinking) return;
    const board = replaySans(g.sans).chess;
    // Back to the user's turn: drop the bot reply too if it has been played.
    let drop = board.turn() === me ? 2 : 1;
    if (g.sans.length < drop) drop = g.sans.length;
    if (drop === 0) return;
    const sans = g.sans.slice(0, g.sans.length - drop);
    if (replaySans(sans).chess.turn() !== me) return;
    const t = Date.now();
    commit({
      ...g,
      sans,
      result: null,
      takebacks: g.takebacks + 1,
      // Takebacks don't refund time; the user's clock keeps running.
      clock: g.clock ? { ...g.clock, ...stopClock(g.clock, t), running: g.sans.length > 0 ? userColor : null } : null,
      inBook: childrenAt(tree, sans) !== null,
    });
  }, [canTakeback, me, userColor, tree]);

  // Engine eval (toggle): evaluate the live position when it changes.
  useEffect(() => {
    if (!evalOn || game.thinking) return;
    let cancelled = false;
    setEvalCp(null);
    void evaluate(chess.fen()).then((cp) => !cancelled && setEvalCp(cp));
    return () => {
      cancelled = true;
    };
  }, [evalOn, game.sans, game.thinking]);

  return {
    level,
    userColor,
    elo,
    setElo: (e: number) => setEloState(clampElo(e)),
    options,
    setOptions,
    evalOn,
    setEvalOn,
    evalCp,
    game,
    chess,
    history,
    userTurn,
    canTakeback,
    now,
    newGame,
    onMove,
    takeback,
  };
}

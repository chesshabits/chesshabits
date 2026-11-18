import { Chess, type Move, type Square } from 'chess.js';
import { habit, levelConfig } from '../data/habits';
import type { LevelId } from '../data/levels';

/* ---------- material helpers ---------- */

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
type Color = 'w' | 'b';
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** `color`'s pieces (not pawns or king) that are attacked and undefended, or attacked by something cheaper. */
export function hangingPieces(chess: Chess, color: Color): Square[] {
  const out: Square[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k' || p.type === 'p') continue;
      const attackers = chess.attackers(p.square, other(color));
      if (!attackers.length) continue;
      const cheapest = Math.min(...attackers.map((s) => VALUE[chess.get(s)!.type]));
      if (chess.attackers(p.square, color).length === 0 || cheapest < VALUE[p.type]) out.push(p.square);
    }
  }
  return out;
}

/** Captures for the side to move that win a hanging piece, most valuable first. */
export function freeCaptures(chess: Chess): Move[] {
  const me = chess.turn();
  const hanging = new Set(hangingPieces(chess, other(me)));
  return chess
    .moves({ verbose: true })
    .filter((m) => m.captured && hanging.has(m.to))
    .sort((a, b) => VALUE[b.captured!] - VALUE[a.captured!]);
}

/* ---------- live habit marks ---------- */

export type Mark = 'done' | 'todo' | 'broken';

const HOME_MINORS: Record<Color, Square[]> = { w: ['b1', 'g1', 'c1', 'f1'], b: ['b8', 'g8', 'c8', 'f8'] };
const LUFT: Record<Color, string[]> = { w: ['h2h3', 'g2g3'], b: ['h7h6', 'g7g6'] };

/**
 * Where the user stands on each graded habit of the level, from the game so far. Simple checks
 * where they are easy to get right; anything else stays "todo" until Phase 3's detectors.
 */
export function habitMarks(level: LevelId, history: readonly Move[], me: Color, over: boolean): Record<string, Mark> {
  const ids = levelConfig(level)
    .habits.flat()
    .filter((id) => habit(id).kinds.includes('check'));
  const mine = history.filter((m) => m.color === me);
  const castleIdx = mine.findIndex((m) => m.isKingsideCastle() || m.isQueensideCastle());
  const afterCastle = castleIdx >= 0 ? mine.slice(castleIdx + 1) : [];

  // Replay to find pieces left hanging and free pieces skipped.
  let hung = false;
  let tookFree = false;
  let skippedFree = false;
  const board = new Chess();
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    if (m.color === me) {
      const free = freeCaptures(board).filter((c) => VALUE[c.captured!] >= 3);
      if (free.length) {
        if (free.some((c) => c.from === m.from && c.to === m.to)) tookFree = true;
        else if (!m.captured && !board.inCheck()) skippedFree = true;
      }
    }
    board.move(m.san);
    if (m.color === me) {
      const reply = history[i + 1];
      const left = new Set(hangingPieces(board, me));
      if (reply && reply.captured && left.has(reply.to) && VALUE[reply.captured] >= 3) hung = true;
    }
  }

  const marks: Record<string, Mark> = {};
  for (const id of ids) {
    let mark: Mark = 'todo';
    switch (id) {
      case 'castle-asap':
      case 'castle-quickly':
        if (castleIdx >= 0) mark = 'done';
        else if (mine.some((m) => m.piece === 'k')) mark = 'broken';
        break;
      case 'develop-aggressively': {
        const moved = new Set(mine.map((m) => m.from));
        if (HOME_MINORS[me].every((s) => moved.has(s))) mark = 'done';
        break;
      }
      case 'center-control':
        if (mine.slice(0, 5).some((m) => m.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(m.to))) mark = 'done';
        break;
      case 'snorkel':
        if (afterCastle.some((m) => LUFT[me].includes(m.from + m.to))) mark = 'done';
        else if (castleIdx >= 0 && afterCastle.length >= 6) mark = 'broken';
        break;
      case 'rooks-to-middle': {
        const rook = afterCastle.find((m) => m.piece === 'r');
        if (rook) mark = 'de'.includes(rook.to[0]) ? 'done' : 'broken';
        break;
      }
      case 'double-rooks-open-file': {
        const b = new Chess();
        for (const m of history) {
          b.move(m.san);
          const rooks = b
            .board()
            .flat()
            .filter((p) => p && p.color === me && p.type === 'r');
          if (rooks.length === 2 && rooks[0]!.square[0] === rooks[1]!.square[0]) {
            const file = rooks[0]!.square[0];
            const ownPawn = b
              .board()
              .flat()
              .some((p) => p && p.color === me && p.type === 'p' && p.square[0] === file);
            if (!ownPawn) mark = 'done';
          }
        }
        break;
      }
      case 'rpm':
        if (afterCastle.some((m) => m.piece === 'p' && !m.captured && 'abc'.includes(m.from[0]))) mark = 'done';
        break;
      case 'no-hanging-pieces':
        mark = hung ? 'broken' : mine.length >= 10 || over ? 'done' : 'todo';
        break;
      case 'take-free-pieces':
        mark = skippedFree ? 'broken' : tookFree ? 'done' : 'todo';
        break;
      case 'never-resign':
        mark = over ? 'done' : 'todo';
        break;
    }
    marks[id] = mark;
  }
  return marks;
}

/* ---------- coach ---------- */

export interface Tip {
  habit: string;
  text: string;
  /** What "show me" draws: an arrow (from, to) or a circle (from only). */
  show: { from: Square; to?: Square } | null;
}

const sq = (s: Square) => s;

/**
 * One tip for the user's move, from the level's habits, most urgent first: a piece of yours
 * hanging, a free piece to take, castle, snorkel, rook to the middle, develop, then RPMs.
 */
export function coachTip(level: LevelId, history: readonly Move[], me: Color): Tip | null {
  const chess = new Chess();
  for (const m of history) chess.move(m.san);
  if (chess.turn() !== me || chess.isGameOver()) return null;
  const has = new Set(levelConfig(level).habits.flat());
  const legal = chess.moves({ verbose: true });
  const find = (from: string, to: string) => legal.find((m) => m.from === from && m.to === to);
  const mine = history.filter((m) => m.color === me);
  const castled = mine.some((m) => m.isKingsideCastle() || m.isQueensideCastle());
  const back = me === 'w' ? '1' : '8';

  const hanging = hangingPieces(chess, me);
  if (hanging.length) {
    const s = hanging[0];
    return {
      habit: 'no-hanging-pieces',
      text: `Your ${NAME[chess.get(s)!.type]} on ${s} is attacked and not safely defended. Move it or protect it.`,
      show: { from: s },
    };
  }

  const free = freeCaptures(chess)[0];
  if (free) {
    return {
      habit: 'take-free-pieces',
      text: `Their ${NAME[free.captured!]} on ${free.to} is free. Take it.`,
      show: { from: sq(free.from), to: sq(free.to) },
    };
  }

  const kingside = legal.find((m) => m.isKingsideCastle());
  const developed = HOME_MINORS[me].filter((s) => mine.some((m) => m.from === s)).length;
  if (!castled && kingside && developed >= 2) {
    const castleHabit = has.has('castle-asap') ? 'castle-asap' : 'castle-quickly';
    return {
      habit: castleHabit,
      text: 'Your pieces are out and the way is clear. Castle now.',
      show: { from: sq(kingside.from), to: sq(kingside.to) },
    };
  }

  if (castled && has.has('snorkel')) {
    const luft = me === 'w' ? find('h2', 'h3') : find('h7', 'h6');
    const madeLuft = mine.some((m) => LUFT[me].includes(m.from + m.to));
    if (luft && !madeLuft) {
      return {
        habit: 'snorkel',
        text: `You're castled. Make a snorkel: ${luft.san} gives your king an escape square.`,
        show: { from: sq(luft.from), to: sq(luft.to) },
      };
    }
  }

  if (castled && has.has('rooks-to-middle')) {
    const rookCentral = chess
      .board()
      .flat()
      .some((p) => p && p.color === me && p.type === 'r' && 'de'.includes(p.square[0]));
    const rookMove = legal.find((m) => m.piece === 'r' && m.from[1] === back && 'de'.includes(m.to[0]) && m.to[1] === back);
    if (!rookCentral && rookMove) {
      return {
        habit: 'rooks-to-middle',
        text: `Bring a rook to the middle: ${rookMove.san}.`,
        show: { from: sq(rookMove.from), to: sq(rookMove.to) },
      };
    }
  }

  if (mine.length < 12) {
    // Claim the center with a pawn first, then develop toward it (knights before bishops).
    const centerPawn = mine.some((m) => m.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(m.to));
    const order = ['e4', 'e5', 'd4', 'd5'];
    const pawnMove = legal
      .filter((m) => m.piece === 'p' && !m.captured && order.includes(m.to))
      .sort((a, b) => order.indexOf(a.to) - order.indexOf(b.to))[0];
    if (!centerPawn && pawnMove && mine.length < 3) {
      return {
        habit: 'center-control',
        text: `Claim the center with a pawn: ${pawnMove.san}.`,
        show: { from: sq(pawnMove.from), to: sq(pawnMove.to) },
      };
    }
    const centrality = (s: string) => Math.abs(s.charCodeAt(0) - 100.5) + Math.abs(Number(s[1]) - 4.5);
    const develop = legal
      .filter((m) => (m.piece === 'n' || m.piece === 'b') && HOME_MINORS[me].includes(m.from) && !m.captured)
      .filter((m) => {
        const after = new Chess(chess.fen());
        after.move(m.san);
        return !hangingPieces(after, me).includes(m.to);
      })
      // Knights first, most central first; ties go kingside so castling comes sooner.
      .sort(
        (a, b) =>
          (a.piece === b.piece ? 0 : a.piece === 'n' ? -1 : 1) ||
          centrality(a.to) - centrality(b.to) ||
          b.to.charCodeAt(0) - a.to.charCodeAt(0),
      )[0];
    if (develop) {
      return {
        habit: has.has('develop-aggressively') ? 'develop-aggressively' : 'center-control',
        text: `Get your pieces out toward the center: ${develop.san}.`,
        show: { from: sq(develop.from), to: sq(develop.to) },
      };
    }
  }

  if (castled && has.has('rpm')) {
    const push = legal.find((m) => {
      if (m.piece !== 'p' || m.captured || !'ab'.includes(m.from[0])) return false;
      const after = new Chess(chess.fen());
      after.move(m.san);
      return !after.attackers(m.to, other(me)).length;
    });
    if (push) {
      return {
        habit: 'rpm',
        text: `Nothing to fix? Play a random pawn move on the queenside, like ${push.san}.`,
        show: { from: sq(push.from), to: sq(push.to) },
      };
    }
  }
  return null;
}

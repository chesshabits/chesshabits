import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Color, Key } from 'chessground/types';
import { Chess, SQUARES } from 'chess.js';
import { useTheme } from './theme';

export interface BoardProps {
  fen: string;
  orientation: Color;
  /** The side the user may move, or null when the board is read-only. */
  movable: Color | null;
  lastMove?: [Key, Key];
  shapes?: DrawShape[];
  /** Restrict legal destinations further (e.g. browse mode: only tree moves). */
  filterDests?: (from: Key, to: Key) => boolean;
  onMove?: (from: Key, to: Key) => void;
  /** Change this to force the board back to `fen` (e.g. after a rejected move). */
  syncKey?: number;
  label?: string;
}

/** Legal moves of the side to move, in chessground's format. */
export function legalDests(fen: string, filter?: (from: Key, to: Key) => boolean): Map<Key, Key[]> {
  const chess = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  for (const s of SQUARES) {
    const tos = chess
      .moves({ square: s, verbose: true })
      .map((m) => m.to as Key)
      .filter((to) => !filter || filter(s as Key, to));
    if (tos.length) dests.set(s as Key, [...new Set(tos)]);
  }
  return dests;
}

const FILES = 'abcdefgh';

function Coords({ orientation }: { orientation: Color }) {
  const cells = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const file = orientation === 'white' ? FILES[f] : FILES[7 - f];
      const rank = orientation === 'white' ? 8 - r : r + 1;
      const light = (r + f) % 2 === 0;
      const cls = light ? 'on-light' : 'on-dark';
      cells.push(
        <span key={`${r}${f}`}>
          {f === 0 && <i className={`rank ${cls}`}>{rank}</i>}
          {r === 7 && <i className={`file ${cls}`}>{file}</i>}
        </span>,
      );
    }
  }
  return (
    <div className="coords" aria-hidden="true">
      {cells}
    </div>
  );
}

export function Board({ fen, orientation, movable, lastMove, shapes, filterDests, onMove, syncKey, label }: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const { tokens } = useTheme();

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      coordinates: false,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      draggable: { enabled: true, showGhost: true },
      movable: { free: false, showDests: true },
      drawable: { enabled: true, visible: true },
      events: { move: undefined },
    });
    const ro = new ResizeObserver(() => api.current?.redrawAll());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const cg = api.current;
    if (!cg) return;
    const chess = new Chess(fen);
    const turn: Color = chess.turn() === 'w' ? 'white' : 'black';
    cg.set({
      fen,
      orientation,
      turnColor: turn,
      lastMove,
      check: chess.inCheck() ? turn : false,
      movable: {
        color: movable ?? undefined,
        dests: movable === turn ? legalDests(fen, filterDests) : new Map(),
        events: { after: (from, to) => onMoveRef.current?.(from, to) },
      },
      drawable: {
        brushes: {
          // The defaults stay for right-click drawing; our own shapes use accent / bad / dim.
          green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
          red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 },
          blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
          yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
          accent: { key: 'ac', color: tokens.accent, opacity: 0.85, lineWidth: 10 },
          bad: { key: 'bd', color: tokens.bad, opacity: 0.85, lineWidth: 10 },
          dim: { key: 'dm', color: tokens.fg, opacity: 0.5, lineWidth: 8 },
        },
      },
    });
    cg.setAutoShapes(shapes ?? []);
  }, [fen, orientation, movable, lastMove, shapes, filterDests, tokens, syncKey]);

  return (
    <div className="board" role="group" aria-label={label ?? "Chess board"}>
      <div ref={el} />
      <Coords orientation={orientation} />
    </div>
  );
}

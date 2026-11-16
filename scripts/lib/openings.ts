import { Chess } from 'chess.js';

/** One row of the lichess-org/chess-openings TSVs (CC0). */
export interface OpeningRow {
  eco: string;
  name: string;
  pgn: string;
}

/** Parse a TSV file body (header `eco\tname\tpgn`). */
export function parseOpeningsTsv(text: string): OpeningRow[] {
  return text
    .split('\n')
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => {
      const [eco, name, pgn] = l.split('\t');
      return { eco, name, pgn };
    });
}

/** "1. e4 e5 2. Nf3" -> ["e4", "e5", "Nf3"] */
export function pgnToSan(pgn: string): string[] {
  return pgn
    .trim()
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.+$/.test(t));
}

/** Position key without the move counters, so transpositions match. */
export function epdOf(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** EPD -> opening name. The first row naming a position wins (the TSVs are ordered by ECO). */
export function buildNameIndex(rows: readonly OpeningRow[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    const chess = new Chess();
    for (const san of pgnToSan(row.pgn)) chess.move(san);
    const epd = epdOf(chess.fen());
    if (!index.has(epd)) index.set(epd, row.name);
  }
  return index;
}

/**
 * Name of a line: the deepest named position along it (by EPD, so transpositions count),
 * the same way Lichess names a game. Null if nothing along the line is named.
 */
export function nameLine(index: ReadonlyMap<string, string>, line: readonly string[]): string | null {
  const chess = new Chess();
  let name: string | null = null;
  for (const san of line) {
    chess.move(san);
    name = index.get(epdOf(chess.fen())) ?? name;
  }
  return name;
}

/** "Queen's Gambit Declined" -> "Queens_Gambit_Declined" (the Lichess puzzle OpeningTags format). */
function toTag(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/'/g, '')
    .replace(/\s+/g, '_');
}

/**
 * Where the current opening names and the (older) puzzle database tags disagree.
 * build-tactics.ts reports any level tag that matches no puzzle, which is how these are found.
 */
const TAG_ALIASES: Record<string, string> = {
  'Scandinavian_Defense_Mieses-Kotrc_Variation': 'Scandinavian_Defense_Mieses-Kotroc_Variation',
};

/**
 * The Lichess puzzle `OpeningTags` for an opening name: the family tag and the family+variation tag.
 * "Italian Game: Two Knights Defense, Fried Liver" -> ["Italian_Game", "Italian_Game_Two_Knights_Defense"].
 * A name without a variation gets "<Family>_Other_variations".
 */
export function openingTags(name: string): { family: string; variation: string } {
  const [familyPart, rest] = name.split(':');
  const family = toTag(familyPart);
  const variationPart = rest?.split(',')[0];
  const variation = variationPart ? `${family}_${toTag(variationPart)}` : `${family}_Other_variations`;
  return { family, variation: TAG_ALIASES[variation] ?? variation };
}

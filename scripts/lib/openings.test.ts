import { describe, expect, it } from 'vitest';
import { buildNameIndex, nameLine, openingTags, parseOpeningsTsv, pgnToSan } from './openings.ts';

const TSV = [
  'eco\tname\tpgn',
  'C20\tKing\'s Pawn Game\t1. e4 e5',
  'C46\tThree Knights Opening\t1. e4 e5 2. Nf3 Nc6 3. Nc3',
  'C47\tFour Knights Game\t1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6',
  'C50\tItalian Game\t1. e4 e5 2. Nf3 Nc6 3. Bc4',
  'C46\tFour Knights Game: Italian Variation\t1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Bc4',
  '',
].join('\n');

describe('opening names', () => {
  const index = buildNameIndex(parseOpeningsTsv(TSV));

  it('parses PGN move text', () => {
    expect(pgnToSan('1. e4 e5 2. Nf3')).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('names a line by its deepest named position', () => {
    expect(nameLine(index, ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'])).toBe('Four Knights Game');
    expect(nameLine(index, ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'Bc4', 'Bc5'])).toBe(
      'Four Knights Game: Italian Variation',
    );
    expect(nameLine(index, ['d4'])).toBeNull();
  });

  it('follows transpositions', () => {
    // 3.Bc4 Nf6 4.Nc3 reaches the Four Knights, Italian position by another move order.
    expect(nameLine(index, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Nc3'])).toBe(
      'Four Knights Game: Italian Variation',
    );
  });

  it('maps names to Lichess puzzle tags', () => {
    expect(openingTags('Four Knights Game: Italian Variation')).toEqual({
      family: 'Four_Knights_Game',
      variation: 'Four_Knights_Game_Italian_Variation',
    });
    expect(openingTags("Queen's Gambit Declined").variation).toBe('Queens_Gambit_Declined_Other_variations');
    expect(openingTags('Italian Game: Two Knights Defense, Fried Liver Attack').variation).toBe(
      'Italian_Game_Two_Knights_Defense',
    );
    expect(openingTags('Scandinavian Defense: Mieses-Kotrč Variation').variation).toBe(
      'Scandinavian_Defense_Mieses-Kotroc_Variation',
    );
  });
});

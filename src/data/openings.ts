import openingsJson from '../../data/openings.json';

const LINES = (openingsJson as { lines: Record<string, string> }).lines;

/** Opening name for a line (data/openings.json), using the longest named prefix. */
export function openingName(line: readonly string[]): string | null {
  for (let i = line.length; i > 0; i--) {
    const name = LINES[line.slice(0, i).join(' ')];
    if (name) return name;
  }
  return null;
}

/** Short lowercase label for the board strip: "four knights game: italian variation" -> "four knights · italian". */
export function shortOpeningName(name: string | null): string {
  if (!name) return 'starting position';
  const [family, rest] = name.toLowerCase().split(':');
  const fam = family.replace(/\b(game|opening|defense)\b/g, '').replace(/\s+/g, ' ').trim();
  const variation = rest?.split(',')[0].replace(/\bvariations?\b/g, '').trim();
  return variation ? `${fam} · ${variation}` : fam;
}

/** Lichess puzzle tag -> readable name: "Italian_Game_Giuoco_Piano" -> "italian game giuoco piano". */
export function tagLabel(tag: string): string {
  return tag.replace(/_Other_variations$/, '').replace(/_/g, ' ').toLowerCase();
}

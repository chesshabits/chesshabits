import { type LevelId, isLevelId } from './data/levels';

const LEVEL_KEY = 'chesshabits.level';
const THEME_KEY = 'chesshabits.theme';

export type Theme = 'dark' | 'light';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, blocked site data): keep the choice in memory only.
  }
}

export function loadLevel(): LevelId | null {
  const raw = read(LEVEL_KEY);
  const n = raw === null ? NaN : Number(raw);
  return isLevelId(n) ? n : null;
}

export function saveLevel(level: LevelId): void {
  write(LEVEL_KEY, String(level));
}

/** Dark unless the user picked light (SPEC §7.1: default dark regardless of OS). */
export function loadTheme(): Theme {
  return read(THEME_KEY) === 'light' ? 'light' : 'dark';
}

export function saveTheme(theme: Theme): void {
  write(THEME_KEY, theme);
}

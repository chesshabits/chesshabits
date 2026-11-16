import { type LevelId, isLevelId } from './data/levels';

const LEVEL_KEY = 'chesshabits.level';

export function loadLevel(): LevelId | null {
  try {
    const n = Number(localStorage.getItem(LEVEL_KEY));
    return isLevelId(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveLevel(level: LevelId): void {
  try {
    localStorage.setItem(LEVEL_KEY, String(level));
  } catch {
    // Storage unavailable (private mode, blocked site data): keep the choice in memory only.
  }
}

import { levelConfig, showsOpeningNames } from './data/habits';
import type { LevelId } from './data/levels';
import type { Page, Route } from './hooks';

export interface Tab {
  page: Page;
  label: string;
}

/**
 * Top tabs follow the level (SPEC §7.1):
 *   L1: play · free pieces · review · about
 *   L2: play · tactics · review · about
 *   L3–L4: play · openings · tactics · review · about
 * "openings" appears where openings are a habit; "free pieces" replaces "tactics" where the
 * level restricts tactics.
 */
export function tabsFor(level: LevelId | null): Tab[] {
  const tabs: Tab[] = [{ page: 'play', label: 'play' }];
  if (level && showsOpeningNames(level)) tabs.push({ page: 'openings', label: 'openings' });
  tabs.push({ page: 'tactics', label: tacticsLabel(level) });
  tabs.push({ page: 'review', label: 'review' }, { page: 'about', label: 'about' });
  return tabs;
}

export function tacticsLabel(level: LevelId | null): string {
  return level && levelConfig(level).restrictions.includes('no-tactics') ? 'free pieces' : 'tactics';
}

/** The repertoire trainer lives under "openings" (Levels 3–4). "play" is the game against the bot. */
export function hasOpeningsTab(level: LevelId | null): boolean {
  return !!level && showsOpeningNames(level);
}

/**
 * Map a route onto the level's tabs: a trainer view without an "openings" tab goes to "play";
 * an old "play/<mode>" link at Levels 3–4 opens that trainer view under "openings".
 */
export function resolveRoute(route: Route, level: LevelId | null): Route {
  if (route.page === 'openings' && !hasOpeningsTab(level)) return { page: 'play', mode: null };
  if (route.page === 'play' && route.mode) return hasOpeningsTab(level) ? { page: 'openings', mode: route.mode } : { page: 'play', mode: null };
  return route;
}

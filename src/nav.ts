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

/** Where the repertoire trainer lives: under "openings" where that tab exists, else under "play". */
export function trainerPage(level: LevelId | null): Page {
  return level && showsOpeningNames(level) ? 'openings' : 'play';
}

/**
 * Map a route onto the level's tabs. "openings" without that tab goes to "play" (same view);
 * at levels where "play" is the (coming) bot, a trainer view under "play" moves to "openings".
 */
export function resolveRoute(route: Route, level: LevelId | null): Route {
  const trainer = trainerPage(level);
  if (route.page === 'openings' && trainer === 'play') return { page: 'play', mode: route.mode };
  if (route.page === 'play' && trainer === 'openings' && route.mode) return { page: 'openings', mode: route.mode };
  if (route.page === trainer && !route.mode) return { page: trainer, mode: 'white' };
  return route;
}

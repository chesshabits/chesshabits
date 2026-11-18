import { describe, expect, it } from 'vitest';
import { parseHash } from './hooks';
import { resolveRoute, tabsFor } from './nav';

describe('tabs and routes per level', () => {
  it('shows the tabs for each level', () => {
    expect(tabsFor(1).map((t) => t.label)).toEqual(['play', 'free pieces', 'review', 'about']);
    expect(tabsFor(2).map((t) => t.label)).toEqual(['play', 'tactics', 'review', 'about']);
    expect(tabsFor(3).map((t) => t.label)).toEqual(['play', 'openings', 'tactics', 'review', 'about']);
  });

  it('sends routes for missing tabs to their equivalent', () => {
    const r = (hash: string, level: 1 | 2 | 3 | 4) => resolveRoute(parseHash(hash), level);
    expect(r('#/play', 2)).toEqual({ page: 'play', mode: null });
    expect(r('#/openings/black', 2)).toEqual({ page: 'play', mode: null });
    expect(r('#/play/black', 2)).toEqual({ page: 'play', mode: null });
    expect(r('#/play/black', 3)).toEqual({ page: 'openings', mode: 'black' });
    expect(r('#/repertoire/browse', 4)).toEqual({ page: 'openings', mode: 'browse' });
    expect(r('#/openings', 3)).toEqual({ page: 'openings', mode: 'white' });
  });
});

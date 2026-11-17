import { useEffect, useRef, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const DESKTOP_QUERY = '(min-width: 1024px)';

export type Page = 'play' | 'openings' | 'tactics' | 'review' | 'about';
export type OpeningsMode = 'white' | 'black' | 'browse';

export interface Route {
  page: Page;
  /** Trainer sub-view, or null when the URL names none. */
  mode: OpeningsMode | null;
}

export function parseHash(hash: string): Route {
  const [page, sub] = hash.replace(/^#\/?/, '').split('/');
  const mode = sub === 'white' || sub === 'black' || sub === 'browse' ? sub : null;
  switch (page) {
    case 'tactics':
    case 'review':
    case 'about':
      return { page, mode: null };
    case 'openings':
    case 'repertoire': // older name of the trainer tab
      return { page: 'openings', mode: mode ?? 'white' };
    default:
      return { page: 'play', mode };
  }
}

export function routeHref(page: Page, mode?: OpeningsMode | null): string {
  return mode && (page === 'play' || page === 'openings') ? `#/${page}/${mode}` : `#/${page}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

/**
 * Global single-key shortcuts (f, h, s, arrows). Ignored while typing in a field or with modifiers.
 * The handler map can change every render; the listener is installed once.
 */
export function useKeys(handlers: Record<string, (() => void) | undefined>): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const fn = ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Re-render on a timer, for "due in N min" style labels. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

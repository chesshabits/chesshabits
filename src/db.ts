import Dexie, { type Table } from 'dexie';
import type { CardRecord } from './trainer/session';
import type { Rating } from './trainer/srs';

/** One graded repertoire move. `scheduled` = it changed the card's schedule (new, due, or a miss). */
export interface ReviewRecord {
  id?: number;
  deck: string;
  cardId: string;
  at: number;
  rating: Rating;
  scheduled: boolean;
  wasNew: boolean;
}

/** Tactics progress per puzzle. */
export interface PuzzleRecord {
  id: string;
  level: number;
  attempts: number;
  /** Solved without a mistake or help on the first attempt. */
  firstTry: boolean;
  solved: number;
  lastAt: number;
  lastResult: 'solved' | 'failed';
}

/** A finished game against the bot (play tab), for Review later. */
export interface GameRecord {
  id?: number;
  level: number;
  userColor: 'white' | 'black';
  botElo: number;
  /** "5+0", or null when played without a clock. */
  timeControl: string | null;
  takebacksAllowed: boolean;
  takebacks: number;
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: string;
  pgn: string;
  startedAt: number;
  endedAt: number;
}

class ChessHabitsDB extends Dexie {
  cards!: Table<CardRecord, string>;
  reviews!: Table<ReviewRecord, number>;
  puzzles!: Table<PuzzleRecord, string>;
  games!: Table<GameRecord, number>;

  constructor() {
    super('chesshabits');
    this.version(1).stores({
      cards: 'id, deck, due',
      reviews: '++id, deck, at, cardId',
      puzzles: 'id, level, lastAt',
    });
    this.version(2).stores({ games: '++id, endedAt, level' });
  }
}

/** Storage used by the trainers. IndexedDB via Dexie, or memory if IndexedDB is unavailable. */
export interface Store {
  cards(deck: string): Promise<CardRecord[]>;
  putCard(card: CardRecord): Promise<void>;
  addReview(review: ReviewRecord): Promise<void>;
  reviewsSince(deck: string, since: number): Promise<ReviewRecord[]>;
  puzzles(level: number): Promise<PuzzleRecord[]>;
  putPuzzle(p: PuzzleRecord): Promise<void>;
  addGame(g: GameRecord): Promise<void>;
}

function memoryStore(): Store {
  const cards = new Map<string, CardRecord>();
  const reviews: ReviewRecord[] = [];
  const puzzles = new Map<string, PuzzleRecord>();
  const games: GameRecord[] = [];
  return {
    cards: async (deck) => [...cards.values()].filter((c) => c.deck === deck),
    putCard: async (card) => void cards.set(card.id, card),
    addReview: async (r) => void reviews.push(r),
    reviewsSince: async (deck, since) => reviews.filter((r) => r.deck === deck && r.at >= since),
    puzzles: async (level) => [...puzzles.values()].filter((p) => p.level === level),
    putPuzzle: async (p) => void puzzles.set(p.id, p),
    addGame: async (g) => void games.push(g),
  };
}

function dexieStore(db: ChessHabitsDB): Store {
  return {
    cards: (deck) => db.cards.where('deck').equals(deck).toArray(),
    putCard: async (card) => void (await db.cards.put(card)),
    addReview: async (r) => void (await db.reviews.add(r)),
    reviewsSince: (deck, since) =>
      db.reviews
        .where('at')
        .aboveOrEqual(since)
        .filter((r) => r.deck === deck)
        .toArray(),
    puzzles: (level) => db.puzzles.where('level').equals(level).toArray(),
    putPuzzle: async (p) => void (await db.puzzles.put(p)),
    addGame: async (g) => void (await db.games.add(g)),
  };
}

let storePromise: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  storePromise ??= (async () => {
    try {
      const db = new ChessHabitsDB();
      await db.open();
      return dexieStore(db);
    } catch {
      // Private mode or blocked site data: progress lasts for this visit only.
      return memoryStore();
    }
  })();
  return storePromise;
}

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

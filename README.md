# Chess Habits

A free, open-source web app for training good chess habits and a simple, level-based opening repertoire. Drills are inspired by the Building Habits series.

Everything runs in the browser: no accounts, no backend. Progress is stored locally (IndexedDB).

## What's in it

The top tabs follow your level:

| Level | Tabs |
|---|---|
| 1 | play · free pieces · review · about |
| 2 | play · tactics · review · about |
| 3–4 | play · openings · tactics · review · about |

- **Repertoire trainer** (under "play" at Levels 1–2, "openings" at 3–4; white / black / browse lines): the app plays the opponent's replies from the series games (weighted by how often each was played); you play the repertoire move. Wrong moves show the right one with a short reason; a sound move from another level counts as "not our line". Levels 1–2 use a simple practice mode (misses come back later in the session); Levels 3–4 schedule each position with spaced repetition (SM-2). Set per level in `data/levels/level-N.json` (`trainer.spacedRepetition`).
- **Tactics / free pieces** (`#/tactics`): Lichess puzzles from the repertoire's lines, solved from our side, filtered by the level's themes and rating range. Level 1 drills only free pieces: take a free piece, or save your own hanging piece. Puzzles can be retried, stepped through move by move, and played on freely (both sides) once finished; a "recent" list reopens earlier ones.
- **Play** against a bot (Levels 3–4 show a placeholder): coming next.
- **Level habits**: the habits and restrictions for each level, from `data/levels/level-N.json`.

Opening names appear from Level 3, where openings become one of the habits.

Keyboard: `f` flip, `h` hint, `s` skip, `r` try a puzzle again, `←`/`→` step through moves (`Home`/`End` for first/latest), `n`/`Enter` next.

## Development

Requires Node.js 22.18+ (the data scripts run TypeScript directly).

```bash
npm install
npm run dev        # start the dev server
npm test           # run unit tests (Vitest)
npm run typecheck  # type-check the app and the scripts
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## Data

| File | What | How it's made |
|---|---|---|
| `data/repertoire-data.json` | opening trees per level and color | from the series games (see SPEC) |
| `data/repertoire-overrides.json` | manual edits on top of the trees | by hand |
| `data/repertoire-notes.json` | short reasons for key repertoire moves | by hand |
| `data/habits.json`, `data/levels/level-N.json` | habit catalog and per-level config | by hand |
| `data/openings.json` | opening names for every line, and each level's puzzle opening tags | `npm run data:openings` |
| `data/tactics/level-N.json` | the shipped puzzle subset (1000 per level) | `npm run data:tactics` |

`npm run data:tactics` downloads the Lichess puzzle database (about 300 MB, CC0) once into `.cache/` (gitignored) and streams it through the filter in `scripts/lib/puzzles.ts`. It needs the `zstd` command-line tool (falls back to Node's built-in zstd).

## License

[GPL-3.0](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and on the app's About page.

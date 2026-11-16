# Chess Habits

A free, open-source web app for training good chess habits and a simple, level-based opening repertoire. Drills are inspired by the Building Habits series.

Everything runs in the browser: no accounts, no backend.

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev        # start the dev server
npm test           # run unit tests (Vitest)
npm run typecheck  # type-check with tsc
npm run build      # production build into dist/
npm run preview    # serve the production build
```

Opening-tree data lives in `data/repertoire-data.json`.

## License

[GPL-3.0](LICENSE). Third-party notices are listed on the app's About page.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Serve (dev) and emit (build) the single-threaded Stockfish WASM build at /stockfish/, straight
 * from node_modules. The worker script loads the .wasm sitting next to it, so the names must stay
 * as they are (no hashing). Loaded only when a game against the bot leaves the book.
 */
const STOCKFISH_FILES = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

function stockfish(): Plugin {
  const dir = join(dirname(createRequire(import.meta.url).resolve('stockfish/package.json')), 'bin');
  const types: Record<string, string> = { js: 'text/javascript', wasm: 'application/wasm' };
  return {
    name: 'chesshabits-stockfish',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/\/stockfish\/([\w.-]+)$/)?.[1];
        if (!name || !STOCKFISH_FILES.includes(name)) return next();
        res.setHeader('Content-Type', types[name.split('.').pop()!]);
        res.end(readFileSync(join(dir, name)));
      });
    },
    generateBundle() {
      for (const name of STOCKFISH_FILES) {
        this.emitFile({ type: 'asset', fileName: `stockfish/${name}`, source: readFileSync(join(dir, name)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), stockfish()],
  test: {
    environment: 'node',
  },
});

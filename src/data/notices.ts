/** Third-party software and data shipped with the app (also in THIRD_PARTY_NOTICES.md). */
export const NOTICES = [
  { name: 'chessground', what: 'chess board', license: 'GPL-3.0', url: 'https://github.com/lichess-org/chessground' },
  { name: 'cburnett pieces', what: 'piece set by Colin M.L. Burnett', license: 'GPL-2.0-or-later', url: 'https://github.com/lichess-org/lila/blob/master/COPYING.md' },
  { name: 'chess.js', what: 'move rules', license: 'BSD-2-Clause', url: 'https://github.com/jhlywa/chess.js' },
  { name: 'Lichess puzzle database', what: 'tactics puzzles', license: 'CC0-1.0', url: 'https://database.lichess.org/#puzzles' },
  { name: 'Lichess chess-openings', what: 'opening names', license: 'CC0-1.0', url: 'https://github.com/lichess-org/chess-openings' },
  { name: 'React', what: 'UI', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'Dexie.js', what: 'browser storage', license: 'Apache-2.0', url: 'https://github.com/dexie/Dexie.js' },
  { name: 'JetBrains Mono', what: 'typeface', license: 'OFL-1.1', url: 'https://github.com/JetBrains/JetBrainsMono' },
  { name: 'Inter', what: 'typeface', license: 'OFL-1.1', url: 'https://github.com/rsms/inter' },
  { name: 'Stockfish', what: 'engine (planned, not shipped yet)', license: 'GPL-3.0', url: 'https://github.com/official-stockfish/Stockfish' },
] as const;

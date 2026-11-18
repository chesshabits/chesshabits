/**
 * Bot strength. Stockfish's UCI_LimitStrength only goes down to about 1320 Elo, so below that we
 * weaken it ourselves: a low Skill Level and depth, several candidate lines (MultiPV), and a
 * random pick among them that favours the better moves less the lower the setting. That gives
 * realistic mistakes (a reasonable-looking but worse move, now and then a real blunder) instead of
 * random nonsense.
 */

export const ELO_MIN = 400;
export const ELO_MAX = 2000;
export const ELO_STEP = 100;
/** Stockfish's own strength limiter works from here up. */
export const LIMIT_STRENGTH_MIN = 1350;

export interface EngineSettings {
  elo: number;
  /** Use UCI_LimitStrength + UCI_Elo (strong settings). */
  limitStrength: boolean;
  /** Stockfish "Skill Level", 0-20. */
  skill: number;
  depth: number;
  movetimeMs: number;
  /** Candidate lines to ask for. */
  multipv: number;
  /** Softmax temperature in centipawns: higher = picks worse candidates more often. */
  temperatureCp: number;
  /** Chance of ignoring the scores and picking any candidate. */
  blunderChance: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function clampElo(elo: number): number {
  const stepped = Math.round(elo / ELO_STEP) * ELO_STEP;
  return Math.min(ELO_MAX, Math.max(ELO_MIN, stepped));
}

export function engineSettings(eloIn: number): EngineSettings {
  const elo = clampElo(eloIn);
  if (elo >= LIMIT_STRENGTH_MIN) {
    return {
      elo,
      limitStrength: true,
      skill: 20,
      depth: 12,
      movetimeMs: 400,
      multipv: 1,
      temperatureCp: 0,
      blunderChance: 0,
    };
  }
  // 400 -> 0, 1300 -> 1 across the weak range.
  const t = (elo - ELO_MIN) / (LIMIT_STRENGTH_MIN - ELO_STEP - ELO_MIN);
  return {
    elo,
    limitStrength: false,
    skill: Math.round(lerp(0, 8, t)),
    depth: Math.round(lerp(1, 6, t)),
    movetimeMs: Math.round(lerp(50, 250, t)),
    multipv: t < 0.5 ? 5 : 4,
    temperatureCp: Math.round(lerp(220, 60, t)),
    blunderChance: Number(lerp(0.15, 0.03, t).toFixed(3)),
  };
}

export interface Candidate {
  /** UCI move. */
  move: string;
  /** Score in centipawns from the engine's side (mates mapped to ±10000). */
  cp: number;
}

/** Pick the bot's move from the engine's candidate lines. `rand` returns [0, 1). */
export function chooseMove(candidates: readonly Candidate[], s: EngineSettings, rand: () => number = Math.random): string {
  if (candidates.length === 0) throw new Error('no candidate moves');
  const sorted = [...candidates].sort((a, b) => b.cp - a.cp);
  if (s.limitStrength || s.temperatureCp <= 0 || sorted.length === 1) return sorted[0].move;
  if (rand() < s.blunderChance) return sorted[Math.floor(rand() * sorted.length)].move;
  const best = sorted[0].cp;
  const weights = sorted.map((c) => Math.exp((c.cp - best) / s.temperatureCp));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (let i = 0; i < sorted.length; i++) {
    roll -= weights[i];
    if (roll < 0) return sorted[i].move;
  }
  return sorted[sorted.length - 1].move;
}

/** UCI options and go command for a setting. */
export function uciSetup(s: EngineSettings): { options: [string, string | number | boolean][]; go: string } {
  const options: [string, string | number | boolean][] = s.limitStrength
    ? [
        ['Skill Level', 20],
        ['UCI_LimitStrength', true],
        ['UCI_Elo', s.elo],
        ['MultiPV', 1],
      ]
    : [
        ['UCI_LimitStrength', false],
        ['Skill Level', s.skill],
        ['MultiPV', s.multipv],
      ];
  return { options, go: s.limitStrength ? `go movetime ${s.movetimeMs}` : `go depth ${s.depth} movetime ${s.movetimeMs}` };
}

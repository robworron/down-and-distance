// The statistics behind the splits table: rates and means with 95%
// confidence intervals, and the shrunk win % from notebook 06. Pure functions
// of the marts' sums and counts, so any season range gives exact figures.

/** A 95% confidence interval. */
export type Interval = { low: number; high: number };

/** A figure with its 95% CI (null when there are too few games for one). */
export type Estimate = { value: number; ci: Interval | null };

const Z = 1.96; // the normal distribution's 97.5th percentile

/**
 * The Wilson score interval for a proportion: successes out of n. Unlike the
 * textbook p ± 1.96·√(p(1−p)/n), it stays inside 0–1 and still has a width at
 * 2–0 (where the textbook interval collapses to 100% ± 0). Successes may be
 * fractional (a tie is half a win).
 */
export function wilson(successes: number, n: number, z = Z): Interval | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const halfWidth = (z / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { low: Math.max(0, centre - halfWidth), high: Math.min(1, centre + halfWidth) };
}

/** Win % = (W + ½T) / n, the NFL standings definition, with its Wilson CI. */
export function winPctEstimate(t: { games: number; wins: number; ties: number }): Estimate | null {
  if (t.games === 0) return null;
  const score = t.wins + t.ties / 2;
  return { value: score / t.games, ci: wilson(score, t.games) };
}

/** Over % = overs / (games with a total − pushes): pushes are neither. */
export function overPctEstimate(t: { ouGames: number; overs: number; ouPushes: number }): Estimate | null {
  const decided = t.ouGames - t.ouPushes;
  if (decided <= 0) return null;
  return { value: t.overs / decided, ci: wilson(t.overs, decided) };
}

// Student's t, 97.5th percentile, for 1–30 degrees of freedom.
const T_975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11,
  2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

/**
 * Student's t 97.5th percentile. Small samples need a wider interval than the
 * normal's 1.96, because their SD is itself uncertain. Above 30 degrees of
 * freedom, the Cornish–Fisher expansion (accurate to 0.001 there) closes the
 * remaining gap to 1.96 smoothly: 2.000 at 60, 1.980 at 120.
 */
export function tQuantile975(df: number): number {
  if (df < 1) return NaN;
  if (df <= 30) return T_975[Math.floor(df) - 1];
  const z = Z;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
}

/**
 * A mean per game from a sum, a sum of squares and n, with its t interval.
 * SD = √((Σx² − n·mean²) / (n − 1)); CI = mean ± t(0.975, n − 1)·SD/√n.
 * One game gives a mean but no interval.
 */
export function meanEstimate(sum: number, sumSq: number, n: number): Estimate | null {
  if (n <= 0) return null;
  const mean = sum / n;
  if (n < 2) return { value: mean, ci: null };
  // max(0, ...) guards against a tiny negative from floating-point rounding.
  const sd = Math.sqrt(Math.max(0, (sumSq - n * mean * mean) / (n - 1)));
  const half = (tQuantile975(n - 1) * sd) / Math.sqrt(n);
  return { value: mean, ci: { low: mean - half, high: mean + half } };
}

/**
 * Below this many games a margin or game-total interval is left out ("too
 * few games for a range"): with 2 games, t is 12.7 and a margin's interval
 * can run from −266 to +305 points. Win % (Wilson) intervals are unaffected.
 */
export const MIN_GAMES_FOR_INTERVAL = 3;

/** A mean's estimate with its interval dropped below MIN_GAMES_FOR_INTERVAL games. */
export function smallSampleRule(e: Estimate | null, n: number): Estimate | null {
  return e && n < MIN_GAMES_FOR_INTERVAL ? { value: e.value, ci: null } : e;
}

/** One team's games in one value, for the league split. */
export type TeamSplit = { games: number; winPct: number; teamWinPct: number };

/**
 * The league's split for a value: every team's (win % in the value − its
 * overall win %), weighted by its games in the value. It's what the value
 * does to a typical team, with team quality taken out.
 */
export function leagueSplit(splits: TeamSplit[]): number | null {
  let weighted = 0;
  let games = 0;
  for (const s of splits) {
    weighted += s.games * (s.winPct - s.teamWinPct);
    games += s.games;
  }
  return games === 0 ? null : weighted / games;
}

/**
 * The shrunk win % (notebook 06): start from the team's overall win % plus
 * the league's split for the value, then add a share w = n / (n + k) of the
 * team's own split (what's left after the league's). k is the situation's
 * shrinkage strength in games, so 10 games against k = 120 keep 8%.
 */
export function shrunkWinPct(s: TeamSplit & { leagueSplit: number; k: number }): { value: number; weight: number } {
  const own = s.winPct - s.teamWinPct - s.leagueSplit;
  const weight = s.games / (s.games + s.k);
  return { value: s.teamWinPct + s.leagueSplit + weight * own, weight };
}

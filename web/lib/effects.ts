// The league-wide effects of the featured situations, as the team situation analysis measured
// them (docs/findings.md): over the regular seasons 1999–2025, computed from
// mart_league_splits' summed counts. Pure, so it's unit-tested without a
// database; transform/tests/featured_effects_match_findings.sql pins the
// same numbers in SQL.

import type { SeasonLeagueSums } from "./queries";
import { sampleMeanEstimate, winPctEstimate, type Estimate } from "./stats";

/** The analysis seasons: every finished regular season when the verdicts were set. */
export const EFFECT_SEASONS: [number, number] = [1999, 2025];

/** The featured situations: three that are the same for both teams, one that differs. */
export const FEATURED_GAME_KEYS = ["precipitation", "wind", "roof"];
export const FEATURED_TEAM_KEYS = ["rest_advantage"];

export type PointsEffect = {
  kind: "points";
  /** Games (each counted once). */
  games: number;
  /** Points per game against that season's average game: the season-adjusted total. */
  effect: Estimate;
  /** Over % minus the league's over % over the same seasons (percentage points as a fraction). */
  overDiff: number | null;
};

export type WinEffect = { kind: "win"; games: number; winPct: Estimate; margin: Estimate | null };

export type FeaturedEffect = PointsEffect | WinEffect;

const id = (key: string, value: string) => `${key}|${value}`;

/**
 * Every featured value's effect.
 *
 * Game-level values (weather, roof): each game's total minus its own
 * season's average game total, averaged over the value's games. Rising
 * scoring and the move to domes then aren't mistaken for the situation.
 * From per-season sums: with n games, Σx their totals, Σx² the squares and
 * m the season mean, the season's deviations sum to Σx − n·m and their
 * squares to Σx² − 2m·Σx + n·m², which add up across seasons. League rows
 * count each game once per team, so the value's sums are halved.
 *
 * Rest advantage (it differs by team, and one side's "less" is the other's
 * "more"): the plain win % and margin of the side with the value, as
 * findings.md reports it (3+ days less rest: 48.4%, −1.0 a game).
 */
export function featuredEffects(rows: SeasonLeagueSums[]): Map<string, FeaturedEffect> {
  // Each season's average game, and the league's over % across the seasons.
  const seasonMean = new Map<number, number>();
  const venueBySeason = new Map<number, { games: number; points: number }>();
  let overs = 0;
  let decided = 0;
  for (const r of rows) {
    if (r.situationKey !== "venue") continue;
    const v = venueBySeason.get(r.season) ?? { games: 0, points: 0 };
    v.games += r.games;
    v.points += r.pointsFor + r.pointsAgainst;
    venueBySeason.set(r.season, v);
    overs += r.overs;
    decided += r.ouGames - r.ouPushes;
  }
  // Points over team-games is points per game: both are counted twice.
  for (const [season, v] of venueBySeason) seasonMean.set(season, v.points / v.games);
  const leagueOver = decided > 0 ? overs / decided : null;

  const out = new Map<string, FeaturedEffect>();
  const byValue = new Map<string, SeasonLeagueSums[]>();
  for (const r of rows) {
    if (r.situationKey === "venue") continue;
    const k = id(r.situationKey, r.situationValue);
    byValue.set(k, [...(byValue.get(k) ?? []), r]);
  }

  for (const [k, seasons] of byValue) {
    const [key] = k.split("|");
    if (FEATURED_GAME_KEYS.includes(key)) {
      let n = 0;
      let dev = 0;
      let devSq = 0;
      let vOvers = 0;
      let vDecided = 0;
      for (const r of seasons) {
        const m = seasonMean.get(r.season);
        if (m === undefined) continue;
        const games = r.games / 2;
        const sx = (r.pointsFor + r.pointsAgainst) / 2;
        const sxx = r.totalPointsSq / 2;
        n += games;
        dev += sx - games * m;
        devSq += sxx - 2 * m * sx + games * m * m;
        vOvers += r.overs / 2;
        vDecided += (r.ouGames - r.ouPushes) / 2;
      }
      const effect = sampleMeanEstimate(dev, devSq, n);
      if (!effect) continue;
      out.set(k, {
        kind: "points",
        games: n,
        effect,
        overDiff: vDecided > 0 && leagueOver !== null ? vOvers / vDecided - leagueOver : null,
      });
    } else if (FEATURED_TEAM_KEYS.includes(key)) {
      const s = seasons.reduce(
        (a, r) => ({
          games: a.games + r.games,
          wins: a.wins + r.wins,
          ties: a.ties + r.ties,
          margin: a.margin + r.pointsFor - r.pointsAgainst,
          marginSq: a.marginSq + r.marginSq,
        }),
        { games: 0, wins: 0, ties: 0, margin: 0, marginSq: 0 },
      );
      const winPct = winPctEstimate(s);
      if (!winPct) continue;
      out.set(k, { kind: "win", games: s.games, winPct, margin: sampleMeanEstimate(s.margin, s.marginSq, s.games) });
    }
  }
  return out;
}

export const effectId = id;

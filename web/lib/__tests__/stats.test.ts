import { describe, expect, it } from "vitest";

import {
  leagueSplit,
  meanEstimate,
  MIN_GAMES_FOR_INTERVAL,
  overPctEstimate,
  sampleMeanEstimate,
  shrunkWinPct,
  tQuantile975,
  wilson,
  winPctEstimate,
} from "../stats";

describe("wilson", () => {
  it("matches the textbook value", () => {
    // 8 of 10: Wilson 95% interval [0.4902, 0.9433].
    const ci = wilson(8, 10)!;
    expect(ci.low).toBeCloseTo(0.4902, 4);
    expect(ci.high).toBeCloseTo(0.9433, 4);
  });

  it("keeps a width at 2-0 and stays inside 0-100%", () => {
    const ci = wilson(2, 2)!;
    expect(ci.high).toBe(1);
    expect(ci.low).toBeCloseTo(0.3424, 4);
    expect(wilson(0, 3)!.low).toBe(0);
  });

  it("has no interval with no games", () => {
    expect(wilson(0, 0)).toBeNull();
  });
});

describe("win % and over %", () => {
  it("counts a tie as half a win", () => {
    expect(winPctEstimate({ games: 17, wins: 8, ties: 1 })!.value).toBe(0.5);
    expect(winPctEstimate({ games: 0, wins: 0, ties: 0 })).toBeNull();
  });

  it("leaves pushes out of over %", () => {
    expect(overPctEstimate({ ouGames: 10, overs: 4, ouPushes: 2 })!.value).toBe(0.5);
    expect(overPctEstimate({ ouGames: 2, overs: 0, ouPushes: 2 })).toBeNull();
  });
});

describe("tQuantile975", () => {
  it("uses the table up to 30 and approaches 1.96 after", () => {
    expect(tQuantile975(1)).toBe(12.706);
    expect(tQuantile975(30)).toBe(2.042);
    expect(tQuantile975(31)).toBeCloseTo(2.0395, 3);
    expect(tQuantile975(60)).toBeCloseTo(2.0003, 3);
    expect(tQuantile975(120)).toBeCloseTo(1.9799, 3);
    expect(tQuantile975(100000)).toBeCloseTo(1.96, 3);
  });
});

describe("meanEstimate", () => {
  it("gives the sample SD from the sum of squares", () => {
    // Margins 3, -7, 10, 14: mean 5, sample SD 9.2014; t(3) = 3.182.
    const xs = [3, -7, 10, 14];
    const sum = xs.reduce((a, b) => a + b, 0);
    const sumSq = xs.reduce((a, b) => a + b * b, 0);
    const e = meanEstimate(sum, sumSq, xs.length)!;
    expect(e.value).toBe(5);
    const half = (3.182 * 9.2014) / 2;
    expect(e.ci!.low).toBeCloseTo(5 - half, 3);
    expect(e.ci!.high).toBeCloseTo(5 + half, 3);
  });

  it("has a mean but no interval for one game, and nothing for none", () => {
    expect(meanEstimate(7, 49, 1)).toEqual({ value: 7, ci: null });
    expect(meanEstimate(0, 0, 0)).toBeNull();
  });
});

describe("the small-sample rule", () => {
  // Margins 3 and -7 (2 games), then 3, -7 and 10 (3 games).
  it("keeps the mean but drops the interval below 3 games", () => {
    expect(MIN_GAMES_FOR_INTERVAL).toBe(3);
    expect(meanEstimate(-4, 58, 2)!.ci).not.toBeNull();
    expect(sampleMeanEstimate(-4, 58, 2)).toEqual({ value: -2, ci: null });
    expect(sampleMeanEstimate(7, 49, 1)).toEqual({ value: 7, ci: null });
  });

  it("keeps the interval from 3 games", () => {
    expect(sampleMeanEstimate(6, 158, 3)).toEqual(meanEstimate(6, 158, 3));
    expect(sampleMeanEstimate(6, 158, 3)!.ci).not.toBeNull();
  });

  it("gives nothing for no games", () => {
    expect(sampleMeanEstimate(0, 0, 0)).toBeNull();
  });
});

describe("shrinkage", () => {
  it("weights the league split by games", () => {
    // Two teams: +0.2 over 3 games and -0.1 over 1 game -> (0.6 - 0.1) / 4.
    expect(
      leagueSplit([
        { games: 3, winPct: 0.7, teamWinPct: 0.5 },
        { games: 1, winPct: 0.4, teamWinPct: 0.5 },
      ]),
    ).toBeCloseTo(0.125, 10);
    expect(leagueSplit([])).toBeNull();
  });

  it("reproduces notebook 06's worked example", () => {
    // Las Vegas, light rain, 2023-2025 regular season: 2-0 while 15-36
    // overall. The league's light-rain split over those seasons is
    // -0.940% (120 team-games, 30 teams); k = 120.
    const s = shrunkWinPct({ games: 2, winPct: 1, teamWinPct: 15 / 51, leagueSplit: -0.0093954248366013, k: 120 });
    expect(s.weight).toBeCloseTo(2 / 122, 10); // 1.6%
    expect(s.value).toBeCloseTo(0.29645, 5); // 29.6%
  });

  it("gives the raw split full weight as games grow without bound", () => {
    const s = shrunkWinPct({ games: 1e9, winPct: 0.9, teamWinPct: 0.5, leagueSplit: 0.05, k: 120 });
    expect(s.value).toBeCloseTo(0.9, 6);
  });
});

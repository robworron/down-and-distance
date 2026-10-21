import { describe, expect, it } from "vitest";

import {
  defaultRange,
  formatRecord,
  marginPerGame,
  playoffOutcome,
  regularSeasonTotal,
  sumTallies,
  winPct,
  type SeasonRecord,
  type Tally,
} from "../records";

const tally = (wins: number, losses: number, ties: number, pointsFor: number, pointsAgainst: number): Tally => ({
  games: wins + losses + ties,
  wins,
  losses,
  ties,
  pointsFor,
  pointsAgainst,
});

const season = (year: number, regular: Tally): SeasonRecord => ({
  season: year,
  regular,
  playoffs: { wins: 0, losses: 0, ties: 0 },
  lastPlayoffGame: null,
  gamesLeft: 0,
});

describe("winPct", () => {
  it("counts a tie as half a win (NFL standings)", () => {
    // Washington 2022: 8-8-1 is .500.
    expect(winPct(tally(8, 8, 1, 0, 0))).toBe(0.5);
    expect(winPct(tally(13, 3, 0, 0, 0))).toBe(13 / 16);
  });

  it("is null with no games, not 0%", () => {
    expect(winPct(tally(0, 0, 0, 0, 0))).toBeNull();
  });
});

describe("combining seasons", () => {
  const records = [season(2024, tally(13, 4, 0, 525, 368)), season(2023, tally(11, 6, 0, 451, 311)), season(2022, tally(13, 3, 0, 455, 286))];

  it("adds counts, so a 16-game season weighs less than a 17-game one", () => {
    const total = regularSeasonTotal(records, 2022, 2024);
    expect(total).toEqual(tally(37, 13, 0, 1431, 965));
    // 37/50 = .740, not the average of the three seasons' rates (.744).
    expect(winPct(total)).toBeCloseTo(0.74, 10);
    const averageOfRates = (13 / 17 + 11 / 17 + 13 / 16) / 3;
    expect(winPct(total)).not.toBeCloseTo(averageOfRates, 3);
  });

  it("keeps only the seasons in range, inclusive", () => {
    expect(regularSeasonTotal(records, 2023, 2024).games).toBe(34);
    expect(regularSeasonTotal(records, 2030, 2031)).toEqual(sumTallies([]));
  });

  it("works out margin per game from summed points", () => {
    expect(marginPerGame(tally(1, 1, 0, 30, 20))).toBe(5);
    expect(marginPerGame(tally(0, 0, 0, 0, 0))).toBeNull();
  });

  it("defaults to the latest season and the two before it", () => {
    expect(defaultRange(2026)).toEqual([2024, 2026]);
  });
});

describe("formatting", () => {
  it("shows ties only when there were any", () => {
    expect(formatRecord(tally(13, 4, 0, 0, 0))).toBe("13–4");
    expect(formatRecord(tally(8, 7, 1, 0, 0))).toBe("8–7–1");
  });

  it("names how the playoffs ended", () => {
    expect(playoffOutcome(null)).toBeNull();
    expect(playoffOutcome({ round: "SB", result: "win" })).toBe("Won Super Bowl");
    expect(playoffOutcome({ round: "SB", result: "loss" })).toBe("Lost Super Bowl");
    expect(playoffOutcome({ round: "DIV", result: "loss" })).toBe("Lost divisional round");
    expect(playoffOutcome({ round: "WC", result: "loss" })).toBe("Lost wild-card round");
  });
});

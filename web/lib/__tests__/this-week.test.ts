import { describe, expect, it } from "vitest";

import { featuredEffects } from "../effects";
import type { SeasonLeagueSums, Situation, WeekRow } from "../queries";
import { buildThisWeek, clock, effectSentence, kickoffText, spreadText, weatherStatus } from "../this-week";

const sums = (season: number, key: string, value: string, games: number, totals: number[], extra: Partial<SeasonLeagueSums> = {}): SeasonLeagueSums => {
  // League rows count each game once per team, so a game's total appears twice.
  const sum = totals.reduce((a, b) => a + b, 0);
  return {
    season,
    situationKey: key,
    situationValue: value,
    games,
    wins: 0,
    ties: 0,
    pointsFor: sum,
    pointsAgainst: sum,
    marginSq: 0,
    totalPointsSq: 2 * totals.reduce((a, b) => a + b * b, 0),
    ouGames: games,
    overs: 0,
    ouPushes: 0,
    ...extra,
  };
};

describe("featuredEffects", () => {
  it("compares each game with its own season's average game (the season-adjusted total)", () => {
    // Season 1 averages 40 points, season 2 averages 50. Heavy-rain games: 34 in
    // season 1 (−6) and 46, 48 in season 2 (−4, −2): mean −4.0, not 42.7 − 45.
    // Venue rows: 4 games a season seen from both sides (8 team-games); points
    // for plus against over team-games is the average game total.
    const venue = (season: number, mean: number) => ({
      ...sums(season, "venue", "home", 8, []),
      pointsFor: 4 * mean,
      pointsAgainst: 4 * mean,
    });
    const rows = [
      venue(2001, 40),
      venue(2002, 50),
      sums(2001, "precipitation", "heavy_rain", 2, [34]),
      sums(2002, "precipitation", "heavy_rain", 4, [46, 48]),
    ];
    const e = featuredEffects(rows).get("precipitation|heavy_rain");
    expect(e?.kind).toBe("points");
    if (e?.kind !== "points") return;
    expect(e.games).toBe(3);
    expect(e.effect.value).toBeCloseTo(-4);
    // SD of (−6, −4, −2) is 2; t(2) = 4.303: half-width 4.303 × 2 / √3.
    expect(e.effect.ci!.high - e.effect.value).toBeCloseTo((4.303 * 2) / Math.sqrt(3), 2);
  });

  it("reports rest advantage as the plain win % and margin of the side with it", () => {
    const rows = [sums(2001, "rest_advantage", "less_rest", 10, [], { wins: 4, ties: 1, pointsFor: 200, pointsAgainst: 220, marginSq: 1000 })];
    const e = featuredEffects(rows).get("rest_advantage|less_rest");
    expect(e).toMatchObject({ kind: "win", games: 10 });
    if (e?.kind === "win") {
      expect(e.winPct.value).toBeCloseTo(0.45);
      expect(e.margin!.value).toBeCloseTo(-2);
    }
  });
});

describe("formatting", () => {
  it("writes Eastern kickoffs and clock times plainly", () => {
    expect(kickoffText("2026-10-18", "2026-10-18 13:00:00")).toBe("Sun Oct 18, 1:00 pm ET");
    expect(kickoffText("2026-10-19", "2026-10-19 20:15:00")).toBe("Mon Oct 19, 8:15 pm ET");
    expect(clock("09:30:00")).toBe("9:30 am");
    expect(clock("12:05:00")).toBe("12:05 pm");
  });

  it("names the favourite from the home team's line", () => {
    const home = { team: "CLE", teamSpread: 3 } as WeekRow;
    const away = { team: "BAL", teamSpread: -3 } as WeekRow;
    expect(spreadText(home, away)).toBe("BAL favoured by 3");
    expect(spreadText({ ...home, teamSpread: 0 }, away)).toBe("Pick'em");
    expect(spreadText({ ...home, teamSpread: null }, away)).toBe("No line yet");
  });

  it("phrases the featured effects, and says even rest has no edge", () => {
    expect(effectSentence("rest_advantage", "even", "Within 2 days", undefined)?.text).toBe("No rest edge either way.");
    const dome = effectSentence("roof", "dome", "Dome", { kind: "points", games: 1138, effect: { value: 2.84, ci: { low: 2.0, high: 3.6 } }, overDiff: 0.022 });
    expect(dome?.text).toBe("Dome: 2.8 more points a game than the average game (1,138 games, 1999–2025).");
    expect(dome?.detail).toBe("95% CI +2.0 to +3.6 points; over % +2.2 points against the league");
  });
});

const labels = new Map([
  ["precipitation", new Map([["light_rain", "Light rain"]])],
  ["wind", new Map([["15_plus", "15+ mph"]])],
  ["temperature", new Map([["33_to_50", "33–50°F"]])],
]);

const row = (over: Partial<WeekRow>): WeekRow => ({
  gameId: "2026_06_BAL_CLE",
  season: 2026,
  week: 6,
  gameType: "REG",
  gameday: "2026-10-18",
  kickoffEt: "2026-10-18 13:00:00",
  team: "CLE",
  opponent: "BAL",
  isHome: true,
  venue: "home",
  isFinished: false,
  pointsFor: null,
  pointsAgainst: null,
  restDays: 7,
  restBucket: "normal",
  restAdvantage: "even",
  teamSpread: 3,
  spreadRole: "underdog",
  timeZoneShift: 0,
  timeZoneTravel: "none",
  bodyClockTime: "13:00:00",
  bodyClock: "afternoon",
  roofType: "outdoors",
  isOpenAir: true,
  timeSlot: "sunday_early",
  temperatureBucket: null,
  windBucket: null,
  precipitationBucket: null,
  stadiumName: "Huntington Bank Field",
  city: "Cleveland",
  stadiumRoof: "outdoors",
  ...over,
});

describe("weatherStatus", () => {
  it("says what can be known before forecasts are loaded", () => {
    expect(weatherStatus(row({}), labels)).toBe("Forecast not available yet.");
    expect(weatherStatus(row({ roofType: "dome", isOpenAir: false }), labels)).toBe("Indoors: weather doesn't apply.");
    expect(weatherStatus(row({ roofType: null, isOpenAir: false, stadiumRoof: "retractable" }), labels)).toBe(
      "Retractable roof: open or closed is decided on game day.",
    );
    expect(weatherStatus(row({ roofType: "retractable_closed", isFinished: true }), labels)).toBe("Roof closed: weather doesn't apply.");
    expect(weatherStatus(row({ isFinished: true }), labels)).toBe("Recorded weather is added about a week after the game.");
    expect(weatherStatus(row({ isFinished: true, temperatureBucket: "33_to_50", precipitationBucket: "light_rain", windBucket: "15_plus" }), labels)).toBe(
      "33–50°F, Light rain, 15+ mph.",
    );
  });
});

describe("buildThisWeek", () => {
  const situation = (key: string, column: string, level: "game" | "team", tier: Situation["tier"], values: string[]): Situation => ({
    key,
    label: key,
    description: "",
    category: "x",
    level,
    tier,
    column,
    values: values.map((value) => ({ value, label: value.toUpperCase() })),
    sharedValues: [],
    k: 100,
  });
  const SITUATIONS = [
    situation("roof", "roof_type", "game", "featured", ["outdoors", "dome"]),
    situation("rest_advantage", "rest_advantage", "team", "featured", ["less_rest", "even", "more_rest"]),
    situation("time_slot", "time_slot", "game", "filter", ["sunday_early"]),
    situation("venue", "venue", "team", "context", ["home", "away", "neutral"]),
  ];
  const rows = [row({ team: "BAL", opponent: "CLE", isHome: false, venue: "away", teamSpread: -3, spreadRole: "favourite" }), row({})];

  it("builds one card per game, with byes and the week's title", () => {
    const week = buildThisWeek({ rows, situations: SITUATIONS, effects: new Map(), teamSums: [], allTeams: ["BAL", "CLE", "KC"], span: "2024–26", rangeQuery: "" })!;
    expect(week.title).toBe("Week 6");
    expect(week.dates).toBe("Oct 18");
    expect(week.byes).toEqual(["KC"]);
    const g = week.games[0];
    expect([g.away, g.home, g.spread, g.kickoff]).toEqual(["BAL", "CLE", "BAL favoured by 3", "Sun Oct 18, 1:00 pm ET"]);
    expect(g.sharedFeatured.map((l) => [l.key, l.value])).toEqual([
      ["roof", "OUTDOORS"],
      ["weather", "Forecast not available yet."],
    ]);
    expect(g.sides[0].featured[0]).toMatchObject({ key: "rest_advantage", value: "EVEN", effect: { text: "No rest edge either way." } });
    expect(g.sides[1].other.map((l) => l.key)).toEqual(["venue"]);
    // No games for these teams in the fixture's sums: the team line says so and links to the block.
    expect(g.sides[1].featured[0].teams[0]).toEqual({ team: "CLE", text: "CLE, 2024–26: no games here", href: "/teams/cle#situation-rest_advantage" });
  });

  it("names playoff rounds and leaves byes out of them", () => {
    const week = buildThisWeek({
      rows: rows.map((r) => ({ ...r, gameType: "DIV", week: 20 })),
      situations: SITUATIONS,
      effects: new Map(),
      teamSums: [],
      allTeams: ["BAL", "CLE", "KC"],
      span: "2024–26",
      rangeQuery: "",
    })!;
    expect(week.title).toBe("Divisional round");
    expect(week.byes).toEqual([]);
  });

  it("returns nothing when no game is scheduled", () => {
    expect(buildThisWeek({ rows: [], situations: SITUATIONS, effects: new Map(), teamSums: [], allTeams: [], span: "", rangeQuery: "" })).toBeNull();
  });
});

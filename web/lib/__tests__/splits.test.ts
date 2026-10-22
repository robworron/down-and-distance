import { describe, expect, it } from "vitest";

import type { Situation, SplitSums, TeamSplitSums } from "../queries";
import { buildSplits, teamTotal } from "../splits";

const situation = (key: string, level: "game" | "team", values: string[], extra: Partial<Situation> = {}): Situation => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
  description: "",
  category: key === "precipitation" ? "weather" : "venue",
  level,
  tier: "featured",
  column: key,
  values: values.map((value) => ({ value, label: value.toUpperCase() })),
  sharedValues: [],
  k: 100,
  ...extra,
});

const VENUE = situation("venue", "team", ["home", "away", "neutral"], { tier: "context", sharedValues: ["neutral"] });
const PRECIP = situation("precipitation", "game", ["none", "rain"]);

/** One summed row: wins/losses with a margin per game and a total per game (no spread in either). */
function row(
  team: string,
  key: string,
  value: string,
  wins: number,
  losses: number,
  { is2020 = false, margin = 0, total = 40, overs = 0 } = {},
): TeamSplitSums {
  const games = wins + losses;
  return {
    team,
    situationKey: key,
    situationValue: value,
    is2020,
    games,
    wins,
    losses,
    ties: 0,
    pointsFor: (games * (total + margin)) / 2,
    pointsAgainst: (games * (total - margin)) / 2,
    marginSq: games * margin * margin,
    totalPointsSq: games * total * total,
    ouGames: games,
    overs,
    ouPushes: 0,
  };
}

/** The league mart: the teams' rows summed per key, value and 2020 flag. */
function league(rows: TeamSplitSums[]): SplitSums[] {
  const out = new Map<string, SplitSums>();
  for (const teamRow of rows) {
    const r: SplitSums = { ...teamRow };
    delete (r as Partial<TeamSplitSums>).team;
    const id = `${r.situationKey}|${r.situationValue}|${r.is2020}`;
    const prev = out.get(id);
    out.set(
      id,
      prev
        ? (Object.fromEntries(
            Object.entries(prev).map(([k, v]) => [k, typeof v === "number" ? v + (r[k as keyof SplitSums] as number) : v]),
          ) as SplitSums)
        : r,
    );
  }
  return [...out.values()];
}

// Team A: 6-4 overall (2-0 in rain), Team B: 4-6 overall (0-2 in rain). The
// rain rows are the other side of the same two games, so the league counts
// 4 team-games there: 2 games.
const teamSums = [
  row("A", "venue", "home", 4, 1, { margin: 7 }),
  row("A", "venue", "away", 2, 3, { margin: -3 }),
  row("A", "venue", "home", 1, 0, { is2020: true, margin: 3 }),
  row("A", "precipitation", "none", 4, 4),
  row("A", "precipitation", "rain", 2, 0, { total: 30, overs: 0 }),
  row("B", "venue", "home", 3, 2, { margin: 1 }),
  row("B", "venue", "away", 1, 4, { margin: -7 }),
  row("B", "precipitation", "none", 4, 4),
  row("B", "precipitation", "rain", 0, 2, { total: 30, overs: 0 }),
];
const leagueSums = league(teamSums);

const build = (exclude2020: boolean) =>
  buildSplits({ team: "A", situations: [PRECIP, VENUE], teamSums, leagueSums, exclude2020 });

describe("buildSplits", () => {
  it("groups by tier, featured first, and keeps the registry's value order and labels", () => {
    const groups = build(false);
    expect(groups.map((g) => g.tier)).toEqual(["featured", "context"]);
    expect(groups[0].blocks[0].rows.map((r) => [r.value, r.label])).toEqual([
      ["none", "NONE"],
      ["rain", "RAIN"],
    ]);
  });

  it("shrinks with the league split weighted by games", () => {
    const rain = build(false)[0].blocks[0].rows[1];
    // A: overall 7/11 with 2020; rain split +1 - 7/11. B: 4/10; split -0.4.
    const teamWp = 7 / 11;
    const ls = (2 * (1 - teamWp) + 2 * (0 - 0.4)) / 4;
    const w = 2 / 102;
    expect(rain.shrunk!.weight).toBeCloseTo(w, 10);
    expect(rain.shrunk!.value).toBeCloseTo(teamWp + ls + w * (1 - teamWp - ls), 10);
  });

  it("compares a game-level value on scoring, counting each league game once", () => {
    const rain = build(false)[0].blocks[0].rows[1];
    expect(rain.comparison.level).toBe("game");
    if (rain.comparison.level !== "game") return;
    expect(rain.comparison.total!.value).toBe(30);
    expect(rain.comparison.league.n).toBe(2); // 4 team-games
    expect(rain.comparison.league.total!.value).toBe(30);
  });

  it("drops a team's margin and total intervals below 3 games", () => {
    const [none, rain] = build(false)[0].blocks[0].rows;
    // Rain: 2 games. The figures stay; the intervals go.
    expect(rain.n).toBe(2);
    expect(rain.margin).toEqual({ value: 0, ci: null });
    expect(rain.comparison.level === "game" && rain.comparison.total).toEqual({ value: 30, ci: null });
    // Win % keeps its Wilson interval at any n.
    expect(rain.winPct!.ci).not.toBeNull();
    // No rain: 8 games, so both intervals are there.
    expect(none.margin!.ci).not.toBeNull();
    expect(none.comparison.level === "game" && none.comparison.total!.ci).not.toBeNull();
  });

  it("gives no league comparison for a shared value", () => {
    const venue = build(false)[1].blocks[0];
    const [home, , neutral] = venue.rows;
    expect(home.comparison.level === "team" && home.comparison.league?.n).toBe(11);
    expect(neutral.n).toBe(0);
    expect(neutral.winPct).toBeNull();
    expect(neutral.comparison.level === "team" && neutral.comparison.league).toBeNull();
  });

  it("leaves 2020 out of the venue block only", () => {
    const groups = build(true);
    const venue = groups[1].blocks[0];
    expect(venue.without2020).toBe(true);
    expect(venue.rows[0].n).toBe(5); // A's 2020 home game left out
    expect(venue.rows[0].comparison.level === "team" && venue.rows[0].comparison.league?.n).toBe(10);
    // Precipitation still counts it in the team's overall record.
    expect(groups[0].blocks[0].without2020).toBe(false);
    expect(groups[0].blocks[0].notes[0]).toBe("1 game under a roof or not yet matched to weather.");
  });

  it("adds the forecast caveat to precipitation", () => {
    expect(build(false)[0].blocks[0].notes).toContain(
      "Over % uses the weather that happened; betting totals were set on forecasts.",
    );
  });
});

describe("teamTotal", () => {
  it("adds up the team's venue rows, 2020 included", () => {
    expect(teamTotal(teamSums, "A")).toMatchObject({ games: 11, wins: 7, losses: 4 });
  });
});

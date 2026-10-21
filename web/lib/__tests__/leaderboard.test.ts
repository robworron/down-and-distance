import { describe, expect, it } from "vitest";

import { boardQuery, buildLeaderboard, MIN_GAMES_RANKED, parseBoard } from "../leaderboard";
import type { Situation, SplitSums, TeamSplitSums } from "../queries";
import { buildSplits } from "../splits";

const situation = (key: string, level: "game" | "team", values: string[], extra: Partial<Situation> = {}): Situation => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
  description: "",
  category: key === "precipitation" ? "weather" : "venue",
  level,
  tier: "featured",
  column: key,
  values: values.map((value) => ({ value, label: value })),
  sharedValues: [],
  k: 120,
  ...extra,
});

const VENUE = situation("venue", "team", ["home", "away", "neutral"], { tier: "context", sharedValues: ["neutral"], k: 221 });
const PRECIP = situation("precipitation", "game", ["none", "rain"]);

function row(team: string, key: string, value: string, wins: number, losses: number, is2020 = false): TeamSplitSums {
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
    pointsFor: games * 22,
    pointsAgainst: games * 20,
    marginSq: games * 4,
    totalPointsSq: games * 42 * 42,
    ouGames: games,
    overs: Math.floor(games / 2),
    ouPushes: 0,
  };
}

function league(rows: TeamSplitSums[]): SplitSums[] {
  const out = new Map<string, SplitSums>();
  for (const { team: _team, ...r } of rows) {
    void _team;
    const id = `${r.situationKey}|${r.situationValue}|${r.is2020}`;
    const prev = out.get(id);
    out.set(id, prev ? Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, typeof v === "number" ? v + (r as unknown as Record<string, number>)[k] : v])) as SplitSums : { ...r });
  }
  return [...out.values()];
}

// Five teams with different strength and rain records: AAA is strong but 0-1
// in rain; BBB is weak but 3-0 in rain; CCC has 6 rain games.
const TEAMS: [string, [number, number], [number, number], [number, number]][] = [
  // team, home W-L, away W-L, rain W-L (the rest of its games are "none")
  ["AAA", [8, 1], [7, 2], [0, 1]],
  ["BBB", [3, 6], [2, 7], [3, 0]],
  ["CCC", [5, 4], [4, 5], [4, 2]],
  ["DDD", [6, 3], [5, 4], [1, 1]],
  ["EEE", [4, 5], [4, 5], [0, 0]],
];
const TEAM_SUMS: TeamSplitSums[] = TEAMS.flatMap(([t, home, away, rain]) => {
  const total = [home[0] + away[0], home[1] + away[1]];
  return [
    row(t, "venue", "home", ...home),
    row(t, "venue", "away", ...away),
    row(t, "precipitation", "rain", ...rain),
    row(t, "precipitation", "none", total[0] - rain[0], total[1] - rain[1]),
  ];
});
const LEAGUE_SUMS = league(TEAM_SUMS);

const board = (s: Situation, value: string) =>
  buildLeaderboard({ situation: s, value, teamSums: TEAM_SUMS, leagueSums: LEAGUE_SUMS, exclude2020: false });

describe("buildLeaderboard", () => {
  it("ranks teams with 5+ games by the shrunk estimate and greys out the rest, in estimate order", () => {
    const b = board(PRECIP, "rain");
    expect(MIN_GAMES_RANKED).toBe(5);
    expect(b.ranked.map((r) => [r.team, r.rank])).toEqual([["CCC", 1]]);
    // BBB's 3-0 doesn't lift it past stronger teams: its estimate stays near its usual record.
    expect(b.greyed.map((r) => r.team)).toEqual(["AAA", "DDD", "BBB", "EEE"]);
    const bbb = b.greyed.find((r) => r.team === "BBB")!;
    expect(bbb.winPct!.value).toBe(1);
    expect(bbb.shrunk!.value).toBeLessThan(0.5);
    // No rain games: no estimate, still listed (greyed) at the end.
    expect(b.greyed.at(-1)).toMatchObject({ team: "EEE", n: 0, shrunk: null, rank: null });
  });

  it("gives every team exactly its team-page figures for the same inputs", () => {
    for (const s of [PRECIP, VENUE]) {
      for (const { value } of s.values) {
        const b = board(s, value);
        for (const r of [...b.ranked, ...b.greyed]) {
          const page = buildSplits({ team: r.team, situations: [s], teamSums: TEAM_SUMS, leagueSums: LEAGUE_SUMS, exclude2020: false });
          const pageRow = page[0].blocks[0].rows.find((x) => x.value === value)!;
          expect([r.n, r.record, r.winPct, r.shrunk]).toEqual([pageRow.n, pageRow.record, pageRow.winPct, pageRow.shrunk]);
        }
      }
    }
  });

  it("shows a league win % for a team-level value, and scoring (games, not team-games) when both teams share it", () => {
    const home = board(VENUE, "home");
    expect(home.league).toMatchObject({ kind: "win", n: 45 });
    const rain = board(PRECIP, "rain");
    expect(rain.league.kind).toBe("shared");
    expect(rain.league.n).toBe(6); // 12 team-games = 6 games
    if (rain.league.kind === "shared") expect(rain.league.total!.value).toBe(42);
    expect(board(VENUE, "neutral").league.kind).toBe("shared");
  });
});

describe("parseBoard", () => {
  const SITUATIONS = [PRECIP, VENUE];
  it("opens on home games over the last 3 seasons", () => {
    const { choice } = parseBoard({}, SITUATIONS, 2026);
    expect(choice).toMatchObject({ situation: { key: "venue" }, value: "home", range: { from: 2024, to: 2026 } });
  });
  it("takes a situation's first value when the value is empty, and rejects unknown ones", () => {
    expect(parseBoard({ situation: "precipitation", value: "" }, SITUATIONS, 2026).choice?.value).toBe("none");
    expect(parseBoard({ situation: "surface" }, SITUATIONS, 2026).rejected[0]).toMatchObject({ param: "situation" });
    expect(parseBoard({ situation: "venue", value: "rain" }, SITUATIONS, 2026).rejected[0]).toMatchObject({ param: "value" });
  });
  it("leaves defaults out of links", () => {
    const range = { from: 2024, to: 2026, playoffs: false, with2020: false };
    expect(boardQuery("venue", "home", range, 2026)).toBe("");
    expect(boardQuery("precipitation", "rain", { ...range, from: 2016 }, 2026)).toBe("?situation=precipitation&value=rain&from=2016");
  });
});

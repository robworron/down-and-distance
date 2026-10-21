import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  buildExplorerResult,
  excludes2020,
  explorerQuery,
  parseExplorer,
  withoutValue,
  type ExplorerState,
  type ExplorerSums,
} from "../explorer";
import { explorerStatement, type Situation } from "../queries";

const situation = (key: string, column: string, level: "game" | "team", values: string[]): Situation => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
  description: "",
  category: "weather",
  level,
  tier: "featured",
  column,
  values: values.map((value) => ({ value, label: value })),
  sharedValues: [],
  k: 100,
});

// In registry order: the parser keeps it.
const SITUATIONS = [
  situation("precipitation", "precipitation_bucket", "game", ["none", "light_rain", "heavy_rain", "snow"]),
  situation("wind", "wind_bucket", "game", ["under_10", "10_to_14", "15_plus"]),
  situation("roof", "roof_type", "game", ["outdoors", "dome"]),
  situation("venue", "venue", "team", ["home", "away", "neutral"]),
];
const TEAMS = ["BUF", "KC", "LV"];
const LATEST = 2026;
const parse = (params: Record<string, string | string[]>) => parseExplorer(params, SITUATIONS, TEAMS, LATEST);

describe("parseExplorer", () => {
  it("reads filters in registry order, values in registry order, without repeats", () => {
    const { state, rejected } = parse({ venue: "away", wind: ["15_plus", "10_to_14", "15_plus"], roof: "outdoors" });
    expect(rejected).toEqual([]);
    expect(state.filters.map((f) => [f.key, f.column, f.values])).toEqual([
      ["wind", "wind_bucket", ["10_to_14", "15_plus"]],
      ["roof", "roof_type", ["outdoors"]],
      ["venue", "venue", ["away"]],
    ]);
  });

  it("defaults to the seasons since 2016, regular season, no team", () => {
    const { state } = parse({});
    expect(state).toEqual({ filters: [], range: { from: 2016, to: 2026, playoffs: false, with2020: false }, team: null });
  });

  it("rejects a column name, an unknown key, a trimmed situation and an unknown value", () => {
    const { state, rejected } = parse({ wind_bucket: "15_plus", foo: "1", surface: "grass", wind: ["hurricane", "15_plus"] });
    expect(rejected.map((r) => [r.param, r.value])).toEqual([
      ["wind_bucket", "15_plus"],
      ["foo", "1"],
      ["surface", "grass"],
      ["wind", "hurricane"],
    ]);
    // The good value survives in the state, but the page runs nothing while anything is rejected.
    expect(state.filters).toHaveLength(1);
  });

  it("rejects SQL in a value rather than passing it on", () => {
    const { state, rejected } = parse({ wind: "15_plus'; drop table x--" });
    expect(rejected).toHaveLength(1);
    expect(state.filters).toEqual([]);
  });

  it("ignores tracking parameters and reads seasons leniently", () => {
    const { state, rejected } = parse({ utm_source: "x", fbclid: "y", gclid: "z", from: "abc", to: "2020", playoffs: "1" });
    expect(rejected).toEqual([]);
    expect(state.range).toEqual({ from: 2016, to: 2020, playoffs: true, with2020: false });
  });

  it("accepts a team code in any case and rejects an unknown one", () => {
    expect(parse({ team: "buf" }).state.team).toBe("BUF");
    expect(parse({ team: "" }).state.team).toBeNull();
    const bad = parse({ team: "xyz" });
    expect(bad.state.team).toBeNull();
    expect(bad.rejected[0]).toMatchObject({ param: "team", value: "xyz" });
  });
});

describe("explorerQuery", () => {
  it("leaves defaults out and round-trips through the parser", () => {
    const { state } = parse({ venue: "away", wind: ["15_plus", "10_to_14"], from: "2019", team: "kc" });
    const query = explorerQuery(state, LATEST);
    expect(query).toBe("?wind=10_to_14&wind=15_plus&venue=away&from=2019&team=kc");
    const params = Object.fromEntries(
      [...new URLSearchParams(query).keys()].map((k) => [k, new URLSearchParams(query).getAll(k)]),
    );
    expect(parse(params).state).toEqual(state);
    expect(explorerQuery(parse({}).state, LATEST)).toBe("");
  });

  it("removes one value for a chip's link, and the filter with its last value", () => {
    const { state } = parse({ venue: "away", wind: ["15_plus", "10_to_14"] });
    expect(explorerQuery(withoutValue(state, "wind", "15_plus"), LATEST)).toBe("?wind=10_to_14&venue=away");
    expect(explorerQuery(withoutValue(state, "venue", "away"), LATEST)).toBe("?wind=10_to_14&wind=15_plus");
  });

  it("leaves 2020 out only with a venue filter over a range that covers it", () => {
    expect(excludes2020(parse({ venue: "home" }).state)).toBe(true);
    expect(excludes2020(parse({ venue: "home", with2020: "1" }).state)).toBe(false);
    expect(excludes2020(parse({ wind: "15_plus" }).state)).toBe(false);
    expect(excludes2020(parse({ venue: "home", from: "2021" }).state)).toBe(false);
  });
});

const ZERO: ExplorerSums = {
  oneGames: 0,
  oneWins: 0,
  oneTies: 0,
  oneMargin: 0,
  oneMarginSq: 0,
  oneExpectedWins: 0,
  oneExpectedMargin: 0,
  bothGames: 0,
  bothTotal: 0,
  bothTotalSq: 0,
  bothOvers: 0,
  bothDecided: 0,
  bothExpectedTotal: 0,
  bothExpectedOvers: 0,
  teamGames: 0,
  teamWins: 0,
  teamLosses: 0,
  teamTies: 0,
  teamMargin: 0,
  teamMarginSq: 0,
  teamTotal: 0,
  teamTotalSq: 0,
  teamOvers: 0,
  teamDecided: 0,
  usualGames: 0,
  usualWins: 0,
  usualTies: 0,
  usualMargin: 0,
};

describe("buildExplorerResult", () => {
  it("reports shared games on scoring only: n is games and there is no win %", () => {
    const { state } = parse({ wind: "15_plus" });
    // 10 games of 36 points (± 6), 4 overs of 9 decided; the seasons averaged 44 points and 50% over.
    const r = buildExplorerResult(state, {
      ...ZERO,
      bothGames: 10,
      bothTotal: 360,
      bothTotalSq: 10 * 36 * 36 + 9 * 36,
      bothOvers: 4,
      bothDecided: 9,
      bothExpectedTotal: 440,
      bothExpectedOvers: 4.5,
    });
    expect(r.oneSided).toBeNull();
    expect(r.shared).toMatchObject({ games: 10, expected: { total: 44, overPct: 0.5 } });
    expect(r.shared!.total!.value).toBe(36);
    expect(r.shared!).not.toHaveProperty("winPct");
    expect(r.shared!.reading).toMatch(/^8\.0 points a game fewer than that\./);
    expect(r.notes[0]).toMatch(/weather that happened/);
  });

  it("compares one-sided games with the venue norm, and says when the range includes zero", () => {
    const { state } = parse({ wind: "15_plus", venue: "away" });
    // 4 games, 1-3, margins -1, -3, -5, +1 (mean -2); away teams in those seasons lost by 2.5 and won 44%.
    const r = buildExplorerResult(state, {
      ...ZERO,
      oneGames: 4,
      oneWins: 1,
      oneMargin: -8,
      oneMarginSq: 1 + 9 + 25 + 1,
      oneExpectedWins: 4 * 0.44,
      oneExpectedMargin: -10,
    });
    expect(r.oneSided).toMatchObject({ games: 4, record: { wins: 1, losses: 3, ties: 0 }, expected: { basis: "venue" } });
    expect(r.oneSided!.expected.winPct).toBeCloseTo(0.44);
    expect(r.oneSided!.reading).toBe(
      "0.5 points a game better than that. The range includes zero, so this could be chance.",
    );
  });

  it("compares venue alone with an even game, since the venue norm would equal the result", () => {
    const { state } = parse({ venue: "home" });
    const r = buildExplorerResult(state, { ...ZERO, oneGames: 1000, oneWins: 570, oneMargin: 2400, oneMarginSq: 1000 * 200, oneExpectedWins: 570, oneExpectedMargin: 2400 });
    expect(r.oneSided!.expected).toEqual({ basis: "even", winPct: 0.5, margin: 0 });
    expect(r.oneSided!.reading).toMatch(/^2\.4 points a game better than that\. The range excludes zero\.$/);
  });

  it("drops margin and total intervals below 3 games, but keeps the win % interval", () => {
    const { state } = parse({ wind: "15_plus", team: "lv" });
    const r = buildExplorerResult(state, { ...ZERO, teamGames: 2, teamWins: 2, teamMargin: 39, teamMarginSq: 25 * 25 + 14 * 14, teamTotal: 66, teamTotalSq: 33 * 33 * 2 });
    expect(r.team!.margin).toEqual({ value: 19.5, ci: null });
    expect(r.team!.total).toEqual({ value: 33, ci: null });
    expect(r.team!.winPct!.ci).not.toBeNull();
    expect(r.team!.showScoring).toBe(true);
    expect(r.empty).toBe(true);
  });
});

describe("explorerStatement", () => {
  const render = (state: ExplorerState) => new PgDialect().sqlToQuery(explorerStatement(state));
  const range = { from: 2016, to: 2025, playoffs: false, with2020: false };

  it("binds every value as a parameter: text from the URL never becomes SQL", () => {
    const hostile = "15_plus'; drop table marts.team_games; --";
    const { sql, params } = render({
      filters: [{ key: "wind", column: "wind_bucket", level: "game", values: [hostile] }],
      range,
      team: "BUF' or '1'='1",
    });
    expect(sql).not.toContain("drop table");
    expect(sql).not.toContain("'1'='1");
    expect(sql).toContain('tg."wind_bucket"::text = any($');
    expect(params).toContainEqual([hostile]);
    expect(params).toContain("BUF' or '1'='1");
  });

  it("refuses a column that isn't a plain name, even from the registry", () => {
    expect(() =>
      render({ filters: [{ key: "wind", column: "wind_bucket; drop", level: "game", values: ["x"] }], range, team: null }),
    ).toThrow(/Unexpected registry column/);
  });

  it("leaves 2020 out only when the venue rule applies", () => {
    const venue = { key: "venue", column: "venue", level: "team" as const, values: ["home"] };
    expect(render({ filters: [venue], range: { ...range, from: 2019 }, team: null }).sql).toContain("tg.season <> 2020");
    expect(render({ filters: [venue], range: { ...range, with2020: true }, team: null }).sql).not.toContain("<> 2020");
  });
});

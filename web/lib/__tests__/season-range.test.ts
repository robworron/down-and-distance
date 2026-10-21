import { describe, expect, it } from "vitest";

import { includes2020, parseSeasonRange, rangePresets, rangeQuery, seasonTypes, type SeasonRange } from "../season-range";

const LATEST = 2026;
const DEFAULT: SeasonRange = { from: 2024, to: 2026, playoffs: false, with2020: false };

describe("parseSeasonRange", () => {
  it("defaults to the latest three seasons, regular season only", () => {
    expect(parseSeasonRange({}, LATEST)).toEqual(DEFAULT);
  });

  it("reads from, to and the two flags", () => {
    expect(parseSeasonRange({ from: "2018", to: "2021", playoffs: "1", with2020: "1" }, LATEST)).toEqual({
      from: 2018,
      to: 2021,
      playoffs: true,
      with2020: true,
    });
  });

  it("clamps to 1999 through the latest season", () => {
    expect(parseSeasonRange({ from: "1990", to: "2040" }, LATEST)).toMatchObject({ from: 1999, to: 2026 });
  });

  it("swaps a reversed range", () => {
    expect(parseSeasonRange({ from: "2025", to: "2019" }, LATEST)).toMatchObject({ from: 2019, to: 2025 });
  });

  it("falls back to the defaults on bad input", () => {
    expect(parseSeasonRange({ from: "abc", to: "20.5", playoffs: "yes" }, LATEST)).toEqual(DEFAULT);
    expect(parseSeasonRange({ from: "", to: "-2020" }, LATEST)).toEqual(DEFAULT);
  });

  it("takes the first of a repeated parameter and ignores unknown ones", () => {
    expect(parseSeasonRange({ from: ["2010", "2015"], team: "buf", sort: "x" }, LATEST)).toMatchObject({
      from: 2010,
      to: 2026,
    });
  });
});

describe("season types and 2020", () => {
  it("adds the playoffs to the regular season only when asked", () => {
    expect(seasonTypes(DEFAULT)).toEqual(["REG"]);
    expect(seasonTypes({ ...DEFAULT, playoffs: true })).toEqual(["REG", "POST"]);
  });

  it("knows when the range covers 2020", () => {
    expect(includes2020(DEFAULT)).toBe(false);
    expect(includes2020({ ...DEFAULT, from: 2020, to: 2020 })).toBe(true);
    expect(includes2020({ ...DEFAULT, from: 2016, to: 2026 })).toBe(true);
  });
});

describe("rangeQuery", () => {
  it("leaves the defaults out", () => {
    expect(rangeQuery(DEFAULT, LATEST)).toBe("");
    expect(rangeQuery({ ...DEFAULT, from: 2023 }, LATEST)).toBe("?from=2023");
    expect(rangeQuery({ from: 2023, to: 2025, playoffs: true, with2020: false }, LATEST)).toBe(
      "?from=2023&to=2025&playoffs=1",
    );
  });

  it("round-trips through parseSeasonRange", () => {
    const range: SeasonRange = { from: 2005, to: 2022, playoffs: true, with2020: true };
    const params = Object.fromEntries(new URLSearchParams(rangeQuery(range, LATEST)));
    expect(parseSeasonRange(params, LATEST)).toEqual(range);
  });
});

describe("rangePresets", () => {
  it("ends at the latest season and keeps the other settings", () => {
    const presets = rangePresets({ ...DEFAULT, playoffs: true }, LATEST);
    expect(presets.map((p) => [p.label, p.range.from, p.range.to])).toEqual([
      ["Last 3", 2024, 2026],
      ["Last 5", 2022, 2026],
      ["Since 2016", 2016, 2026],
      ["All", 1999, 2026],
    ]);
    expect(presets.every((p) => p.range.playoffs)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { clipped, marginLimit, splitChart, toPercent, totalLimit } from "../split-bars";
import type { SituationBlock, ValueRow } from "../splits";

describe("axes", () => {
  it("makes the margin axis symmetric at 10, 20 or 30", () => {
    expect(marginLimit([2.1, -6.2])).toBe(10);
    expect(marginLimit([-13.6, 4])).toBe(20);
    expect(marginLimit([20])).toBe(20);
    expect(marginLimit([-31])).toBe(30);
    expect(marginLimit([])).toBe(10);
  });

  it("runs the total axis from 0 to the next multiple of 20, capped at 80", () => {
    expect(totalLimit([44.8, 51.9])).toBe(60);
    expect(totalLimit([40])).toBe(40);
    expect(totalLimit([12])).toBe(20);
    expect(totalLimit([95])).toBe(80);
  });

  it("maps values to percent of the plot, kept inside it", () => {
    expect(toPercent(0, [-10, 10])).toBe(50);
    expect(toPercent(-5, [-10, 10])).toBe(25);
    expect(toPercent(30, [0, 60])).toBe(50);
    expect(toPercent(-40, [-20, 20])).toBe(0);
    expect(toPercent(99, [0, 60])).toBe(100);
  });

  it("flags a CI that runs off either end", () => {
    expect(clipped({ low: -34.1, high: 42.1 }, [-20, 20])).toEqual({ low: true, high: true });
    expect(clipped({ low: -14.5, high: 1.0 }, [-20, 20])).toEqual({ low: false, high: false });
  });
});

const row = (value: string, comparison: ValueRow["comparison"], margin: number | null): ValueRow => ({
  value,
  label: value,
  n: margin === null ? 0 : 4,
  record: { wins: 2, losses: 2, ties: 0 },
  winPct: null,
  shrunk: null,
  margin: margin === null ? null : { value: margin, ci: { low: margin - 5, high: margin + 5 } },
  comparison,
});

const block = (level: "team" | "game", rows: ValueRow[]): SituationBlock => ({
  situation: {
    key: "x",
    label: "X",
    description: "",
    category: "schedule",
    level,
    tier: "filter",
    column: "x",
    values: [],
    sharedValues: [],
    k: 100,
  },
  rows,
  notes: [],
  overall: { margin: { value: -6.2, ci: null }, total: { value: 41.5, ci: null } },
  without2020: false,
});

describe("splitChart", () => {
  it("charts margin for team-level situations, with the league's margin as the tick", () => {
    const chart = splitChart(
      block("team", [
        row("a", { level: "team", league: { winPct: null, margin: { value: -1.8, ci: null }, n: 179 } }, -6.8),
        row("b", { level: "team", league: null }, -13.6),
      ]),
    );
    expect(chart.kind).toBe("margin");
    expect(chart.bars.map((b) => b.estimate?.value)).toEqual([-6.8, -13.6]); // the table's margins
    expect(chart.bars.map((b) => b.league)).toEqual([-1.8, null]); // no tick for a shared value
    expect(chart.reference).toBe(-6.2);
    expect(chart.domain).toEqual([-20, 20]);
    expect(chart.ticks).toEqual([-20, -10, 0, 10, 20]);
  });

  it("charts the game total for game-level situations", () => {
    const total = { value: 33, ci: { low: 30, high: 36 } };
    const chart = splitChart(
      block("game", [
        row("a", { level: "game", total, overPct: null, league: { total: { value: 43.3, ci: null }, overPct: null, n: 60 } }, 4),
        row("b", { level: "game", total: null, overPct: null, league: { total: { value: 51.9, ci: null }, overPct: null, n: 11 } }, null),
      ]),
    );
    expect(chart.kind).toBe("total");
    expect(chart.bars[0].estimate).toBe(total); // the table's game total, not its margin
    expect(chart.bars[1].estimate).toBeNull();
    expect(chart.reference).toBe(41.5);
    expect(chart.domain).toEqual([0, 60]);
    expect(chart.ticks).toEqual([0, 20, 40, 60]);
  });
});

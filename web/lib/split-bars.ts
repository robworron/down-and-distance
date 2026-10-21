// The split charts' model and scale maths (step 0.45). Pure, so the axes are
// unit-tested; components/team/split-bars.tsx draws what this returns.
//
// Level-aware, like the table: team-level situations chart the team's margin
// per game in each value; game-level ones chart the game total (both teams'
// points) of the team's games, since the league's win % and margin there are
// 50% and 0 by construction.

import type { SituationBlock } from "./splits";
import type { Estimate } from "./stats";

export type Bar = {
  value: string;
  label: string;
  n: number;
  record: { wins: number; losses: number; ties: number };
  /** The bar: exactly the table's margin (or game total) for this value. */
  estimate: Estimate | null;
  /** The league's figure in this value (the tall tick), or null for none. */
  league: number | null;
};

export type SplitChart = {
  kind: "margin" | "total";
  title: string;
  bars: Bar[];
  /** The team's figure over all its games in these seasons (the reference line). */
  reference: number | null;
  domain: [number, number];
  ticks: number[];
};

/** Margin axis: symmetric, ±10, ±20 or ±30, the smallest that holds every value. */
export function marginLimit(values: number[]): 10 | 20 | 30 {
  const largest = Math.max(0, ...values.map(Math.abs));
  return largest <= 10 ? 10 : largest <= 20 ? 20 : 30;
}

/** Total axis: 0 up to the next multiple of 20 that holds every value, 20 to 80. */
export function totalLimit(values: number[]): number {
  const largest = Math.max(0, ...values);
  return Math.min(80, Math.max(20, Math.ceil(largest / 20) * 20));
}

/** Position of x on the axis, in percent of the plot's width, kept inside 0–100. */
export function toPercent(x: number, [low, high]: [number, number]): number {
  return Math.min(100, Math.max(0, ((x - low) / (high - low)) * 100));
}

/** Whether a 95% CI runs past either end of the axis (drawn with an arrowhead there). */
export function clipped(ci: { low: number; high: number }, [low, high]: [number, number]) {
  return { low: ci.low < low, high: ci.high > high };
}

export function splitChart(block: SituationBlock): SplitChart {
  const team = block.situation.level === "team";
  const bars: Bar[] = block.rows.map((row) => {
    const c = row.comparison;
    const estimate = c.level === "team" ? row.margin : c.total;
    const league = c.level === "team" ? (c.league?.margin?.value ?? null) : (c.league.total?.value ?? null);
    return { value: row.value, label: row.label, n: row.n, record: row.record, estimate, league };
  });
  const reference = (team ? block.overall.margin : block.overall.total)?.value ?? null;

  // The axis holds the bars, the ticks and the reference line; CIs may run
  // off it (they're often enormous for a few games) and get an arrowhead.
  const shown = [
    ...bars.flatMap((b) => [b.estimate?.value, b.league]),
    reference,
  ].filter((x): x is number => x !== null && x !== undefined);

  if (team) {
    const limit = marginLimit(shown);
    const step = limit / 2;
    return {
      kind: "margin",
      title: "Margin per game, with 95% CI",
      bars,
      reference,
      domain: [-limit, limit],
      ticks: [-limit, -step, 0, step, limit],
    };
  }
  const limit = totalLimit(shown);
  return {
    kind: "total",
    title: "Points per game, both teams, with 95% CI",
    bars,
    reference,
    domain: [0, limit],
    ticks: Array.from({ length: limit / 20 + 1 }, (_, i) => i * 20),
  };
}

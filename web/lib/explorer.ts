// The situation explorer: stacked filters kept in the URL, checked against
// the situation registry before any SQL exists, and the league and team
// results built from the summed counts the explorer query returns. Pure, so
// it's unit-tested without a database.

import type { Situation } from "./queries";
import { includes2020, parseSeasonRange, rangeParams, type SearchParams, type SeasonRange } from "./season-range";
import { overPctEstimate, sampleMeanEstimate, TOO_FEW_FOR_RANGE, winPctEstimate, type Estimate } from "./stats";

/** The explorer opens on the seasons since 2016 (Rob's choice): enough games for combinations. */
export const EXPLORER_FROM = 2016;
export const explorerDefaults = (latest: number): [number, number] => [EXPLORER_FROM, latest];

/** One situation the explorer filters on: rows whose column holds any of these values. */
export type ExplorerFilter = { key: string; column: string; level: "game" | "team"; values: string[] };

export type ExplorerState = {
  /** In the registry's display order; values in value_list order. */
  filters: ExplorerFilter[];
  range: SeasonRange;
  /** A team code (BUF) to show beside the league, or null for the league only. */
  team: string | null;
};

/** A URL parameter the explorer refused, and why, in words for the page. */
export type Rejection = { param: string; value: string; reason: string };

const RESERVED = new Set(["from", "to", "playoffs", "with2020", "team"]);
// Links shared on social sites pick these up; they say nothing about the view.
const isTracking = (key: string) => key.startsWith("utm_") || key === "fbclid" || key === "gclid";

const asList = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * Read the explorer's state from the URL. A filter's key must be a v1
 * situation in the registry and each value one of its registry values;
 * anything else is rejected (and the page runs no query). The column a
 * filter reads comes from the registry row, never from the URL. Season
 * parameters are read leniently, as on the team pages.
 */
export function parseExplorer(
  params: SearchParams,
  situations: Situation[],
  teams: string[],
  latest: number,
): { state: ExplorerState; rejected: Rejection[] } {
  const byKey = new Map(situations.map((s) => [s.key, s]));
  const rejected: Rejection[] = [];
  const chosen = new Map<string, Set<string>>();

  for (const [param, raw] of Object.entries(params)) {
    if (RESERVED.has(param) || isTracking(param)) continue;
    const situation = byKey.get(param);
    if (!situation) {
      rejected.push({ param, value: asList(raw).join(", "), reason: "isn't a situation the explorer knows" });
      continue;
    }
    const allowed = new Set(situation.values.map((v) => v.value));
    for (const value of asList(raw)) {
      if (!allowed.has(value)) {
        rejected.push({ param, value, reason: `isn't one of the values for ${situation.label.toLowerCase()}` });
      } else {
        if (!chosen.has(param)) chosen.set(param, new Set());
        chosen.get(param)!.add(value);
      }
    }
  }

  const teamParam = asList(params.team)[0] ?? "";
  let team: string | null = null;
  if (teamParam !== "") {
    const code = teamParam.toUpperCase();
    if (teams.includes(code)) team = code;
    else rejected.push({ param: "team", value: teamParam, reason: "isn't one of the 32 team codes" });
  }

  const filters: ExplorerFilter[] = situations
    .filter((s) => chosen.has(s.key))
    .map((s) => ({
      key: s.key,
      column: s.column,
      level: s.level,
      values: s.values.map((v) => v.value).filter((v) => chosen.get(s.key)!.has(v)),
    }));

  return { state: { filters, range: parseSeasonRange(params, latest, explorerDefaults(latest)), team }, rejected };
}

/** The canonical query string for a state: filters in registry order, defaults left out. */
export function explorerQuery(state: ExplorerState, latest: number): string {
  const params = new URLSearchParams();
  for (const f of state.filters) for (const v of f.values) params.append(f.key, v);
  for (const [k, v] of rangeParams(state.range, explorerDefaults(latest))) params.append(k, v);
  if (state.team) params.set("team", state.team.toLowerCase());
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The same state with one filter value removed (a chip's remove link). */
export function withoutValue(state: ExplorerState, key: string, value: string): ExplorerState {
  const filters = state.filters
    .map((f) => (f.key === key ? { ...f, values: f.values.filter((v) => v !== value) } : f))
    .filter((f) => f.values.length > 0);
  return { ...state, filters };
}

/** True when a venue filter is on and the range covers 2020 (left out unless kept). */
export function excludes2020(state: ExplorerState): boolean {
  return state.filters.some((f) => f.key === "venue") && includes2020(state.range) && !state.range.with2020;
}

/** What the explorer query returns: sums and counts only (see getExplorerSums). */
export type ExplorerSums = {
  /** Games where only one team matched, from that team's side. */
  oneGames: number;
  oneWins: number;
  oneTies: number;
  oneMargin: number;
  oneMarginSq: number;
  /** Σ over those games of the league's win % (and margin) at the same venue in the same season. */
  oneExpectedWins: number;
  oneExpectedMargin: number;
  /** Games where both teams matched, each counted once. */
  bothGames: number;
  bothTotal: number;
  bothTotalSq: number;
  bothOvers: number;
  /** Games with a total that wasn't a push. */
  bothDecided: number;
  /** Σ of the season's points per game, and of its over % over the decided games. */
  bothExpectedTotal: number;
  bothExpectedOvers: number;
  /** The chosen team's own matching games (0 without a team). */
  teamGames: number;
  teamWins: number;
  teamLosses: number;
  teamTies: number;
  teamMargin: number;
  teamMarginSq: number;
  teamTotal: number;
  teamTotalSq: number;
  teamOvers: number;
  teamDecided: number;
  /** The chosen team's games in these seasons, filters or not: its usual record. */
  usualGames: number;
  usualWins: number;
  usualTies: number;
  usualMargin: number;
};

export type Record3 = { wins: number; losses: number; ties: number };

export type OneSidedCard = {
  games: number;
  record: Record3;
  winPct: Estimate | null;
  margin: Estimate | null;
  /** venue: teams at the same venue in the same seasons; even: a 50% team, margin 0. */
  expected: { winPct: number; margin: number; basis: "venue" | "even" };
  reading: string;
};

export type SharedCard = {
  games: number;
  total: Estimate | null;
  overPct: Estimate | null;
  expected: { total: number | null; overPct: number | null };
  reading: string | null;
};

export type TeamCard = {
  team: string;
  games: number;
  record: Record3;
  winPct: Estimate | null;
  margin: Estimate | null;
  /** Only when every filter is the same for both teams: the team's games' scoring. */
  total: Estimate | null;
  overPct: Estimate | null;
  showScoring: boolean;
  usual: { games: number; winPct: number | null; margin: number | null };
};

export type ExplorerResult = {
  oneSided: OneSidedCard | null;
  shared: SharedCard | null;
  team: TeamCard | null;
  /** No filters: the shared card is simply every game in these seasons. */
  unfiltered: boolean;
  empty: boolean;
  notes: string[];
};

const WEATHER_KEYS = new Set(["precipitation", "wind"]);

const abs1 = (x: number) => Math.abs(x).toFixed(1);

/** "… The range includes zero, so this could be chance." for a mean against a reference value. */
function rangeClause(e: Estimate, reference: number): string {
  if (!e.ci) return ` ${TOO_FEW_FOR_RANGE[0].toUpperCase()}${TOO_FEW_FOR_RANGE.slice(1)}.`;
  return e.ci.low <= reference && reference <= e.ci.high
    ? " The range includes zero, so this could be chance."
    : " The range excludes zero.";
}

function oneSidedReading(margin: Estimate | null, expected: number): string {
  if (!margin) return "";
  const diff = margin.value - expected;
  // The card states the comparison just before this line, so "that" refers to it.
  const head = Math.abs(diff) < 0.05 ? "About the same as that." : `${abs1(diff)} points a game ${diff > 0 ? "better" : "worse"} than that.`;
  return head + rangeClause(margin, expected);
}

function sharedReading(total: Estimate | null, expected: number | null): string | null {
  if (!total || expected === null) return null;
  const diff = total.value - expected;
  const head = Math.abs(diff) < 0.05 ? "About the same as that." : `${abs1(diff)} points a game ${diff > 0 ? "more" : "fewer"} than that.`;
  return head + rangeClause(total, expected);
}

/**
 * Build the result cards. One-sided games (only one team in the situation)
 * report that team's win % and margin against the venue norm: being away
 * costs about 2 points, so travel or rest shouldn't be blamed for it. When
 * venue is the only filter the norm would equal the result, so the
 * comparison is an even game. Shared games (both teams in it: weather,
 * roof, or a value both sides had) report scoring and over %, each game
 * once, because one team wins and the other loses.
 */
export function buildExplorerResult(state: ExplorerState, s: ExplorerSums): ExplorerResult {
  const venueOnly = state.filters.length === 1 && state.filters[0].key === "venue";

  let oneSided: OneSidedCard | null = null;
  if (s.oneGames > 0) {
    const basis = venueOnly ? "even" : "venue";
    const expected = {
      basis,
      winPct: basis === "even" ? 0.5 : s.oneExpectedWins / s.oneGames,
      margin: basis === "even" ? 0 : s.oneExpectedMargin / s.oneGames,
    } as const;
    const margin = sampleMeanEstimate(s.oneMargin, s.oneMarginSq, s.oneGames);
    oneSided = {
      games: s.oneGames,
      record: { wins: s.oneWins, losses: s.oneGames - s.oneWins - s.oneTies, ties: s.oneTies },
      winPct: winPctEstimate({ games: s.oneGames, wins: s.oneWins, ties: s.oneTies }),
      margin,
      expected,
      reading: oneSidedReading(margin, expected.margin),
    };
  }

  let shared: SharedCard | null = null;
  if (s.bothGames > 0) {
    const total = sampleMeanEstimate(s.bothTotal, s.bothTotalSq, s.bothGames);
    const expectedTotal = s.bothExpectedTotal / s.bothGames;
    shared = {
      games: s.bothGames,
      total,
      overPct: overPctEstimate({ ouGames: s.bothDecided, overs: s.bothOvers, ouPushes: 0 }),
      expected: { total: expectedTotal, overPct: s.bothDecided > 0 ? s.bothExpectedOvers / s.bothDecided : null },
      reading: state.filters.length === 0 ? null : sharedReading(total, expectedTotal),
    };
  }

  let team: TeamCard | null = null;
  if (state.team) {
    const showScoring = state.filters.every((f) => f.level === "game");
    team = {
      team: state.team,
      games: s.teamGames,
      record: { wins: s.teamWins, losses: s.teamLosses, ties: s.teamTies },
      winPct: winPctEstimate({ games: s.teamGames, wins: s.teamWins, ties: s.teamTies }),
      margin: sampleMeanEstimate(s.teamMargin, s.teamMarginSq, s.teamGames),
      total: showScoring ? sampleMeanEstimate(s.teamTotal, s.teamTotalSq, s.teamGames) : null,
      overPct: showScoring ? overPctEstimate({ ouGames: s.teamDecided, overs: s.teamOvers, ouPushes: 0 }) : null,
      showScoring,
      usual: {
        games: s.usualGames,
        winPct: s.usualGames > 0 ? (s.usualWins + s.usualTies / 2) / s.usualGames : null,
        margin: s.usualGames > 0 ? s.usualMargin / s.usualGames : null,
      },
    };
  }

  const notes: string[] = [];
  if (state.filters.some((f) => WEATHER_KEYS.has(f.key))) {
    notes.push("Over % uses the weather that happened; betting totals were set on forecasts.");
  }
  if (state.filters.length > 0) notes.push("Try enough combinations and some will look real by chance.");

  return {
    oneSided,
    shared,
    team,
    unfiltered: state.filters.length === 0,
    empty: s.oneGames + s.bothGames === 0,
    notes,
  };
}

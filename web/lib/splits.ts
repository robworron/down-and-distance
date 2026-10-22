// The splits table's view model: one block per v1 situation, grouped by
// tier, with every figure computed from the marts' sums (lib/stats.ts).
// Pure, so it's unit-tested without a database.

import type { Situation, SplitSums, Tier, TeamSplitSums } from "./queries";
import type { Tally } from "./records";
import {
  leagueSplit,
  overPctEstimate,
  sampleMeanEstimate,
  shrunkWinPct,
  winPctEstimate,
  type Estimate,
  type TeamSplit,
} from "./stats";

type Sums = Omit<SplitSums, "situationKey" | "situationValue" | "is2020">;

const ZERO: Sums = {
  games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  marginSq: 0,
  totalPointsSq: 0,
  ouGames: 0,
  overs: 0,
  ouPushes: 0,
};

function add(a: Sums, b: Sums): Sums {
  return {
    games: a.games + b.games,
    wins: a.wins + b.wins,
    losses: a.losses + b.losses,
    ties: a.ties + b.ties,
    pointsFor: a.pointsFor + b.pointsFor,
    pointsAgainst: a.pointsAgainst + b.pointsAgainst,
    marginSq: a.marginSq + b.marginSq,
    totalPointsSq: a.totalPointsSq + b.totalPointsSq,
    ouGames: a.ouGames + b.ouGames,
    overs: a.overs + b.overs,
    ouPushes: a.ouPushes + b.ouPushes,
  };
}

/** Halve league sums: a game-level value counts each game once per team. */
function halve(s: Sums): Sums {
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v / 2])) as Sums;
}

const winPctOf = (s: Sums) => winPctEstimate(s)?.value ?? null;
// Below 3 games the interval is left out (the small-sample rule, lib/stats.ts).
const marginOf = (s: Sums) => sampleMeanEstimate(s.pointsFor - s.pointsAgainst, s.marginSq, s.games);
const totalOf = (s: Sums) => sampleMeanEstimate(s.pointsFor + s.pointsAgainst, s.totalPointsSq, s.games);

/** A league figure with the number of games behind it. */
export type LeagueFigures<T> = T & { n: number };

export type ValueRow = {
  value: string;
  label: string;
  /** The team's games in this value. */
  n: number;
  record: { wins: number; losses: number; ties: number };
  winPct: Estimate | null;
  /** The shrunk win % and the share of it from these games, n / (n + k). */
  shrunk: { value: number; weight: number } | null;
  margin: Estimate | null;
  comparison:
    | {
        level: "team";
        /** Null for a value both teams usually share (50% and 0 by construction). */
        league: LeagueFigures<{ winPct: Estimate | null; margin: Estimate | null }> | null;
      }
    | {
        level: "game";
        total: Estimate | null;
        overPct: Estimate | null;
        /** n is games, not team-games: each game appears once per team. */
        league: LeagueFigures<{ total: Estimate | null; overPct: Estimate | null }>;
      };
};

export type SituationBlock = {
  situation: Situation;
  rows: ValueRow[];
  notes: string[];
  /** The team's figures over all its games in the block's seasons (the charts' reference lines). */
  overall: { margin: Estimate | null; total: Estimate | null };
  /** True when 2020's games are left out of this block (the venue rule). */
  without2020: boolean;
};

export type TierGroup = { tier: Tier; blocks: SituationBlock[] };

const TIER_ORDER: Tier[] = ["featured", "filter", "context"];
const WEATHER_NOTES = new Set(["precipitation", "wind"]);

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** A team's whole record over some rows: its venue rows add up to all its games. */
export function teamTotal(sums: TeamSplitSums[], team: string): Tally {
  const s = sums.filter((r) => r.team === team && r.situationKey === "venue").reduce(add, ZERO);
  return {
    games: s.games,
    wins: s.wins,
    losses: s.losses,
    ties: s.ties,
    pointsFor: s.pointsFor,
    pointsAgainst: s.pointsAgainst,
  };
}

/** Each team's overall sums (its venue rows) and its sums per value of one situation. */
type SituationSums = { overallByTeam: Map<string, Sums>; byTeamValue: Map<string, Sums> };

/** `without2020`: the venue rule applies to this situation, so 2020's rows are left out. */
function situationSums(situation: Situation, teamSums: TeamSplitSums[], without2020: boolean): SituationSums {
  const overallByTeam = new Map<string, Sums>();
  const byTeamValue = new Map<string, Sums>();
  for (const r of teamSums) {
    if (without2020 && r.is2020) continue;
    if (r.situationKey === "venue") overallByTeam.set(r.team, add(overallByTeam.get(r.team) ?? ZERO, r));
    if (r.situationKey === situation.key) {
      const id = `${r.team}|${r.situationValue}`;
      byTeamValue.set(id, add(byTeamValue.get(id) ?? ZERO, r));
    }
  }
  return { overallByTeam, byTeamValue };
}

/** One team in one situation value: its record, raw win % and shrunk estimate. */
export type TeamValueStats = {
  team: string;
  /** The team's games in this value. */
  n: number;
  record: { wins: number; losses: number; ties: number };
  winPct: Estimate | null;
  /** The shrunk win % and the share of it from these games, n / (n + k); null with no games. */
  shrunk: { value: number; weight: number } | null;
  /** The team's win % over all its games in the same seasons. */
  teamWinPct: number | null;
  /** The summed counts behind the figures. */
  own: Sums;
};

/**
 * Every team's figures in one value. The league split weighs every team's
 * games in the value, so the shrunk estimate needs all teams at once.
 */
function statsForValue(situation: Situation, value: string, sums: SituationSums): TeamValueStats[] {
  const { overallByTeam, byTeamValue } = sums;
  const teams = [...overallByTeam.keys()];
  const splits: TeamSplit[] = teams.flatMap((t) => {
    const s = byTeamValue.get(`${t}|${value}`);
    const twp = winPctOf(overallByTeam.get(t)!);
    return s && s.games > 0 && twp !== null ? [{ games: s.games, winPct: winPctOf(s)!, teamWinPct: twp }] : [];
  });
  const ls = leagueSplit(splits);
  return teams.map((team) => {
    const own = byTeamValue.get(`${team}|${value}`) ?? ZERO;
    const teamWinPct = winPctOf(overallByTeam.get(team)!);
    const winPct = winPctEstimate(own);
    const shrunk =
      winPct && teamWinPct !== null && ls !== null
        ? shrunkWinPct({ games: own.games, winPct: winPct.value, teamWinPct, leagueSplit: ls, k: situation.k })
        : null;
    return { team, n: own.games, record: { wins: own.wins, losses: own.losses, ties: own.ties }, winPct, shrunk, teamWinPct, own };
  });
}

/**
 * All teams' figures in one value of a situation, for the leaderboards and
 * This week. `exclude2020` applies the venue rule, as in buildSplits.
 */
export function valueStatsByTeam(
  situation: Situation,
  value: string,
  teamSums: TeamSplitSums[],
  exclude2020: boolean,
): TeamValueStats[] {
  const without2020 = exclude2020 && situation.key === "venue";
  return statsForValue(situation, value, situationSums(situation, teamSums, without2020));
}

/**
 * Build the splits view for one team.
 * `exclude2020`: the range covers 2020 and the viewer hasn't asked to keep
 * it, so the venue block (team rows, league rows and venue's shrinkage)
 * leaves 2020 out. Every other block, and the header, keep it.
 */
export function buildSplits({
  team,
  situations,
  teamSums,
  leagueSums,
  exclude2020,
}: {
  team: string;
  situations: Situation[];
  teamSums: TeamSplitSums[];
  leagueSums: SplitSums[];
  exclude2020: boolean;
}): TierGroup[] {
  const blocks = situations.map((situation) => {
    const without2020 = exclude2020 && situation.key === "venue";
    const keep = (r: SplitSums) => !(without2020 && r.is2020);
    const sums = situationSums(situation, teamSums, without2020);

    const leagueByValue = new Map<string, Sums>();
    for (const r of leagueSums) {
      if (r.situationKey === situation.key && keep(r)) {
        leagueByValue.set(r.situationValue, add(leagueByValue.get(r.situationValue) ?? ZERO, r));
      }
    }

    const overall = sums.overallByTeam.get(team) ?? ZERO;

    const rows: ValueRow[] = situation.values.map(({ value, label }) => {
      const stats = statsForValue(situation, value, sums).find((s) => s.team === team);
      const own = stats?.own ?? ZERO;
      const league = leagueByValue.get(value) ?? ZERO;
      const winPct = stats?.winPct ?? null;
      const shrunk = stats?.shrunk ?? null;

    const comparison: ValueRow["comparison"] =
        situation.level === "team"
          ? {
              level: "team",
              league: situation.sharedValues.includes(value)
                ? null
                : { winPct: winPctEstimate(league), margin: marginOf(league), n: league.games },
            }
          : {
              level: "game",
              total: totalOf(own),
              overPct: overPctEstimate(own),
              league: (() => {
                const games = halve(league);
                return { total: totalOf(games), overPct: overPctEstimate(games), n: games.games };
              })(),
            };

      return {
        value,
        label,
        n: own.games,
        record: { wins: own.wins, losses: own.losses, ties: own.ties },
        winPct,
        shrunk,
        margin: marginOf(own),
        comparison,
      };
    });

    const notes: string[] = [];
    const missing = overall.games - rows.reduce((sum, r) => sum + r.n, 0);
    if (missing > 0) {
      notes.push(
        situation.category === "weather"
          ? `${plural(missing, "game", "games")} under a roof or not yet matched to weather.`
          : `${plural(missing, "game has", "games have")} no recorded ${situation.label.toLowerCase()}.`,
      );
    }
    if (WEATHER_NOTES.has(situation.key)) {
      notes.push("Over % uses the weather that happened; betting totals were set on forecasts.");
    }
    if (situation.level === "team" && situation.key !== "venue") {
      const away = leagueSums.filter((r) => r.situationKey === "venue" && r.situationValue === "away").reduce(add, ZERO);
      const awayPct = winPctOf(away);
      if (awayPct !== null) {
        notes.push(`Across the league, away teams win ${(awayPct * 100).toFixed(1)}% in these seasons.`);
      }
    }

    return {
      situation,
      rows,
      notes,
      overall: { margin: marginOf(overall), total: totalOf(overall) },
      without2020,
    };
  });

  return TIER_ORDER.map((tier) => ({ tier, blocks: blocks.filter((b) => b.situation.tier === tier) })).filter(
    (g) => g.blocks.length > 0,
  );
}

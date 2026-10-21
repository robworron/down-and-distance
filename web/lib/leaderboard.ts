// Leaderboards: every team in one situation value, ranked by the shrunk
// best estimate, with the raw record and n beside it. Pure, so it's
// unit-tested without a database.

import type { Situation, SplitSums, TeamSplitSums } from "./queries";
import { parseSeasonRange, rangeParams, type SearchParams, type SeasonRange } from "./season-range";
import { defaultRange } from "./records";
import { valueStatsByTeam, type TeamValueStats } from "./splits";
import { meanEstimate, overPctEstimate, winPctEstimate, type Estimate } from "./stats";

/** Teams with fewer games than this are greyed out below the ranked ones. */
export const MIN_GAMES_RANKED = 5;

/** Leaderboards open on home games: the one team split that persists (r = 0.41). */
export const DEFAULT_BOARD = { situation: "venue", value: "home" };

export type BoardChoice = { situation: Situation; value: string; range: SeasonRange };
export type BoardRejection = { param: string; value: string; reason: string };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Read the board from the URL. An unknown situation or value is rejected,
 * as in the explorer. An empty value (the form sends one when the
 * situation changes) means the situation's first value.
 */
export function parseBoard(
  params: SearchParams,
  situations: Situation[],
  latest: number,
): { choice: BoardChoice | null; rejected: BoardRejection[] } {
  const range = parseSeasonRange(params, latest);
  const key = first(params.situation) || DEFAULT_BOARD.situation;
  const situation = situations.find((s) => s.key === key);
  if (!situation) return { choice: null, rejected: [{ param: "situation", value: key, reason: "isn't a situation on the site" }] };
  const asked = first(params.value);
  const value = asked || (key === DEFAULT_BOARD.situation ? DEFAULT_BOARD.value : situation.values[0].value);
  if (!situation.values.some((v) => v.value === value)) {
    return {
      choice: null,
      rejected: [{ param: "value", value, reason: `isn't one of the values for ${situation.label.toLowerCase()}` }],
    };
  }
  return { choice: { situation, value, range }, rejected: [] };
}

/** The canonical query string for a board, defaults left out. */
export function boardQuery(situation: string, value: string, range: SeasonRange, latest: number): string {
  const params = new URLSearchParams();
  if (!(situation === DEFAULT_BOARD.situation && value === DEFAULT_BOARD.value)) {
    params.set("situation", situation);
    params.set("value", value);
  }
  for (const [k, v] of rangeParams(range, defaultRange(latest))) params.append(k, v);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type LeaderRow = TeamValueStats & { rank: number | null };

export type BoardLeague =
  | { kind: "win"; winPct: Estimate | null; n: number }
  | { kind: "shared"; total: Estimate | null; overPct: Estimate | null; n: number };

export type Leaderboard = {
  ranked: LeaderRow[];
  greyed: LeaderRow[];
  league: BoardLeague;
  notes: string[];
};

type Counts = Omit<SplitSums, "situationKey" | "situationValue" | "is2020">;

function sumRows(rows: SplitSums[]): Counts {
  const z: Counts = { games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, marginSq: 0, totalPointsSq: 0, ouGames: 0, overs: 0, ouPushes: 0 };
  for (const r of rows) for (const k of Object.keys(z) as (keyof Counts)[]) z[k] += r[k];
  return z;
}

/** Best estimate first; then more games; then the team code, so the order is stable. */
function byEstimate(a: TeamValueStats, b: TeamValueStats): number {
  const ea = a.shrunk?.value ?? -1;
  const eb = b.shrunk?.value ?? -1;
  return eb - ea || b.n - a.n || a.team.localeCompare(b.team);
}

/**
 * Rank every team in one value. Ranked teams have at least MIN_GAMES_RANKED
 * games; the rest (including teams with none) are greyed out below, still
 * in estimate order. The league line follows the level rules: a league
 * win % only for team-level values both teams don't usually share,
 * otherwise scoring, with each game counted once.
 */
export function buildLeaderboard({
  situation,
  value,
  teamSums,
  leagueSums,
  exclude2020,
}: {
  situation: Situation;
  value: string;
  teamSums: TeamSplitSums[];
  leagueSums: SplitSums[];
  exclude2020: boolean;
}): Leaderboard {
  const stats = valueStatsByTeam(situation, value, teamSums, exclude2020).sort(byEstimate);
  const enough = stats.filter((s) => s.n >= MIN_GAMES_RANKED);
  const ranked = enough.map((s, i) => ({ ...s, rank: i + 1 }));
  const greyed = stats.filter((s) => s.n < MIN_GAMES_RANKED).map((s) => ({ ...s, rank: null }));

  const without2020 = exclude2020 && situation.key === "venue";
  const keep = (r: SplitSums) => !(without2020 && r.is2020);
  const league = sumRows(leagueSums.filter((r) => r.situationKey === situation.key && r.situationValue === value && keep(r)));
  const shared = situation.level === "game" || situation.sharedValues.includes(value);
  const boardLeague: BoardLeague = shared
    ? {
        kind: "shared",
        // League rows count each game once per team: halve to get games.
        total: meanEstimate((league.pointsFor + league.pointsAgainst) / 2, league.totalPointsSq / 2, league.games / 2),
        overPct: overPctEstimate({ ouGames: league.ouGames / 2, overs: league.overs / 2, ouPushes: league.ouPushes / 2 }),
        n: league.games / 2,
      }
    : { kind: "win", winPct: winPctEstimate(league), n: league.games };

  const notes: string[] = [];
  if (situation.level === "team" && situation.key !== "venue") {
    const away = sumRows(leagueSums.filter((r) => r.situationKey === "venue" && r.situationValue === "away"));
    const awayPct = winPctEstimate(away);
    if (awayPct) notes.push(`Across the league, away teams win ${(awayPct.value * 100).toFixed(1)}% in these seasons.`);
  }

  return { ranked, greyed, league: boardLeague, notes };
}

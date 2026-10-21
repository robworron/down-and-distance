import "server-only";

import { and, asc, between, desc, eq, inArray, max, sql, type AnyColumn } from "drizzle-orm";

import {
  dimStadiumsInMarts as dimStadiums,
  dimTeamsInMarts as dimTeams,
  gamesInMarts as games,
  martLeagueSplitsInMarts as leagueSplits,
  martTeamSplitsInMarts as teamSplits,
  situationsInMarts as situations,
  teamGamesInMarts as teamGames,
  teamSeasonsInMarts as teamSeasons,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import { excludes2020, type ExplorerState, type ExplorerSums } from "@/lib/explorer";
import type { PlayoffRound, SeasonRecord } from "@/lib/records";
import { seasonTypes, type SeasonRange, type SeasonType } from "@/lib/season-range";

// Every query the site runs lives in this file, and reads only the marts.
// Values reach Postgres as bound parameters ($1, $2, ...), never as SQL text.

/**
 * dbt's tests guarantee a column is never NULL, but the database doesn't
 * enforce it (dbt builds tables with CREATE TABLE AS), so Drizzle types every
 * column as nullable. This narrows the type, and fails loudly if a NULL ever
 * does arrive rather than rendering "null" on the page.
 */
function present<T>(value: T | null, column: string): T {
  if (value === null) throw new Error(`Unexpected NULL in ${column}`);
  return value;
}

export type Team = {
  abbr: string;
  name: string;
  nick: string;
  conference: string;
  division: string;
  color: string;
  color2: string;
};

type DimTeamRow = typeof dimTeams.$inferSelect;

function toTeam(r: DimTeamRow): Team {
  return {
    abbr: present(r.teamAbbr, "dim_teams.team_abbr"),
    name: present(r.teamName, "dim_teams.team_name"),
    nick: present(r.teamNick, "dim_teams.team_nick"),
    conference: present(r.conference, "dim_teams.conference"),
    division: present(r.division, "dim_teams.division"),
    color: present(r.teamColor, "dim_teams.team_color"),
    color2: present(r.teamColor2, "dim_teams.team_color2"),
  };
}

/** All 32 teams in league order: by division (AFC East ... NFC West), then by name. */
export async function getTeams(): Promise<Team[]> {
  const rows = await db.select().from(dimTeams).orderBy(asc(dimTeams.division), asc(dimTeams.teamName));
  return rows.map(toTeam);
}

/** The latest season with a finished game. */
export async function getLatestSeason(): Promise<number | null> {
  const [row] = await db.select({ season: max(teamSplits.season) }).from(teamSplits);
  return row?.season ?? null;
}

export type Stadium = {
  name: string;
  city: string;
  region: string;
  country: string;
  timezone: string;
  altitudeM: number;
  roof: string;
  surface: string;
  surfaceType: string;
};

export type TeamProfile = Team & { stadium: Stadium | null };

/**
 * One team and the stadium it calls home in its latest season (team_seasons
 * picks each season's home: where it played most of its home games), or null
 * for a code that isn't one of the 32 teams.
 */
export async function getTeamProfile(abbr: string): Promise<TeamProfile | null> {
  const [row] = await db
    .select({ team: dimTeams, stadium: dimStadiums })
    .from(dimTeams)
    .leftJoin(teamSeasons, eq(teamSeasons.team, dimTeams.teamAbbr))
    .leftJoin(dimStadiums, eq(dimStadiums.stadiumId, teamSeasons.homeStadiumId))
    .where(eq(dimTeams.teamAbbr, abbr))
    .orderBy(desc(teamSeasons.season))
    .limit(1);
  if (!row) return null;

  const s = row.stadium;
  return {
    ...toTeam(row.team),
    stadium: s && {
      name: present(s.stadiumName, "dim_stadiums.stadium_name"),
      city: present(s.city, "dim_stadiums.city"),
      region: present(s.region, "dim_stadiums.region"),
      country: present(s.country, "dim_stadiums.country"),
      timezone: present(s.timezone, "dim_stadiums.timezone"),
      altitudeM: present(s.altitudeM, "dim_stadiums.altitude_m"),
      roof: present(s.roof, "dim_stadiums.roof"),
      surface: present(s.surface, "dim_stadiums.surface"),
      surfaceType: present(s.surfaceType, "dim_stadiums.surface_type"),
    },
  };
}

/**
 * SUM over one season type only. FILTER (WHERE ...) restricts a single
 * aggregate to the rows that pass, so one GROUP BY can total the regular
 * season and the playoffs side by side. SUM of an integer is a bigint, which
 * the pg driver returns as a string, so ::int brings it back as a number;
 * COALESCE turns "no playoff games" (NULL) into 0.
 */
function sumFor(column: AnyColumn, seasonType: "REG" | "POST") {
  return sql<number>`coalesce(sum(${column}) filter (where ${teamSplits.seasonType} = ${seasonType}), 0)::int`;
}

/** A team's record in every season it has finished games, newest first. */
export async function getSeasonRecords(abbr: string): Promise<SeasonRecord[]> {
  // 1. Results, re-aggregated from mart_team_splits. Every game has a venue
  //    (home, away or neutral), so a team's venue rows add up to all its
  //    finished games: summing them per season gives the season record.
  const totals = await db
    .select({
      season: teamSplits.season,
      games: sumFor(teamSplits.games, "REG"),
      wins: sumFor(teamSplits.wins, "REG"),
      losses: sumFor(teamSplits.losses, "REG"),
      ties: sumFor(teamSplits.ties, "REG"),
      pointsFor: sumFor(teamSplits.pointsFor, "REG"),
      pointsAgainst: sumFor(teamSplits.pointsAgainst, "REG"),
      playoffWins: sumFor(teamSplits.wins, "POST"),
      playoffLosses: sumFor(teamSplits.losses, "POST"),
      playoffTies: sumFor(teamSplits.ties, "POST"),
    })
    .from(teamSplits)
    .where(and(eq(teamSplits.team, abbr), eq(teamSplits.situationKey, "venue")))
    .groupBy(teamSplits.season)
    .orderBy(desc(teamSplits.season));

  // 2. Facts the split marts don't carry (they count finished games only),
  //    read from team_games: games still to play, and the round and result of
  //    the last playoff game. array_agg(... ORDER BY gameday DESC) lists the
  //    season's playoff games newest first, and [1] takes the first.
  const lastPlayoff = (column: AnyColumn) =>
    sql<string | null>`(array_agg(${column} order by ${teamGames.gameday} desc)
      filter (where ${teamGames.seasonType} = 'POST' and ${teamGames.isFinished}))[1]`;
  const extras = await db
    .select({
      season: teamGames.season,
      gamesLeft: sql<number>`count(*) filter (where ${teamGames.seasonType} = 'REG' and not ${teamGames.isFinished})::int`,
      lastRound: lastPlayoff(teamGames.gameType),
      lastResult: lastPlayoff(teamGames.result),
    })
    .from(teamGames)
    .where(eq(teamGames.team, abbr))
    .groupBy(teamGames.season);
  const extrasBySeason = new Map(extras.map((e) => [e.season, e]));

  return totals.map((t) => {
    const season = present(t.season, "mart_team_splits.season");
    const e = extrasBySeason.get(season);
    return {
      season,
      regular: {
        games: t.games,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        pointsFor: t.pointsFor,
        pointsAgainst: t.pointsAgainst,
      },
      playoffs: { wins: t.playoffWins, losses: t.playoffLosses, ties: t.playoffTies },
      lastPlayoffGame:
        e?.lastRound && e.lastResult
          ? { round: e.lastRound as PlayoffRound, result: e.lastResult as "win" | "loss" | "tie" }
          : null,
      gamesLeft: e?.gamesLeft ?? 0,
    };
  });
}

export type Tier = "featured" | "filter" | "context";

export type Situation = {
  key: string;
  label: string;
  description: string;
  /** Filter group: venue, stadium, weather, schedule, travel or matchup. */
  category: string;
  /** game: the same for both teams; team: can differ between them. */
  level: "game" | "team";
  tier: Tier;
  /** The team_games column holding the value (registry column_name). */
  column: string;
  /** The values in display order, each with its label. */
  values: { value: string; label: string }[];
  /** Team-level values both teams usually share: no league comparison. */
  sharedValues: string[];
  /** Shrinkage strength in games (notebook 06). */
  k: number;
};

/** The v1 situations from the registry, in display order. */
export async function getSituations(): Promise<Situation[]> {
  const rows = await db.select().from(situations).where(eq(situations.inV1, true)).orderBy(asc(situations.sortOrder));
  return rows.map((r) => {
    const values = present(r.valueList, "situations.value_list").split("|");
    const labels = present(r.valueLabels, "situations.value_labels").split("|");
    return {
      key: present(r.key, "situations.key"),
      label: present(r.label, "situations.label"),
      description: present(r.description, "situations.description"),
      category: present(r.category, "situations.category"),
      level: present(r.level, "situations.level") as Situation["level"],
      tier: present(r.tier, "situations.tier") as Tier,
      column: present(r.columnName, "situations.column_name"),
      values: values.map((value, i) => ({ value, label: labels[i] })),
      sharedValues: r.sharedValues ? r.sharedValues.split("|") : [],
      k: present(r.shrinkageK, "situations.shrinkage_k"),
    };
  });
}

/** Summed counts for one situation value: what the splits table is built from. */
export type SplitSums = {
  situationKey: string;
  situationValue: string;
  /** True for the 2020 season's rows, so the venue block can leave them out. */
  is2020: boolean;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Σ margin² and Σ (points_for + points_against)², for standard deviations. */
  marginSq: number;
  totalPointsSq: number;
  ouGames: number;
  overs: number;
  ouPushes: number;
};

export type TeamSplitSums = SplitSums & { team: string };

/**
 * The SUMs both split queries select. SUM of an integer is a bigint, which
 * the pg driver returns as a string, so counts come back ::int; the sums of
 * squares are cast to float8 (double precision), which arrives as a number.
 */
function splitSumColumns(t: typeof teamSplits | typeof leagueSplits) {
  const int = (column: AnyColumn) => sql<number>`sum(${column})::int`;
  return {
    situationKey: sql<string>`${t.situationKey}`,
    situationValue: sql<string>`${t.situationValue}`,
    // A literal 2020 (not a bound parameter), so GROUP BY can repeat the
    // same expression and Postgres sees they match.
    is2020: sql<boolean>`(${t.season} = 2020)`,
    games: int(t.games),
    wins: int(t.wins),
    losses: int(t.losses),
    ties: int(t.ties),
    pointsFor: int(t.pointsFor),
    pointsAgainst: int(t.pointsAgainst),
    marginSq: sql<number>`sum(${t.marginSq})::float8`,
    totalPointsSq: sql<number>`sum(${t.totalPointsSq})::float8`,
    ouGames: int(t.ouGames),
    overs: int(t.overs),
    ouPushes: int(t.ouPushes),
  };
}

/**
 * Every team's sums in every situation value over the chosen seasons and
 * season types: about 1,500 rows. All 32 teams, because the shrunk win %
 * needs the league's split, which weighs every team's games. Grouped by
 * whether the season is 2020, so the page can apply the 2020 venue rule
 * without a second query.
 */
export async function getSplitSums(range: SeasonRange, seasonTypes: SeasonType[]): Promise<TeamSplitSums[]> {
  const rows = await db
    .select({ team: sql<string>`${teamSplits.team}`, ...splitSumColumns(teamSplits) })
    .from(teamSplits)
    .where(and(between(teamSplits.season, range.from, range.to), inArray(teamSplits.seasonType, seasonTypes)))
    .groupBy(teamSplits.team, teamSplits.situationKey, teamSplits.situationValue, sql`(${teamSplits.season} = 2020)`);
  return rows;
}

/** The same sums for the whole league (team-games: each game counts once per team). */
export async function getLeagueSplitSums(range: SeasonRange, seasonTypes: SeasonType[]): Promise<SplitSums[]> {
  return db
    .select(splitSumColumns(leagueSplits))
    .from(leagueSplits)
    .where(and(between(leagueSplits.season, range.from, range.to), inArray(leagueSplits.seasonType, seasonTypes)))
    .groupBy(leagueSplits.situationKey, leagueSplits.situationValue, sql`(${leagueSplits.season} = 2020)`);
}

/**
 * The explorer's one statement (step 0.46). The URL never supplies SQL: each
 * filter's column comes from the registry row its key named (and must look
 * like a plain column name), and every value travels as a bound parameter.
 *
 *   matched       finished team-games in the seasons that pass every filter
 *   sides         how many of a game's two rows matched: 1 = one team was in
 *                 the situation, 2 = both were (weather, roof, a shared value)
 *   venue_norms   the league's win % and margin per season and venue
 *   season_norms  the league's points per game and over % per season
 *   usual         the chosen team's games in these seasons, filters or not
 *
 * The norms come from mart_league_splits' venue rows, which hold every
 * finished game. Exported so a test can render it without a database.
 */
export function explorerStatement(state: ExplorerState) {
  const types = seasonTypes(state.range);
  const drop2020 = excludes2020(state);
  // Shared by matched and usual: finished games, the seasons, the season
  // types, and 2020 left out when the venue rule applies.
  const scope = sql.join(
    [
      sql`tg.is_finished`,
      sql`tg.season between ${state.range.from} and ${state.range.to}`,
      sql`tg.season_type = any(${sql.param(types)}::text[])`,
      ...(drop2020 ? [sql`tg.season <> 2020`] : []),
    ],
    sql` and `,
  );
  const filters = state.filters.map((f) => {
    if (!/^[a-z_]+$/.test(f.column)) throw new Error(`Unexpected registry column ${f.column}`);
    // ::text, as the split marts compare values, so any column type works.
    return sql` and tg.${sql.identifier(f.column)}::text = any(${sql.param(f.values)}::text[])`;
  });
  // sql.param keeps an array as one bound parameter ($1 = {REG,POST});
  // a bare array would be spread into ($1, $2).
  const leagueScope = sql`situation_key = 'venue'
      and season between ${state.range.from} and ${state.range.to}
      and season_type = any(${sql.param(types)}::text[])`;
  const team = state.team;

  return sql`
    with matched as (
      select tg.game_id, tg.season, tg.team, tg.is_home, tg.venue, tg.result, tg.margin,
             tg.points_for + tg.points_against as total, tg.total_result
      from ${teamGames} as tg
      where ${scope}${sql.join(filters)}
    ),
    sides as (
      select game_id, count(*) as sides from matched group by game_id
    ),
    venue_norms as (
      select season, situation_value as venue,
             (sum(wins) + 0.5 * sum(ties))::float8 / sum(games) as win_pct,
             sum(points_for - points_against)::float8 / sum(games) as margin
      from ${leagueSplits}
      where ${leagueScope}
      group by season, situation_value
    ),
    season_norms as (
      -- Venue rows count each game once per team; points over team-games
      -- is still points per game, and the over rate is unaffected.
      select season,
             sum(points_for + points_against)::float8 / sum(games) as total,
             sum(overs)::float8 / nullif(sum(ou_games - ou_pushes), 0) as over_pct
      from ${leagueSplits}
      where ${leagueScope}
      group by season
    ),
    usual as (
      select count(*)::int as games,
             count(*) filter (where tg.result = 'win')::int as wins,
             count(*) filter (where tg.result = 'tie')::int as ties,
             coalesce(sum(tg.margin), 0)::float8 as margin
      from ${teamGames} as tg
      where ${scope} and tg.team = ${team}
    )
    select
      count(*) filter (where s.sides = 1)::int as "oneGames",
      count(*) filter (where s.sides = 1 and m.result = 'win')::int as "oneWins",
      count(*) filter (where s.sides = 1 and m.result = 'tie')::int as "oneTies",
      coalesce(sum(m.margin) filter (where s.sides = 1), 0)::float8 as "oneMargin",
      coalesce(sum(m.margin * m.margin) filter (where s.sides = 1), 0)::float8 as "oneMarginSq",
      coalesce(sum(vn.win_pct) filter (where s.sides = 1), 0)::float8 as "oneExpectedWins",
      coalesce(sum(vn.margin) filter (where s.sides = 1), 0)::float8 as "oneExpectedMargin",
      -- Both rows of a shared game matched: count it once, on its home row.
      count(*) filter (where s.sides = 2 and m.is_home)::int as "bothGames",
      coalesce(sum(m.total) filter (where s.sides = 2 and m.is_home), 0)::float8 as "bothTotal",
      coalesce(sum(m.total * m.total) filter (where s.sides = 2 and m.is_home), 0)::float8 as "bothTotalSq",
      count(*) filter (where s.sides = 2 and m.is_home and m.total_result = 'over')::int as "bothOvers",
      count(*) filter (where s.sides = 2 and m.is_home and m.total_result in ('over', 'under'))::int as "bothDecided",
      coalesce(sum(sn.total) filter (where s.sides = 2 and m.is_home), 0)::float8 as "bothExpectedTotal",
      coalesce(sum(sn.over_pct) filter (where s.sides = 2 and m.is_home and m.total_result in ('over', 'under')), 0)::float8
        as "bothExpectedOvers",
      -- The chosen team's own rows (none when no team is chosen: = NULL is never true).
      count(*) filter (where m.team = ${team})::int as "teamGames",
      count(*) filter (where m.team = ${team} and m.result = 'win')::int as "teamWins",
      count(*) filter (where m.team = ${team} and m.result = 'loss')::int as "teamLosses",
      count(*) filter (where m.team = ${team} and m.result = 'tie')::int as "teamTies",
      coalesce(sum(m.margin) filter (where m.team = ${team}), 0)::float8 as "teamMargin",
      coalesce(sum(m.margin * m.margin) filter (where m.team = ${team}), 0)::float8 as "teamMarginSq",
      coalesce(sum(m.total) filter (where m.team = ${team}), 0)::float8 as "teamTotal",
      coalesce(sum(m.total * m.total) filter (where m.team = ${team}), 0)::float8 as "teamTotalSq",
      count(*) filter (where m.team = ${team} and m.total_result = 'over')::int as "teamOvers",
      count(*) filter (where m.team = ${team} and m.total_result in ('over', 'under'))::int as "teamDecided",
      min(u.games) as "usualGames",
      min(u.wins) as "usualWins",
      min(u.ties) as "usualTies",
      min(u.margin) as "usualMargin"
    from usual as u
    left join matched as m on true
    left join sides as s on s.game_id = m.game_id
    left join venue_norms as vn on vn.season = m.season and vn.venue = m.venue
    left join season_norms as sn on sn.season = m.season
  `;
}

/** Run the explorer statement: one row of sums and counts. */
export async function getExplorerSums(state: ExplorerState): Promise<ExplorerSums> {
  const result = await db.execute<ExplorerSums>(explorerStatement(state));
  return result.rows[0];
}

/** One team's side of one game in this week's schedule (step 0.48). */
export type WeekRow = {
  gameId: string;
  season: number;
  week: number;
  /** REG, or the playoff round: WC, DIV, CON, SB. */
  gameType: string;
  gameday: string;
  /** Kickoff on the Eastern wall clock, "2026-10-18 13:00:00"; null if unknown. */
  kickoffEt: string | null;
  team: string;
  opponent: string;
  isHome: boolean;
  venue: string;
  isFinished: boolean;
  pointsFor: number | null;
  pointsAgainst: number | null;
  restDays: number | null;
  restBucket: string | null;
  restAdvantage: string | null;
  /** Betting convention: negative = favourite. */
  teamSpread: number | null;
  spreadRole: string | null;
  timeZoneShift: number | null;
  timeZoneTravel: string | null;
  /** Kickoff on the team's home clock, "10:00:00". */
  bodyClockTime: string | null;
  bodyClock: string | null;
  roofType: string | null;
  isOpenAir: boolean;
  timeSlot: string | null;
  temperatureBucket: string | null;
  windBucket: string | null;
  precipitationBucket: string | null;
  stadiumName: string | null;
  city: string | null;
  /** The building's roof: outdoors, dome or retractable. */
  stadiumRoof: string | null;
};

/**
 * This week's games, both sides of each: the latest season's lowest week
 * with a game still to play (playoff rounds count as weeks). Finished games
 * of that week are included, so a week in progress shows its scores. Empty
 * when no game is scheduled (the offseason before the schedule comes out).
 */
export async function getThisWeek(): Promise<WeekRow[]> {
  const result = await db.execute<WeekRow>(sql`
    with this_week as (
      select season, min(week) as week
      from ${games}
      where not is_finished and season = (select max(season) from ${games})
      group by season
    )
    select tg.game_id as "gameId", tg.season, tg.week, tg.game_type as "gameType",
           tg.gameday::text as gameday, tg.kickoff_et::text as "kickoffEt",
           tg.team, tg.opponent, tg.is_home as "isHome", tg.venue, tg.is_finished as "isFinished",
           tg.points_for as "pointsFor", tg.points_against as "pointsAgainst",
           tg.rest_days as "restDays", tg.rest_bucket as "restBucket", tg.rest_advantage as "restAdvantage",
           tg.team_spread::float8 as "teamSpread", tg.spread_role as "spreadRole",
           tg.time_zone_shift as "timeZoneShift", tg.time_zone_travel as "timeZoneTravel",
           tg.body_clock_time::text as "bodyClockTime", tg.body_clock as "bodyClock",
           tg.roof_type as "roofType", tg.is_open_air as "isOpenAir", tg.time_slot as "timeSlot",
           tg.temperature_bucket as "temperatureBucket", tg.wind_bucket as "windBucket",
           tg.precipitation_bucket as "precipitationBucket",
           st.stadium_name as "stadiumName", st.city, st.roof as "stadiumRoof"
    from ${teamGames} as tg
    join this_week as w on w.season = tg.season and w.week = tg.week
    left join ${dimStadiums} as st on st.stadium_id = tg.stadium_id
    order by tg.kickoff_et nulls last, tg.game_id, tg.is_home
  `);
  return result.rows;
}

/** One season's league sums for one situation value (regular season). */
export type SeasonLeagueSums = {
  season: number;
  situationKey: string;
  situationValue: string;
  games: number;
  wins: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  marginSq: number;
  totalPointsSq: number;
  ouGames: number;
  overs: number;
  ouPushes: number;
};

/**
 * The league's regular-season sums per season for some situations, from
 * mart_league_splits: what This week's featured effects are computed from.
 * Per season, because a total is compared with its own season's average game.
 */
export async function getSeasonLeagueSums(keys: string[], from: number, to: number): Promise<SeasonLeagueSums[]> {
  const int = (column: AnyColumn) => sql<number>`sum(${column})::int`;
  return db
    .select({
      season: sql<number>`${leagueSplits.season}`,
      situationKey: sql<string>`${leagueSplits.situationKey}`,
      situationValue: sql<string>`${leagueSplits.situationValue}`,
      games: int(leagueSplits.games),
      wins: int(leagueSplits.wins),
      ties: int(leagueSplits.ties),
      pointsFor: int(leagueSplits.pointsFor),
      pointsAgainst: int(leagueSplits.pointsAgainst),
      marginSq: sql<number>`sum(${leagueSplits.marginSq})::float8`,
      totalPointsSq: sql<number>`sum(${leagueSplits.totalPointsSq})::float8`,
      ouGames: int(leagueSplits.ouGames),
      overs: int(leagueSplits.overs),
      ouPushes: int(leagueSplits.ouPushes),
    })
    .from(leagueSplits)
    .where(
      and(
        inArray(leagueSplits.situationKey, keys),
        between(leagueSplits.season, from, to),
        eq(leagueSplits.seasonType, "REG"),
      ),
    )
    .groupBy(leagueSplits.season, leagueSplits.situationKey, leagueSplits.situationValue);
}

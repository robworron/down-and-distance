import { pgTable, pgSchema, text, integer, doublePrecision, boolean, timestamp, date, numeric, bigint, time } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const marts = pgSchema("marts");


export const martTeamSplitsInMarts = marts.table("mart_team_splits", {
	team: text(),
	season: integer(),
	seasonType: text("season_type"),
	situationKey: text("situation_key"),
	situationLevel: text("situation_level"),
	situationValue: text("situation_value"),
	games: integer(),
	wins: integer(),
	losses: integer(),
	ties: integer(),
	pointsFor: integer("points_for"),
	pointsAgainst: integer("points_against"),
	marginSq: integer("margin_sq"),
	totalPointsSq: integer("total_points_sq"),
	atsGames: integer("ats_games"),
	atsCovers: integer("ats_covers"),
	atsPushes: integer("ats_pushes"),
	ouGames: integer("ou_games"),
	overs: integer(),
	unders: integer(),
	ouPushes: integer("ou_pushes"),
	statsGames: integer("stats_games"),
	plays: integer(),
	yards: integer(),
	dropbacks: integer(),
	rushes: integer(),
	epa: doublePrecision(),
	successes: integer(),
	defPlays: integer("def_plays"),
	defYards: integer("def_yards"),
	defDropbacks: integer("def_dropbacks"),
	defRushes: integer("def_rushes"),
	defEpa: doublePrecision("def_epa"),
	defSuccesses: integer("def_successes"),
	turnovers: integer(),
	takeaways: integer(),
	sacks: integer(),
	sacksTaken: integer("sacks_taken"),
	thirdDownAttempts: integer("third_down_attempts"),
	thirdDownConversions: integer("third_down_conversions"),
	redZoneTrips: integer("red_zone_trips"),
	redZoneTds: integer("red_zone_tds"),
	penalties: integer(),
	penaltyYards: integer("penalty_yards"),
});

export const situationsInMarts = marts.table("situations", {
	key: text(),
	label: text(),
	category: text(),
	level: text(),
	columnName: text("column_name"),
	valueList: text("value_list"),
	description: text(),
	inV1: boolean("in_v1"),
	tier: text(),
	sortOrder: integer("sort_order"),
	valueLabels: text("value_labels"),
	sharedValues: text("shared_values"),
	shrinkageK: integer("shrinkage_k"),
});

export const dimStadiumsInMarts = marts.table("dim_stadiums", {
	stadiumId: text("stadium_id"),
	stadiumName: text("stadium_name"),
	city: text(),
	region: text(),
	country: text(),
	timezone: text(),
	altitudeM: integer("altitude_m"),
	roof: text(),
	surface: text(),
	surfaceType: text("surface_type"),
});

export const martLeagueSplitsInMarts = marts.table("mart_league_splits", {
	season: integer(),
	seasonType: text("season_type"),
	situationKey: text("situation_key"),
	situationLevel: text("situation_level"),
	situationValue: text("situation_value"),
	games: integer(),
	wins: integer(),
	losses: integer(),
	ties: integer(),
	pointsFor: integer("points_for"),
	pointsAgainst: integer("points_against"),
	marginSq: integer("margin_sq"),
	totalPointsSq: integer("total_points_sq"),
	atsGames: integer("ats_games"),
	atsCovers: integer("ats_covers"),
	atsPushes: integer("ats_pushes"),
	ouGames: integer("ou_games"),
	overs: integer(),
	unders: integer(),
	ouPushes: integer("ou_pushes"),
	statsGames: integer("stats_games"),
	plays: integer(),
	yards: integer(),
	dropbacks: integer(),
	rushes: integer(),
	epa: doublePrecision(),
	successes: integer(),
	defPlays: integer("def_plays"),
	defYards: integer("def_yards"),
	defDropbacks: integer("def_dropbacks"),
	defRushes: integer("def_rushes"),
	defEpa: doublePrecision("def_epa"),
	defSuccesses: integer("def_successes"),
	turnovers: integer(),
	takeaways: integer(),
	sacks: integer(),
	sacksTaken: integer("sacks_taken"),
	thirdDownAttempts: integer("third_down_attempts"),
	thirdDownConversions: integer("third_down_conversions"),
	redZoneTrips: integer("red_zone_trips"),
	redZoneTds: integer("red_zone_tds"),
	penalties: integer(),
	penaltyYards: integer("penalty_yards"),
});

export const dataFreshnessInMarts = marts.table("data_freshness", {
	tableName: text("table_name"),
	lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: 'string' }),
	lastSuccessSeasons: integer("last_success_seasons"),
	rowsInserted: integer("rows_inserted"),
	rowsUpdated: integer("rows_updated"),
	rowsUnchanged: integer("rows_unchanged"),
	rowsDeleted: integer("rows_deleted"),
	lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: 'string' }),
	lastAttemptStatus: text("last_attempt_status"),
});

export const dimTeamsInMarts = marts.table("dim_teams", {
	teamAbbr: text("team_abbr"),
	teamName: text("team_name"),
	teamNick: text("team_nick"),
	conference: text(),
	division: text(),
	teamColor: text("team_color"),
	teamColor2: text("team_color2"),
});

export const gamesInMarts = marts.table("games", {
	gameId: text("game_id"),
	season: integer(),
	week: integer(),
	gameType: text("game_type"),
	isPlayoff: boolean("is_playoff"),
	gameday: date(),
	weekday: text(),
	kickoffEt: timestamp("kickoff_et", { mode: 'string' }),
	kickoffUtc: timestamp("kickoff_utc", { withTimezone: true, mode: 'string' }),
	homeTeam: text("home_team"),
	awayTeam: text("away_team"),
	homeScore: integer("home_score"),
	awayScore: integer("away_score"),
	isFinished: boolean("is_finished"),
	overtime: boolean(),
	homeRest: integer("home_rest"),
	awayRest: integer("away_rest"),
	spreadLine: numeric("spread_line", { precision: 4, scale:  1 }),
	totalLine: numeric("total_line", { precision: 4, scale:  1 }),
	stadiumId: text("stadium_id"),
	stadiumName: text("stadium_name"),
	isNeutralSite: boolean("is_neutral_site"),
	roofType: text("roof_type"),
	surfaceType: text("surface_type"),
	isOpenAir: boolean("is_open_air"),
	temperatureF: numeric("temperature_f"),
	windMph: numeric("wind_mph"),
	precipitationIn: doublePrecision("precipitation_in"),
	snowfallIn: doublePrecision("snowfall_in"),
	temperatureBucket: text("temperature_bucket"),
	windBucket: text("wind_bucket"),
	precipitationBucket: text("precipitation_bucket"),
	timeSlot: text("time_slot"),
	isPrimetime: boolean("is_primetime"),
	opponentType: text("opponent_type"),
	divGame: boolean("div_game"),
});

export const teamGameStatsInMarts = marts.table("team_game_stats", {
	gameId: text("game_id"),
	season: integer(),
	team: text(),
	opponent: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	plays: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	yards: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	dropbacks: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	rushes: bigint({ mode: "number" }),
	epa: doublePrecision(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	successes: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	thirdDownAttempts: bigint("third_down_attempts", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	thirdDownConversions: bigint("third_down_conversions", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	redZoneTrips: bigint("red_zone_trips", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	redZoneTds: bigint("red_zone_tds", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sacksTaken: bigint("sacks_taken", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	interceptions: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fumblesLost: bigint("fumbles_lost", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	turnovers: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	penalties: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	penaltyYards: bigint("penalty_yards", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defPlays: bigint("def_plays", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defYards: bigint("def_yards", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defDropbacks: bigint("def_dropbacks", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defRushes: bigint("def_rushes", { mode: "number" }),
	defEpa: doublePrecision("def_epa"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defSuccesses: bigint("def_successes", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sacks: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	takeaways: bigint({ mode: "number" }),
});

export const teamSeasonsInMarts = marts.table("team_seasons", {
	team: text(),
	season: integer(),
	homeStadiumId: text("home_stadium_id"),
	homeStadiumName: text("home_stadium_name"),
	homeTimezone: text("home_timezone"),
	homeLatitude: doublePrecision("home_latitude"),
	homeLongitude: doublePrecision("home_longitude"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	homeGames: bigint("home_games", { mode: "number" }),
});

export const teamGamesInMarts = marts.table("team_games", {
	gameId: text("game_id"),
	season: integer(),
	week: integer(),
	gameType: text("game_type"),
	isPlayoff: boolean("is_playoff"),
	seasonType: text("season_type"),
	gameday: date(),
	kickoffEt: timestamp("kickoff_et", { mode: 'string' }),
	kickoffUtc: timestamp("kickoff_utc", { withTimezone: true, mode: 'string' }),
	team: text(),
	opponent: text(),
	isHome: boolean("is_home"),
	venue: text(),
	isFinished: boolean("is_finished"),
	pointsFor: integer("points_for"),
	pointsAgainst: integer("points_against"),
	margin: integer(),
	result: text(),
	overtime: boolean(),
	restDays: integer("rest_days"),
	restDiff: integer("rest_diff"),
	restBucket: text("rest_bucket"),
	restAdvantage: text("rest_advantage"),
	teamSpread: numeric("team_spread"),
	spreadRole: text("spread_role"),
	atsResult: text("ats_result"),
	totalLine: numeric("total_line", { precision: 4, scale:  1 }),
	totalResult: text("total_result"),
	homeStadiumId: text("home_stadium_id"),
	travelMiles: integer("travel_miles"),
	timeZoneShift: integer("time_zone_shift"),
	timeZoneTravel: text("time_zone_travel"),
	bodyClockTime: time("body_clock_time"),
	bodyClock: text("body_clock"),
	stadiumId: text("stadium_id"),
	isNeutralSite: boolean("is_neutral_site"),
	roofType: text("roof_type"),
	surfaceType: text("surface_type"),
	isOpenAir: boolean("is_open_air"),
	temperatureF: numeric("temperature_f"),
	windMph: numeric("wind_mph"),
	precipitationIn: doublePrecision("precipitation_in"),
	snowfallIn: doublePrecision("snowfall_in"),
	temperatureBucket: text("temperature_bucket"),
	windBucket: text("wind_bucket"),
	precipitationBucket: text("precipitation_bucket"),
	timeSlot: text("time_slot"),
	isPrimetime: boolean("is_primetime"),
	opponentType: text("opponent_type"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	plays: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	yards: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	dropbacks: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	rushes: bigint({ mode: "number" }),
	epa: doublePrecision(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	successes: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	thirdDownAttempts: bigint("third_down_attempts", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	thirdDownConversions: bigint("third_down_conversions", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	redZoneTrips: bigint("red_zone_trips", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	redZoneTds: bigint("red_zone_tds", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sacksTaken: bigint("sacks_taken", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	interceptions: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fumblesLost: bigint("fumbles_lost", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	turnovers: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	penalties: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	penaltyYards: bigint("penalty_yards", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defPlays: bigint("def_plays", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defYards: bigint("def_yards", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defDropbacks: bigint("def_dropbacks", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defRushes: bigint("def_rushes", { mode: "number" }),
	defEpa: doublePrecision("def_epa"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defSuccesses: bigint("def_successes", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sacks: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	takeaways: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	gameNumber: bigint("game_number", { mode: "number" }),
	prevResult: text("prev_result"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	streak: bigint({ mode: "number" }),
	afterBlowoutLoss: boolean("after_blowout_loss"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	gamesSinceBye: bigint("games_since_bye", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	consecutiveRoadGames: bigint("consecutive_road_games", { mode: "number" }),
});

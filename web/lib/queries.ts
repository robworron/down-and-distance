import "server-only";

import { pool } from "@/lib/db";

export type ScheduleRow = {
  game_id: string;
  game_type: string;
  week: number;
  gameday: string;
  away_team: string;
  home_team: string;
  away_score: number | null;
  home_score: number | null;
};

export async function getSchedules(season: number): Promise<ScheduleRow[]> {
  // raw.schedules stores these as bigint, which the pg driver returns as
  // strings; ::int brings them back as numbers.
  const { rows } = await pool.query<ScheduleRow>(
    `SELECT game_id, game_type, week::int AS week, gameday, away_team, home_team,
            away_score::int AS away_score, home_score::int AS home_score
     FROM raw.schedules
     WHERE season = $1
     ORDER BY gameday, game_id`,
    [season],
  );
  return rows;
}

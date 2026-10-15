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

export async function getSchedules(): Promise<ScheduleRow[]> {
  const { rows } = await pool.query<ScheduleRow>(
    `SELECT game_id, game_type, week, gameday, away_team, home_team, away_score, home_score
     FROM raw.schedules
     ORDER BY gameday, game_id`,
  );
  return rows;
}

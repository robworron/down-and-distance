-- No NFL game at a team's own stadium kicks off before 11:30 am local time:
-- the earliest real ones are three 11:30 am Central playoff games in 2000-01.
-- An earlier local kickoff means the Eastern time nflverse lists is wrong,
-- e.g. 2016_02_TB_ARI, listed at 13:00 ET (10:00 am in Arizona) instead of
-- 16:05: add the game to seeds/schedule_corrections.csv.
-- Finished games only: nflverse lists unscheduled flex games at a placeholder
-- 1:00 pm ET, which is 10:00 am on the West Coast.
-- Returns the offending games.

select
    s.game_id,
    s.kickoff_et,
    st.timezone,
    (s.kickoff_utc at time zone st.timezone)::time as local_kickoff
from {{ ref('stg_schedules') }} as s
join {{ ref('stadiums') }} as st on st.stadium_id = s.stadium_id
where s.location <> 'Neutral'
  and s.home_score is not null
  and (s.kickoff_utc at time zone st.timezone)::time < time '11:30'

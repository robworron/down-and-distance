-- The situation explorer's reference example (step 0.46 Done-when check):
-- teams AWAY in an OUTDOOR game with 15+ mph WIND, regular seasons 2016–2025.
-- The explorer page (/explorer?wind=15_plus&roof=outdoors&venue=away&to=2025)
-- must show the same games, record, margin and venue norm.
--
-- 2020 is left out, as the explorer does by default whenever venue is one of
-- the filters: most of its games were played in empty stadiums.
--
-- Only the away team can match (its opponent is at home), so every game here
-- is "one-sided": we read it from the away team's side and compare it with
-- what away teams did in the same seasons (the venue norm), so wind isn't
-- credited with the ordinary road disadvantage.
--
-- Postgres runs the clauses in this order: FROM -> WHERE -> GROUP BY -> SELECT.

WITH windy_away AS (                 -- the matching team-games: one row each
    SELECT season, result, margin
    FROM marts.team_games            -- two rows per game, one per team
    WHERE is_finished                -- played games only
      AND season_type = 'REG'        -- regular season (the explorer's default)
      AND season BETWEEN 2016 AND 2025
      AND season <> 2020             -- the 2020 venue rule
      AND roof_type = 'outdoors'
      AND wind_bucket = '15_plus'    -- strongest wind over the game window
      AND venue = 'away'
),

away_norm AS (                       -- what away teams did in each season
    SELECT
        season,
        -- win % counts a tie as half a win; the league mart stores counts
        (SUM(wins) + 0.5 * SUM(ties))::float8 / SUM(games) AS win_pct,
        SUM(points_for - points_against)::float8 / SUM(games) AS margin
    FROM marts.mart_league_splits
    WHERE situation_key = 'venue'
      AND situation_value = 'away'
      AND season_type = 'REG'
      AND season BETWEEN 2016 AND 2025
    GROUP BY season                  -- one norm per season
)

SELECT
    COUNT(*)                                       AS games,
    COUNT(*) FILTER (WHERE w.result = 'win')       AS wins,
    COUNT(*) FILTER (WHERE w.result = 'loss')      AS losses,
    COUNT(*) FILTER (WHERE w.result = 'tie')       AS ties,
    ROUND((COUNT(*) FILTER (WHERE w.result = 'win')
           + 0.5 * COUNT(*) FILTER (WHERE w.result = 'tie'))
          / COUNT(*) * 100, 1)                     AS win_pct,
    ROUND(AVG(w.margin), 2)                        AS margin_per_game,
    -- each game's own season's norm, averaged over these games: the norm for
    -- this mix of seasons
    ROUND(AVG(n.win_pct)::numeric * 100, 1)        AS expected_win_pct,
    ROUND(AVG(n.margin)::numeric, 2)               AS expected_margin
FROM windy_away AS w
JOIN away_norm AS n ON n.season = w.season;

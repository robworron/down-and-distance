{#
  Shared column descriptions (step 2.12). A column that appears in several
  models is described once here and referenced from the YAML with
  description: "{{ doc('name') }}", so its meaning can't drift between models.
  persist_docs writes the rendered text into Postgres as column comments.
#}

{% docs game_id %}
Game key from nflverse, e.g. 2017_14_IND_BUF: season, week, away team, home team (team codes as listed that season).
{% enddocs %}

{% docs season %}
NFL season, named by the year it starts: the 2024 season's Super Bowl was played in February 2025.
{% enddocs %}

{% docs week %}
Week of the season. Playoff weeks continue the count (e.g. 19 to 22 since 2021).
{% enddocs %}

{% docs game_type %}
REG (regular season), WC (wild card), DIV (divisional), CON (conference championship) or SB (Super Bowl).
{% enddocs %}

{% docs is_playoff %}
True for any playoff game (game_type other than REG).
{% enddocs %}

{% docs season_type %}
REG for regular-season games, POST for playoffs.
{% enddocs %}

{% docs gameday %}
Date of the game in US Eastern time.
{% enddocs %}

{% docs kickoff_et %}
Kickoff as Eastern wall-clock time (timestamp without time zone), after schedule_corrections. NULL in 1999, when nflverse has no kickoff times.
{% enddocs %}

{% docs kickoff_utc %}
Kickoff as an instant (timestamptz): kickoff_et read in America/New_York, so daylight saving time is handled. NULL in 1999.
{% enddocs %}

{% docs team %}
Team code of today's franchise (OAK, SD and STL games read as LV, LAC and LA).
{% enddocs %}

{% docs opponent %}
The other team in the game, as today's franchise code.
{% enddocs %}

{% docs stadium_id %}
nflverse stadium id, after schedule_corrections (which fixes 8 international games filed under a US stadium). Joins to the stadiums seed.
{% enddocs %}

{% docs is_finished %}
True once the game has a final score.
{% enddocs %}

{% docs overtime %}
True if the game went to overtime. NULL until played.
{% enddocs %}

{% docs total_line %}
Closing over/under line: expected combined points of both teams.
{% enddocs %}

{% docs is_neutral_site %}
True when nflverse lists the game at a neutral site (international games, Super Bowls, the 49ers' three 2020 games in Glendale).
{% enddocs %}

{% docs roof_type %}
Situation "roof": outdoors, dome, retractable_open or retractable_closed. The stadium's physical roof, plus the game's own state for a retractable roof. NULL when unknown (upcoming games, Madrid 2025).
{% enddocs %}

{% docs surface_type %}
Situation "surface": grass (including dessograss hybrids) or turf. The game's surface, else the stadium's usual one.
{% enddocs %}

{% docs is_open_air %}
True when the game was played in the open: its roof was outdoors or open, or the stadium has no roof. Weather columns are NULL when false.
{% enddocs %}

{% docs temperature_f %}
Average temperature over the game window (kickoff to kickoff + 3 hours), in °F, rounded. Open-air games only.
{% enddocs %}

{% docs wind_mph %}
Strongest 10 m wind over the game window, in mph, rounded. Open-air games only.
{% enddocs %}

{% docs precipitation_in %}
Total precipitation (rain plus melted snow) over the 3 hours after kickoff, in inches. Open-air games only; a model estimate.
{% enddocs %}

{% docs snowfall_in %}
Total snowfall over the 3 hours after kickoff, in inches. Open-air games only; a model estimate.
{% enddocs %}

{% docs temperature_bucket %}
Situation "temperature": 32_or_below, 33_to_50, 51_to_79 or 80_or_above, from temperature_f. NULL unless open air with weather.
{% enddocs %}

{% docs wind_bucket %}
Situation "wind": under_10, 10_to_14 or 15_plus, from wind_mph. NULL unless open air with weather.
{% enddocs %}

{% docs precipitation_bucket %}
Situation "precipitation": snow if any snowfall; else heavy_rain from 0.10 in, light_rain from 0.01 in, otherwise none. NULL unless open air with weather.
{% enddocs %}

{% docs time_slot %}
Situation "time slot", by Eastern kickoff: tnf, sunday_early, sunday_late, snf, mnf, saturday or other (international mornings, holiday and Friday games). NULL in 1999.
{% enddocs %}

{% docs is_primetime %}
Situation "primetime": kickoff at 7 pm ET or later. NULL in 1999.
{% enddocs %}

{% docs opponent_type %}
Situation "opponent type": divisional, conference or non_conference. Divisions from nflverse's div_game; conferences from today's teams (Seattle counts as AFC before 2002).
{% enddocs %}

{% docs plays %}
Offensive plays under box-score rules: passes, runs (scrambles included), kneels and spikes; no penalty no-plays or two-point tries. Yards per play = yards / plays.
{% enddocs %}

{% docs yards %}
Total net yards gained on those plays (sacks subtract).
{% enddocs %}

{% docs dropbacks %}
Real pass plays: nflverse's pass flag (attempts, sacks, scrambles), EPA known, no kneels, spikes or two-point tries; penalised snaps kept. Pass rate = dropbacks / (dropbacks + rushes).
{% enddocs %}

{% docs rushes %}
Real run plays: nflverse's rush flag (designed runs), EPA known, no kneels or two-point tries; penalised snaps kept.
{% enddocs %}

{% docs epa %}
Expected points added, summed over real plays (dropbacks + rushes). EPA/play = epa / (dropbacks + rushes).
{% enddocs %}

{% docs successes %}
Real plays with positive EPA. Success rate = successes / (dropbacks + rushes).
{% enddocs %}

{% docs third_down_attempts %}
Third downs that ended in a conversion or a failure (nflverse's flags).
{% enddocs %}

{% docs third_down_conversions %}
Third downs converted to a first down or touchdown. 3rd-down % = conversions / attempts.
{% enddocs %}

{% docs red_zone_trips %}
Drives with a snap (or field-goal try) from the opponent's 20 or closer.
{% enddocs %}

{% docs red_zone_tds %}
Red-zone trips that ended in a touchdown. Red-zone TD % = red_zone_tds / red_zone_trips.
{% enddocs %}

{% docs sacks_taken %}
Times the team's quarterback was sacked.
{% enddocs %}

{% docs interceptions %}
Interceptions thrown.
{% enddocs %}

{% docs fumbles_lost %}
Fumbles lost, charged to the team that lost the ball (the receiving team on punts, the intercepting team on interception returns, otherwise posteam).
{% enddocs %}

{% docs turnovers %}
Interceptions thrown plus fumbles lost. Turnover margin = takeaways - turnovers.
{% enddocs %}

{% docs penalties %}
Accepted penalties charged to the team, on any play.
{% enddocs %}

{% docs penalty_yards %}
Yards of those penalties.
{% enddocs %}

{% docs def_plays %}
Defense: the opponent's plays (box-score rules).
{% enddocs %}

{% docs def_yards %}
Defense: yards allowed (the opponent's yards).
{% enddocs %}

{% docs def_dropbacks %}
Defense: the opponent's dropbacks.
{% enddocs %}

{% docs def_rushes %}
Defense: the opponent's rushes.
{% enddocs %}

{% docs def_epa %}
Defense: EPA allowed (the opponent's EPA); lower is better.
{% enddocs %}

{% docs def_successes %}
Defense: the opponent's successful plays.
{% enddocs %}

{% docs sacks %}
Sacks made by the defense (the opponent's sacks taken).
{% enddocs %}

{% docs takeaways %}
Turnovers forced by the defense (the opponent's turnovers).
{% enddocs %}

{% docs situation_key %}
Situation id from the registry (marts.situations.key), e.g. wind.
{% enddocs %}

{% docs situation_level %}
game: the value is the same for both teams (wind), so league win % is 50% by construction; team: it can differ (venue).
{% enddocs %}

{% docs situation_value %}
The situation's value as text, e.g. 15_plus, home, or true/false for primetime. One of the registry's value_list.
{% enddocs %}

{% docs split_games %}
Finished team-games in the group. Win % = (wins + ties / 2) / games.
{% enddocs %}

{% docs split_wins %}
Games won.
{% enddocs %}

{% docs split_losses %}
Games lost.
{% enddocs %}

{% docs split_ties %}
Games tied; half a win in win %.
{% enddocs %}

{% docs split_points_for %}
Points scored, summed. Points per game = points_for / games.
{% enddocs %}

{% docs split_points_against %}
Points allowed, summed. Margin = points_for - points_against.
{% enddocs %}

{% docs ats_games %}
Games with a point spread (every finished game has one).
{% enddocs %}

{% docs ats_covers %}
Games where margin + team_spread > 0. Cover % = ats_covers / (ats_games - ats_pushes).
{% enddocs %}

{% docs ats_pushes %}
Games where margin + team_spread = 0 (left out of cover %).
{% enddocs %}

{% docs ou_games %}
Games with a total line.
{% enddocs %}

{% docs overs %}
Games whose combined score beat the total line. Over % = overs / (ou_games - ou_pushes).
{% enddocs %}

{% docs unders %}
Games whose combined score fell short of the total line.
{% enddocs %}

{% docs ou_pushes %}
Games whose combined score equalled the total line.
{% enddocs %}

{% docs stats_games %}
Games with play-by-play (2016 on); 0 before. Per-game stats divide by this, not games. The play-by-play sums are NULL when it is 0.
{% enddocs %}

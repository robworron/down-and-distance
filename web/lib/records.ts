// Win-loss records, built from the marts' sums and counts. Rates are always
// computed from summed counts over whatever seasons are chosen, never by
// averaging per-season rates (a 6-game season would weigh as much as 17).

/** A team's results over some set of games: counts and summed points. */
export type Tally = {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
};

export const EMPTY_TALLY: Tally = { games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };

export type PlayoffRound = "WC" | "DIV" | "CON" | "SB";

export type SeasonRecord = {
  season: number;
  regular: Tally;
  playoffs: Pick<Tally, "wins" | "losses" | "ties">;
  /** The team's last finished playoff game that season, if any. */
  lastPlayoffGame: { round: PlayoffRound; result: "win" | "loss" | "tie" } | null;
  /** Regular-season games scheduled but not yet played (a season in progress). */
  gamesLeft: number;
};

/** NFL standings win %: a tie counts as half a win. NULL with no games. */
export function winPct(t: Pick<Tally, "games" | "wins" | "ties">): number | null {
  return t.games === 0 ? null : (t.wins + t.ties / 2) / t.games;
}

/** Points scored minus allowed, per game. NULL with no games. */
export function marginPerGame(t: Tally): number | null {
  return t.games === 0 ? null : (t.pointsFor - t.pointsAgainst) / t.games;
}

/** Add tallies together: the right way to combine seasons. */
export function sumTallies(tallies: Tally[]): Tally {
  return tallies.reduce(
    (sum, t) => ({
      games: sum.games + t.games,
      wins: sum.wins + t.wins,
      losses: sum.losses + t.losses,
      ties: sum.ties + t.ties,
      pointsFor: sum.pointsFor + t.pointsFor,
      pointsAgainst: sum.pointsAgainst + t.pointsAgainst,
    }),
    EMPTY_TALLY,
  );
}

/** The regular-season tally over seasons first..last, inclusive. */
export function regularSeasonTotal(records: SeasonRecord[], first: number, last: number): Tally {
  return sumTallies(records.filter((r) => r.season >= first && r.season <= last).map((r) => r.regular));
}

/** The site's default range: the latest season with games and the two before it. */
export function defaultRange(latestSeason: number): [number, number] {
  return [latestSeason - 2, latestSeason];
}

/** "13–4", or "8–7–1" when there were ties. */
export function formatRecord(t: Pick<Tally, "wins" | "losses" | "ties">): string {
  return `${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ""}`;
}

const ROUND_NAMES: Record<PlayoffRound, string> = {
  WC: "wild-card round",
  DIV: "divisional round",
  CON: "conference final",
  SB: "Super Bowl",
};

/** How a season's playoff run ended, from its last playoff game. */
export function playoffOutcome(last: SeasonRecord["lastPlayoffGame"]): string | null {
  if (!last) return null;
  if (last.round === "SB") return last.result === "win" ? "Won Super Bowl" : "Lost Super Bowl";
  // Any other round's last game is a loss, unless the playoffs are still going.
  return last.result === "win" ? `Won ${ROUND_NAMES[last.round]}` : `Lost ${ROUND_NAMES[last.round]}`;
}

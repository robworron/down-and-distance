import { formatPct, formatSigned } from "@/lib/format";
import { formatRecord, playoffOutcome, winPct, type SeasonRecord } from "@/lib/records";

/** Season-by-season record, newest first: regular season, then the playoffs. */
export function SeasonTable({ records }: { records: SeasonRecord[] }) {
  return (
    <div className="max-w-[760px] overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-rule-strong text-[0.6875rem] tracking-[0.04em] text-muted-foreground uppercase">
            <th scope="col" className="px-3 py-2 text-left font-medium">Season</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">W–L</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Win %</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">PF</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">PA</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Diff</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Playoffs</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const outcome = playoffOutcome(r.lastPlayoffGame);
            const playoffGames = r.playoffs.wins + r.playoffs.losses + r.playoffs.ties;
            return (
              <tr key={r.season} className="border-b last:border-b-0">
                <th scope="row" className="px-3 py-1.5 text-left font-medium">
                  {r.season}
                </th>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  {formatRecord(r.regular)}
                  {r.gamesLeft > 0 && <span className="block text-[0.6875rem] text-muted-foreground">{r.gamesLeft} to play</span>}
                </td>
                <td className="px-3 py-1.5 text-right">{formatPct(winPct(r.regular))}</td>
                <td className="px-3 py-1.5 text-right">{r.regular.pointsFor}</td>
                <td className="px-3 py-1.5 text-right">{r.regular.pointsAgainst}</td>
                <td className="px-3 py-1.5 text-right">{formatSigned(r.regular.pointsFor - r.regular.pointsAgainst, 0)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {playoffGames > 0 ? (
                    <>
                      {formatRecord(r.playoffs)} <span className="text-ink-2">· {outcome}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

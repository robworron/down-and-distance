import { formatPct, formatSigned } from "@/lib/format";
import { formatRecord, marginPerGame, winPct, type Tally } from "@/lib/records";

/** The team's totals over the selected seasons (and playoffs, when chosen): 2×2 on phones. */
export function HeadlineStats({ total, range, playoffs }: { total: Tally; range: [number, number]; playoffs: boolean }) {
  const span = range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
  const stats = [
    [formatRecord(total), `Record, ${span}${playoffs ? ", with playoffs" : ""}`],
    [formatPct(winPct(total)), "Win %"],
    [formatSigned(marginPerGame(total)), "Margin per game"],
    [String(total.games), "Games (n)"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 py-5 sm:flex sm:flex-wrap sm:gap-8">
      {stats.map(([value, label]) => (
        <div key={label} className="flex flex-col-reverse">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-[1.3rem] font-semibold tracking-tight sm:text-2xl">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

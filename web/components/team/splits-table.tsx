import { cn } from "cn";

import { InfoTip } from "@/components/info-tip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount, formatPct, formatShare, formatSigned, formatWholePct } from "@/lib/format";
import { formatRecord } from "@/lib/records";
import type { SituationBlock, ValueRow } from "@/lib/splits";
import type { Estimate } from "@/lib/stats";

const SHRUNK_TIP =
  "A best estimate for a small sample. It starts from the team's usual record, adjusted by how the whole league does in this situation, and adds a share of what these games show. The share grows as games accumulate; most team splits turn out to be mostly luck.";

const pctCi = (e: Estimate | null) => (e?.ci ? `${Math.round(e.ci.low * 100)}–${Math.round(e.ci.high * 100)}%` : null);
const signedCi = (e: Estimate | null) => (e?.ci ? `${formatSigned(e.ci.low)} to ${formatSigned(e.ci.high)}` : null);
// A game total can't be below 0 points, so its interval stops there.
const totalCi = (e: Estimate | null) => (e?.ci ? `${Math.max(0, e.ci.low).toFixed(1)}–${e.ci.high.toFixed(1)}` : null);

/** A figure with an optional second, quieter line (its CI or its n). */
function Figure({ main, sub }: { main: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <>
      <span className="block">{main}</span>
      {sub && <span className="block text-[0.6875rem] leading-tight text-muted-foreground">{sub}</span>}
    </>
  );
}

/** A league figure: its value and n; the CI on hover or focus only. */
function LeagueFigure({ main, ci, n, what }: { main: string; ci: string | null; n: number; what: string }) {
  const sub = `n ${formatCount(n)}`;
  if (!ci) return <Figure main={main} sub={sub} />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="block cursor-help rounded-sm focus-visible:outline-2" aria-label={`${what} ${main}, 95% CI ${ci}, ${sub}`}>
          <Figure main={main} sub={sub} />
        </span>
      </TooltipTrigger>
      <TooltipContent>95% CI {ci}</TooltipContent>
    </Tooltip>
  );
}

const th = "px-2 py-2 text-right font-medium whitespace-nowrap";
const td = "px-2 py-1.5 text-right align-top whitespace-nowrap";

/**
 * One situation's splits. The value column stays pinned while the rest
 * scrolls sideways on phones. The league columns sit under a grouped
 * "League" header on wider screens; on phones that row is dropped and each
 * header says "League ..." itself, so no empty band shows before a swipe.
 */
export function SplitsTable({ block, surface }: { block: SituationBlock; surface: "card" | "secondary" }) {
  const { situation, rows } = block;
  const game = situation.level === "game";
  const teamCols = game ? 8 : 6; // value, n, W–L, win %, shrunk, margin (+ total, over %)
  const sticky = cn("sticky left-0 z-10 shadow-[1px_0_0_var(--border)] md:shadow-none", surface === "card" ? "bg-card" : "bg-secondary");
  const league = cn("border-l", surface === "card" && "bg-secondary/60");
  const leagueHead = (label: string) => (
    <>
      <span className="md:sr-only">League </span>
      {label}
    </>
  );

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        {/* On phones the last column gets room for the edge fade, so a
            fully swiped table never fades a figure. */}
        <table className="w-full text-sm tabular-nums [&_tr>*:last-child]:pr-8 md:[&_tr>*:last-child]:pr-2.5">
          <caption className="sr-only">
            {situation.label}: the team&apos;s record in each value, with the league&apos;s
          </caption>
          <thead className="text-[0.6875rem] tracking-[0.04em] text-muted-foreground uppercase">
            <tr className="hidden md:table-row">
              <td colSpan={teamCols} />
              <th scope="colgroup" colSpan={2} className={cn(league, "border-b px-2.5 pt-2 pb-1 text-center font-medium")}>
                League
              </th>
            </tr>
            <tr className="border-b border-rule-strong">
              <th scope="col" className={cn(sticky, "px-2.5 py-2 text-left font-medium")}>
                {situation.label}
              </th>
              <th scope="col" className={th}>
                n
              </th>
              <th scope="col" className={th}>
                W–L
              </th>
              <th scope="col" className={th}>
                Win %
              </th>
              <th scope="col" className={th}>
                <InfoTip tip={SHRUNK_TIP}>Shrunk</InfoTip>
              </th>
              <th scope="col" className={th}>
                Margin
              </th>
              {game && (
                <>
                  <th scope="col" className={th}>
                    Total
                  </th>
                  <th scope="col" className={th}>
                    Over %
                  </th>
                  <th scope="col" className={cn(th, league)}>
                    {leagueHead("Total")}
                  </th>
                  <th scope="col" className={cn(th, league)}>
                    {leagueHead("Over %")}
                  </th>
                </>
              )}
              {!game && (
                <>
                  <th scope="col" className={cn(th, league)}>
                    {leagueHead("Win %")}
                  </th>
                  <th scope="col" className={cn(th, league)}>
                    {leagueHead("Margin")}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.value} row={row} k={situation.k} sticky={sticky} league={league} />
            ))}
          </tbody>
        </table>
      </div>
      {/* Phones: a fade at the right edge hints that the table scrolls. */}
      <div aria-hidden="true" className={cn("pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent md:hidden", surface === "card" ? "from-card" : "from-secondary")} />
    </div>
  );
}

/** The shrunk win % to one decimal, and where it comes from, on hover or focus. */
function Shrunk({ value, weight, n, k }: { value: number; weight: number; n: number; k: number }) {
  const detail = `${formatPct(value)}: ${formatPct(weight)} from these ${formatCount(n)} ${n === 1 ? "game" : "games"} (k = ${k} games)`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="block cursor-help rounded-sm focus-visible:outline-2" aria-label={`Shrunk win % ${detail}`}>
          <Figure main={formatWholePct(value)} sub={<span className="inline-block xl:max-w-[5.5rem] xl:whitespace-normal">{formatShare(weight)} from these games</span>} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

function Row({ row, k, sticky, league }: { row: ValueRow; k: number; sticky: string; league: string }) {
  const c = row.comparison;
  const empty = row.n === 0;
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <tr className="border-b last:border-b-0">
      <th scope="row" className={cn(sticky, "px-2.5 py-1.5 text-left align-top font-medium whitespace-nowrap")}>
        {row.label}
      </th>
      <td className={td}>{row.n}</td>
      <td className={td}>{empty ? <span className="text-muted-foreground">no games</span> : formatRecord(row.record)}</td>
      <td className={td}>{row.winPct ? <Figure main={formatWholePct(row.winPct.value)} sub={pctCi(row.winPct)} /> : dash}</td>
      <td className={td}>
        {row.shrunk ? <Shrunk value={row.shrunk.value} weight={row.shrunk.weight} n={row.n} k={k} /> : dash}
      </td>
      <td className={td}>{row.margin ? <Figure main={formatSigned(row.margin.value)} sub={signedCi(row.margin)} /> : dash}</td>
      {c.level === "game" && (
        <>
          <td className={td}>{c.total ? <Figure main={c.total.value.toFixed(1)} sub={totalCi(c.total)} /> : dash}</td>
          <td className={td}>{c.overPct ? <Figure main={formatWholePct(c.overPct.value)} sub={pctCi(c.overPct)} /> : dash}</td>
          <td className={cn(td, league)}>
            {c.league.total ? (
              <LeagueFigure main={c.league.total.value.toFixed(1)} ci={totalCi(c.league.total)} n={c.league.n} what="League total" />
            ) : (
              dash
            )}
          </td>
          <td className={cn(td, league)}>
            {c.league.overPct ? (
              <LeagueFigure main={formatPct(c.league.overPct.value)} ci={pctCi(c.league.overPct)} n={c.league.n} what="League over %" />
            ) : (
              dash
            )}
          </td>
        </>
      )}
      {c.level === "team" && (
        <>
          <td className={cn(td, league)}>
            {c.league?.winPct ? (
              <LeagueFigure main={formatPct(c.league.winPct.value)} ci={pctCi(c.league.winPct)} n={c.league.n} what="League win %" />
            ) : (
              dash
            )}
          </td>
          <td className={cn(td, league)}>
            {c.league?.margin ? (
              <LeagueFigure main={formatSigned(c.league.margin.value)} ci={signedCi(c.league.margin)} n={c.league.n} what="League margin" />
            ) : (
              dash
            )}
          </td>
        </>
      )}
    </tr>
  );
}

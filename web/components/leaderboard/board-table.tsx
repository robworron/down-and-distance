import { cn } from "cn";
import Link from "next/link";

import { InfoTip } from "@/components/info-tip";
import { TeamBadge } from "@/components/team-badge";
import { formatPct, formatShare, formatWholePct } from "@/lib/format";
import { MIN_GAMES_RANKED, type LeaderRow } from "@/lib/leaderboard";
import type { Team } from "@/lib/queries";
import { formatRecord } from "@/lib/records";

const ESTIMATE_TIP =
  "A best estimate for a small sample. It starts from the team's usual record, adjusted by how the whole league does in this situation, and adds a share of what these games show. The share grows as games accumulate.";

const th = "px-2 py-2 text-right font-medium whitespace-nowrap";
const td = "px-2 py-1.5 text-right align-top whitespace-nowrap tabular-nums";
const sticky = "sticky left-0 z-10 bg-card shadow-[1px_0_0_var(--border)] md:shadow-none";

function Row({ row, team, href }: { row: LeaderRow; team: Team | undefined; href: string }) {
  const grey = row.rank === null;
  const ci = row.winPct?.ci ? `${Math.round(row.winPct.ci.low * 100)}–${Math.round(row.winPct.ci.high * 100)}%` : null;
  return (
    <tr className={cn("border-b last:border-b-0", grey && "text-muted-foreground")}>
      <td className={cn(td, "text-left")}>{row.rank ?? ""}</td>
      <th scope="row" className={cn(sticky, "px-2 py-1.5 text-left align-top font-medium whitespace-nowrap")}>
        <Link href={href} className={cn("flex items-center gap-2 no-underline", grey ? "text-muted-foreground" : "text-foreground")}>
          <TeamBadge abbr={row.team} color={team?.color ?? "#888888"} className={cn("size-7 text-[0.6875rem]", grey && "opacity-60")} />
          <span>{team?.name ?? row.team}</span>
        </Link>
      </th>
      <td className={td}>
        {row.shrunk ? (
          <>
            <span className="block font-semibold">{formatWholePct(row.shrunk.value)}</span>
            <span className="block text-[0.6875rem] leading-tight text-muted-foreground">
              {formatShare(row.shrunk.weight)} from these games
            </span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className={td}>{formatPct(row.teamWinPct)}</td>
      <td className={td}>{row.n === 0 ? "no games" : formatRecord(row.record)}</td>
      <td className={td}>
        {row.winPct ? (
          <>
            <span className="block">{formatWholePct(row.winPct.value)}</span>
            {ci && <span className="block text-[0.6875rem] leading-tight text-muted-foreground">{ci}</span>}
          </>
        ) : (
          "—"
        )}
      </td>
      <td className={td}>{row.n}</td>
    </tr>
  );
}

/**
 * The board: teams with enough games ranked by the best estimate, then the
 * rest greyed out below. On phones the table scrolls sideways with the team
 * column pinned.
 */
export function BoardTable({
  ranked,
  greyed,
  teams,
  hrefFor,
  valueLabel,
}: {
  ranked: LeaderRow[];
  greyed: LeaderRow[];
  teams: Map<string, Team>;
  hrefFor: (abbr: string) => string;
  valueLabel: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm [&_tr>*:last-child]:pr-8 md:[&_tr>*:last-child]:pr-3">
          <caption className="sr-only">Every team in {valueLabel}, ranked by the best estimate of its win %</caption>
          <thead className="text-[0.6875rem] tracking-[0.04em] text-muted-foreground uppercase">
            <tr className="border-b border-rule-strong">
              <th scope="col" className={cn(th, "text-left")}>
                <span className="sr-only">Rank</span>#
              </th>
              <th scope="col" className={cn(th, sticky, "text-left")}>
                Team
              </th>
              <th scope="col" className={th}>
                <InfoTip tip={ESTIMATE_TIP}>Best estimate</InfoTip>
              </th>
              <th scope="col" className={th}>
                Usual
              </th>
              <th scope="col" className={th}>
                W–L
              </th>
              <th scope="col" className={th}>
                Win %
              </th>
              <th scope="col" className={th}>
                n
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 && (
              <tr className="border-b">
                <td colSpan={7} className="px-3 py-3 text-ink-2">
                  No team has {MIN_GAMES_RANKED} or more games here in these seasons. Try a wider range of seasons.
                </td>
              </tr>
            )}
            {ranked.map((r) => (
              <Row key={r.team} row={r} team={teams.get(r.team)} href={hrefFor(r.team)} />
            ))}
            {greyed.length > 0 && (
              <tr className="border-b bg-secondary/60">
                <th scope="rowgroup" colSpan={7} className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">
                  Fewer than {MIN_GAMES_RANKED} games in these seasons
                </th>
              </tr>
            )}
            {greyed.map((r) => (
              <Row key={r.team} row={r} team={teams.get(r.team)} href={hrefFor(r.team)} />
            ))}
          </tbody>
        </table>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent md:hidden" />
    </div>
  );
}

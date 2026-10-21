import Link from "next/link";

import type { ExplorerResult, Record3 } from "@/lib/explorer";
import { formatCount, formatPct, formatSigned, formatWholePct } from "@/lib/format";
import { formatRecord } from "@/lib/records";
import type { Estimate } from "@/lib/stats";

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** A figure: its value large, its 95% CI (or why there's none) quietly below. */
function Figure({ label, value, ci }: { label: string; value: string; ci?: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {ci !== undefined && <dd className="text-xs text-muted-foreground tabular-nums">{ci ?? "too few games for a range"}</dd>}
    </div>
  );
}

const pctCi = (e: Estimate | null, digits = 1) =>
  e?.ci ? `95% CI ${(e.ci.low * 100).toFixed(digits)}–${(e.ci.high * 100).toFixed(digits)}%` : null;
const signedCi = (e: Estimate | null) => (e?.ci ? `95% CI ${formatSigned(e.ci.low)} to ${formatSigned(e.ci.high)}` : null);
const totalCi = (e: Estimate | null) => (e?.ci ? `95% CI ${Math.max(0, e.ci.low).toFixed(1)}–${e.ci.high.toFixed(1)}` : null);

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4" aria-label={title}>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>
      {children}
    </section>
  );
}

function Comparison({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 border-t pt-2.5 text-sm text-ink-2">{children}</p>;
}

const record = (r: Record3) => formatRecord(r);

/** The league cards (one-sided, shared) and the team card. */
export function ExplorerResults({ result, teamName }: { result: ExplorerResult; teamName: string | null }) {
  const { oneSided, shared, team } = result;
  return (
    <div className="flex flex-col gap-4">
      {result.empty && !result.unfiltered && (
        <p className="rounded-lg border bg-card p-4 text-sm">
          No games match these situations in these seasons. Try a wider range of seasons or one filter fewer.
        </p>
      )}

      {oneSided && (
        <Card
          title="When only one team is in this situation"
          subtitle={`${plural(oneSided.games, "game", "games")}, read from the side in the situation.`}
        >
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
            <Figure label="Record" value={record(oneSided.record)} />
            <Figure label="Win %" value={formatPct(oneSided.winPct?.value ?? null)} ci={pctCi(oneSided.winPct)} />
            <Figure label="Margin per game" value={formatSigned(oneSided.margin?.value ?? null)} ci={signedCi(oneSided.margin)} />
          </dl>
          <Comparison>
            {oneSided.expected.basis === "venue" ? "Teams at the same venue in these seasons: " : "An even game: "}
            {formatPct(oneSided.expected.winPct)} and {formatSigned(oneSided.expected.margin)} a game.{" "}
            <span className="text-foreground">{oneSided.reading}</span>
          </Comparison>
        </Card>
      )}

      {shared && (
        <Card
          title={result.unfiltered ? "All games in these seasons" : "When both teams are in this situation"}
          subtitle={
            result.unfiltered
              ? `${plural(shared.games, "game", "games")}. Pick situations to compare with them.`
              : `${plural(shared.games, "game", "games")}, each counted once. One team wins and the other loses, so these are compared on scoring.`
          }
        >
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
            <Figure label="Points per game, both teams" value={shared.total ? shared.total.value.toFixed(1) : "—"} ci={totalCi(shared.total)} />
            <Figure label="Over %" value={formatPct(shared.overPct?.value ?? null)} ci={pctCi(shared.overPct)} />
          </dl>
          {!result.unfiltered && shared.expected.total !== null && (
            <Comparison>
              The average game in these seasons: {shared.expected.total.toFixed(1)} points
              {shared.expected.overPct !== null && <>, {formatPct(shared.expected.overPct)} over</>}.{" "}
              {shared.reading && <span className="text-foreground">{shared.reading}</span>}
            </Comparison>
          )}
        </Card>
      )}

      {team && (
        <Card
          title={`${teamName ?? team.team} in these games`}
          subtitle={
            team.games === 0
              ? "No games in these situations and seasons."
              : `${plural(team.games, "game", "games")}. A team's record in a combination is usually a handful of games.`
          }
        >
          {team.games > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
              <Figure label="Record" value={record(team.record)} />
              <Figure label="Win %" value={formatWholePct(team.winPct?.value ?? null)} ci={pctCi(team.winPct, 0)} />
              <Figure label="Margin per game" value={formatSigned(team.margin?.value ?? null)} ci={signedCi(team.margin)} />
              {team.showScoring && (
                <>
                  <Figure label="Points per game, both teams" value={team.total ? team.total.value.toFixed(1) : "—"} ci={totalCi(team.total)} />
                  <Figure label="Over %" value={formatWholePct(team.overPct?.value ?? null)} ci={pctCi(team.overPct, 0)} />
                </>
              )}
            </dl>
          )}
          {team.usual.games > 0 && (
            <Comparison>
              Its record in all {plural(team.usual.games, "game", "games")} in these seasons: {formatPct(team.usual.winPct)} and{" "}
              {formatSigned(team.usual.margin)} a game.{" "}
              <Link href={`/teams/${team.team.toLowerCase()}`}>Team page</Link>
            </Comparison>
          )}
        </Card>
      )}

      {result.notes.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {result.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

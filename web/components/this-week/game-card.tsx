import { cn } from "cn";
import Link from "next/link";

import { InfoTip } from "@/components/info-tip";
import { TeamBadge } from "@/components/team-badge";
import type { Team } from "@/lib/queries";
import type { GameCard as Game, SideView, SituationLine } from "@/lib/this-week";

function Line({ line }: { line: SituationLine }) {
  return (
    <li className="py-1.5">
      <p className="text-sm">
        <span className="text-ink-2">{line.label}:</span> <span className="font-medium">{line.value}</span>
        {line.featured && line.key !== "weather" && <span className="ml-1.5 text-xs text-highlight-ink">★</span>}
      </p>
      {line.effect && (
        <p className="text-sm">
          {line.effect.detail ? (
            <InfoTip tip={line.effect.detail} className="text-left">
              {line.effect.text}
            </InfoTip>
          ) : (
            line.effect.text
          )}
        </p>
      )}
      {line.teams.length > 0 && (
        <ul className="mt-0.5 text-xs text-muted-foreground">
          {line.teams.map((t) => (
            <li key={t.team}>
              <Link href={t.href} className="text-muted-foreground hover:text-foreground">
                {t.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Side({ side, label, team }: { side: SideView; label: string; team: Team | undefined }) {
  return (
    <div>
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <TeamBadge abbr={side.team} color={team?.color ?? "#888888"} className="size-6 text-[0.625rem]" />
        <Link href={`/teams/${side.team.toLowerCase()}`} className="text-foreground no-underline hover:underline">
          {team?.name ?? side.team}
        </Link>
        <span className="text-xs font-normal text-muted-foreground">{label}</span>
      </h4>
      <ul className="divide-y">
        {side.featured.map((l) => (
          <Line key={l.key} line={l} />
        ))}
      </ul>
    </div>
  );
}

/** One game: kickoff, teams and score, then the situations each side faces. */
export function GameCard({ game, teams }: { game: Game; teams: Map<string, Team> }) {
  const [away, home] = game.sides;
  return (
    <article className="rounded-lg border bg-card p-4" aria-labelledby={`game-${game.gameId}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`game-${game.gameId}`} className="text-base font-semibold">
          {teams.get(game.away)?.name ?? game.away} {game.neutral ? "vs" : "at"} {teams.get(game.home)?.name ?? game.home}
          {game.score && (
            <span className="ml-2 font-normal text-ink-2 tabular-nums">
              Final: {game.away} {game.score.away}, {game.home} {game.score.home}
            </span>
          )}
        </h3>
        <p className="text-sm text-ink-2">
          {game.kickoff}
          {game.stadium && <> · {game.stadium}</>} · {game.spread}
        </p>
      </header>

      <div className="mt-2 grid gap-x-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Same for both teams" className="md:col-span-2">
          <ul className="divide-y">
            {game.sharedFeatured.map((l) => (
              <Line key={l.key} line={l} />
            ))}
          </ul>
        </section>
        <Side side={away} label={game.neutral ? "" : "away"} team={teams.get(away.team)} />
        <Side side={home} label={game.neutral ? "" : "home"} team={teams.get(home.team)} />
      </div>

      <details className="mt-2 border-t pt-2">
        <summary className="cursor-pointer text-sm text-ink-2">Other situations</summary>
        <div className="mt-1 grid gap-x-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="divide-y md:col-span-2">
            {game.sharedOther.map((l) => (
              <Line key={l.key} line={l} />
            ))}
          </ul>
          {[away, home].map((s) => (
            <div key={s.team}>
              <h4 className={cn("pt-2 text-sm font-semibold")}>{teams.get(s.team)?.name ?? s.team}</h4>
              <ul className="divide-y">
                {s.other.map((l) => (
                  <Line key={l.key} line={l} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

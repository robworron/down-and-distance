import { cn } from "cn";
import Link from "next/link";

import { InfoTip } from "@/components/info-tip";
import { SplitBars } from "@/components/team/split-bars";
import { SplitsTable } from "@/components/team/splits-table";
import { LEVELS, TIERS } from "@/lib/situation-text";
import { splitChart } from "@/lib/split-bars";
import type { SituationBlock, TierGroup } from "@/lib/splits";

export type Toggle2020 = { included: boolean; href: string } | null;

/** Every v1 situation for one team, grouped featured, filter, context. */
export function SplitsSection({ groups, toggle2020, team }: { groups: TierGroup[]; toggle2020: Toggle2020; team: string }) {
  return (
    <div className="mt-8 flex flex-col gap-10">
      <p className="max-w-[72ch] text-sm text-ink-2">
        The team&apos;s record in each situation over the selected seasons, beside the league&apos;s. The small grey figures
        under a value are its 95% confidence interval: the range the games can&apos;t rule out. Win % counts a tie as half a
        win; margin and total are points per game.
      </p>
      {groups.map((group) => (
        <section key={group.tier} aria-labelledby={`tier-${group.tier}`}>
          <h2 id={`tier-${group.tier}`} className="text-lg font-semibold">
            {TIERS[group.tier].title}
          </h2>
          <p className="mt-1 mb-4 max-w-[72ch] text-sm text-ink-2">{TIERS[group.tier].intro}</p>
          <div className="flex flex-col gap-5">
            {group.blocks.map((block) => (
              <Block key={block.situation.key} block={block} team={team} toggle2020={block.situation.key === "venue" ? toggle2020 : null} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Block({ block, team, toggle2020 }: { block: SituationBlock; team: string; toggle2020: Toggle2020 }) {
  const { situation, notes } = block;
  const tier = situation.tier;
  const surface = tier === "context" ? "secondary" : "card";
  const level = LEVELS[situation.level];
  return (
    <article
      aria-labelledby={`situation-${situation.key}`}
      className={cn(
        "overflow-hidden rounded-lg border",
        surface === "card" ? "bg-card" : "bg-secondary",
        tier === "featured" && "border-l-4 border-l-highlight",
      )}
    >
      <header className="px-4 pt-3.5 pb-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h3 id={`situation-${situation.key}`} className="text-base font-semibold">
            {situation.label}
          </h3>
          {tier === "featured" && (
            <span className="rounded-full bg-highlight-wash px-2 py-0.5 text-xs font-medium text-highlight-ink">★ Featured</span>
          )}
          <span className="rounded-full border px-2 py-0.5 text-xs text-ink-2">
            <InfoTip tip={level.tip}>{level.label}</InfoTip>
          </span>
        </div>
        <p className="mt-1 max-w-[72ch] text-sm text-ink-2">{situation.description}</p>
        {toggle2020 && (
          <p className="mt-1.5 text-sm text-ink-2">
            {toggle2020.included
              ? "2020 is included, though most of its games were played in empty stadiums. "
              : "2020 is left out here: most of its games were played in empty stadiums. "}
            <Link href={toggle2020.href} scroll={false}>
              {toggle2020.included ? "Leave 2020 out" : "Include 2020"}
            </Link>
          </p>
        )}
        <p className="mt-1.5 text-xs text-muted-foreground md:hidden">Swipe for more columns →</p>
      </header>
      {/* Table left, chart right from 1,280 px; on phones the table comes first. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-y-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
        <SplitsTable block={block} surface={surface} />
        <div className="max-w-[40rem] px-4 xl:max-w-none xl:border-l xl:pt-1 xl:pb-2">
          <SplitBars chart={splitChart(block)} team={team} surface={surface} />
        </div>
      </div>
      <footer className="px-4 pt-2 pb-3 text-xs text-muted-foreground">
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </footer>
    </article>
  );
}

"use client";

import Form from "next/form";
import Link from "next/link";

import type { Tier } from "@/lib/queries";
import { FIRST_SEASON, type SeasonRange } from "@/lib/season-range";
import { LEVELS, TIERS } from "@/lib/situation-text";

const control = "h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground";

export type FormSituation = {
  key: string;
  label: string;
  level: "game" | "team";
  tier: Tier;
  values: { value: string; label: string }[];
};

/**
 * The explorer's filters as one GET form: submitting it puts every choice
 * in the URL (?wind=15_plus&venue=away&from=2016), the page's only state.
 * Ticking two values of one situation means either; different situations
 * must all hold. It works without JavaScript (the Show button); with
 * JavaScript, any change submits at once.
 */
export function ExplorerForm({
  situations,
  selected,
  range,
  team,
  teams,
  latest,
  presets,
}: {
  situations: FormSituation[];
  selected: Record<string, string[]>;
  range: SeasonRange;
  team: string | null;
  teams: { abbr: string; name: string }[];
  latest: number;
  presets: { label: string; href: string; current: boolean }[];
}) {
  const seasons = Array.from({ length: latest - FIRST_SEASON + 1 }, (_, i) => latest - i);
  const tiers = (["featured", "filter", "context"] as Tier[]).map((tier) => ({
    tier,
    situations: situations.filter((s) => s.tier === tier),
  }));

  return (
    <Form action="/explorer" scroll={false} onChange={(e) => e.currentTarget.requestSubmit()} className="flex flex-col gap-5 text-sm">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-semibold">Seasons</legend>
        <div className="flex flex-wrap items-center gap-2">
          <select name="from" defaultValue={range.from} key={`from-${range.from}`} className={control} aria-label="First season">
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="text-ink-2">to</span>
          <select name="to" defaultValue={range.to} key={`to-${range.to}`} className={control} aria-label="Last season">
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <nav aria-label="Season presets" className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <Link
              key={p.label}
              href={p.href}
              scroll={false}
              aria-current={p.current ? "true" : undefined}
              className={
                p.current
                  ? "rounded-full border border-highlight bg-highlight-wash px-2.5 py-0.5 text-highlight-ink no-underline"
                  : "rounded-full border border-input px-2.5 py-0.5 text-foreground no-underline hover:bg-accent"
              }
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="playoffs"
            value="1"
            defaultChecked={range.playoffs}
            key={`playoffs-${range.playoffs}`}
            className="size-4 accent-primary"
          />
          <span>Include playoffs</span>
        </label>
        {range.with2020 && <input type="hidden" name="with2020" value="1" />}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">Team</span>
        <select name="team" defaultValue={team?.toLowerCase() ?? ""} key={`team-${team}`} className={control}>
          <option value="">The whole league</option>
          {teams.map((t) => (
            <option key={t.abbr} value={t.abbr.toLowerCase()}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {tiers.map(({ tier, situations: group }) => (
        <div key={tier} className="flex flex-col gap-1">
          <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{TIERS[tier].short}</h2>
          {group.map((s) => {
            const chosen = selected[s.key] ?? [];
            return (
              <details key={s.key} open={chosen.length > 0} className="rounded-md border bg-card px-3 py-1.5">
                <summary className="cursor-pointer py-0.5">
                  <span className="font-medium">{s.label}</span>
                  {chosen.length > 0 && <span className="ml-1.5 text-highlight-ink">({chosen.length})</span>}
                  <span className="ml-2 text-xs text-muted-foreground">{LEVELS[s.level].label.toLowerCase()}</span>
                </summary>
                <fieldset className="flex flex-col gap-1 pt-1 pb-1.5">
                  <legend className="sr-only">{s.label}</legend>
                  {s.values.map((v) => {
                    const checked = chosen.includes(v.value);
                    return (
                      <label key={v.value} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name={s.key}
                          value={v.value}
                          defaultChecked={checked}
                          key={`${s.key}-${v.value}-${checked}`}
                          className="size-4 accent-primary"
                        />
                        <span>{v.label}</span>
                      </label>
                    );
                  })}
                </fieldset>
              </details>
            );
          })}
        </div>
      ))}

      <noscript>
        <button type="submit" className={`${control} font-medium`}>
          Show
        </button>
      </noscript>
    </Form>
  );
}

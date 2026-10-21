import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSigned } from "@/lib/format";
import { formatRecord } from "@/lib/records";
import { clipped, toPercent, type Bar, type SplitChart } from "@/lib/split-bars";

/**
 * Horizontal bars for one situation: the team's margin per game (team-level
 * situations) or game total (game-level) in each value, with 95% CI whiskers,
 * a line for the team's all-games figure and a tall tick for the league in
 * that value. Drawn with HTML and CSS percentages rather than a chart
 * library, so text keeps its size at every width. One series, so no legend:
 * the title names it. The table beside it is the chart's text equivalent.
 *
 * Colour roles: bars var(--bar), whiskers var(--whisker), the reference line
 * var(--highlight-ink), the league tick var(--foreground). Direction from
 * zero carries the sign, never colour.
 */
export function SplitBars({ chart, team, surface }: { chart: SplitChart; team: string; surface: "card" | "secondary" }) {
  const { domain, ticks, reference } = chart;
  const fmt = (x: number) => (chart.kind === "margin" ? formatSigned(x) : x.toFixed(1));
  const tickLabel = (x: number) => (chart.kind === "margin" ? formatSigned(x, 0) : String(x));
  const pct = (x: number) => toPercent(x, domain);
  const zero = pct(0);

  return (
    <figure
      className="m-0 [--label:7.5rem] [--value:3rem]"
      style={{ ["--chart-surface" as string]: surface === "card" ? "var(--card)" : "var(--secondary)" }}
    >
      <figcaption className="mb-2 text-xs font-medium text-ink-2">{chart.title}</figcaption>
      <div className="relative">
        {/* Gridlines, the zero line and the reference line, behind the rows only. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-[calc(var(--value)+0.75rem)] left-[calc(var(--label)+0.75rem)]">
          {ticks.map((t) => (
            <div
              key={t}
              className={cn("absolute inset-y-0 w-px", t === 0 ? "bg-muted-foreground" : "bg-border")}
              style={{ left: `${pct(t)}%` }}
            />
          ))}
          {reference !== null && (
            <div className="absolute inset-y-0 w-[1.5px] -translate-x-1/2 bg-highlight-ink" style={{ left: `${pct(reference)}%` }} />
          )}
        </div>

        <ul aria-label={chart.title} className="relative m-0 list-none p-0">
          {chart.bars.map((bar) => (
            <Row key={bar.value} bar={bar} chart={chart} fmt={fmt} pct={pct} zero={zero} />
          ))}
        </ul>
      </div>

      {/* Axis labels. */}
      <div aria-hidden="true" className="relative mt-1 h-4 text-[0.6875rem] text-muted-foreground tabular-nums">
        <div className="absolute inset-y-0 right-[calc(var(--value)+0.75rem)] left-[calc(var(--label)+0.75rem)]">
          {ticks.map((t) => (
            <span key={t} className="absolute top-0 -translate-x-1/2" style={{ left: `${pct(t)}%` }}>
              {tickLabel(t)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="mr-1 inline-block h-3 w-[1.5px] translate-y-0.5 bg-highlight-ink align-baseline" aria-hidden="true" />
        Line: all {team} games in these seasons{reference !== null ? ` (${fmt(reference)})` : ""}.{" "}
        <span className="mr-1 ml-1 inline-block h-3 w-[2px] translate-y-0.5 bg-foreground align-baseline" aria-hidden="true" />
        Tall tick: the league in that value.
      </p>
    </figure>
  );
}

function Row({
  bar,
  chart,
  fmt,
  pct,
  zero,
}: {
  bar: Bar;
  chart: SplitChart;
  fmt: (x: number) => string;
  pct: (x: number) => number;
  zero: number;
}) {
  const e = bar.estimate;
  const unit = chart.kind === "margin" ? "points per game" : "points per game, both teams";
  const ci = e?.ci ? `${fmt(e.ci.low)} to ${fmt(e.ci.high)}` : null;
  const games = `${bar.n} ${bar.n === 1 ? "game" : "games"}`;
  const summary = e
    ? `${bar.label}: ${fmt(e.value)} ${unit}${ci ? `, 95% CI ${ci}` : ""}, ${games}, ${formatRecord(bar.record)}${
        bar.league !== null ? `; league ${fmt(bar.league)}` : ""
      }`
    : `${bar.label}: no games${bar.league !== null ? `; league ${fmt(bar.league)}` : ""}`;

  const row = (
    <li
      tabIndex={0}
      aria-label={summary}
      className="grid h-8 grid-cols-[var(--label)_minmax(0,1fr)_var(--value)] items-center gap-x-3 rounded-sm outline-offset-0 hover:bg-accent/60 focus-visible:outline-2"
    >
      <span className="truncate text-sm leading-tight">
        {bar.label} <span className="text-[0.6875rem] text-muted-foreground tabular-nums">n {bar.n}</span>
      </span>
      <span className="relative h-full" aria-hidden="true">
        {e && <BarMarks estimate={e} chart={chart} pct={pct} zero={zero} />}
        {bar.league !== null && (
          <span
            className="absolute top-1/2 h-[26px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-foreground shadow-[0_0_0_1px_var(--chart-surface)]"
            style={{ left: `${pct(bar.league)}%` }}
          />
        )}
      </span>
      <span className="text-right text-sm tabular-nums">{e ? fmt(e.value) : <span className="text-muted-foreground">—</span>}</span>
    </li>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="top" className="flex-col items-start gap-0.5">
        {e ? (
          <>
            <span className="text-sm font-semibold tabular-nums">
              {fmt(e.value)} <span className="text-xs font-normal">{unit}</span>
            </span>
            {ci && <span className="tabular-nums">95% CI {ci}</span>}
            <span>
              {bar.label} · {games} · {formatRecord(bar.record)}
            </span>
          </>
        ) : (
          <span>{bar.label} · no games</span>
        )}
        {bar.league !== null && <span className="tabular-nums">League in this value: {fmt(bar.league)}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** The bar from zero, its CI whisker, and arrowheads where either runs off the axis. */
function BarMarks({
  estimate,
  chart,
  pct,
  zero,
}: {
  estimate: NonNullable<Bar["estimate"]>;
  chart: SplitChart;
  pct: (x: number) => number;
  zero: number;
}) {
  const end = pct(estimate.value);
  const positive = estimate.value >= 0;
  const [low, high] = chart.domain;
  const barClipped = estimate.value < low || estimate.value > high;
  const ci = estimate.ci;
  const off = ci ? clipped(ci, chart.domain) : null;

  return (
    <>
      {/* 14 px thick, square at zero, a 4 px rounded data end. */}
      <span
        className={cn("absolute top-1/2 h-[14px] -translate-y-1/2 bg-bar", positive ? "rounded-r-[4px]" : "rounded-l-[4px]")}
        style={{ left: `${Math.min(zero, end)}%`, width: `${Math.abs(end - zero)}%` }}
      />
      {barClipped && <Arrow side={positive ? "right" : "left"} className="text-bar" />}
      {ci && (
        <>
          {/* The whisker wears a thin surface-coloured halo, so it stays visible where it crosses its bar. */}
          <span
            className="absolute top-1/2 h-[1.5px] -translate-y-1/2 bg-whisker shadow-[0_0_0_1px_var(--chart-surface)]"
            style={{ left: `${pct(ci.low)}%`, width: `${pct(ci.high) - pct(ci.low)}%` }}
          />
          {off!.low ? (
            <Arrow side="left" className="text-whisker" />
          ) : (
            <Cap at={pct(ci.low)} />
          )}
          {off!.high ? <Arrow side="right" className="text-whisker" /> : <Cap at={pct(ci.high)} />}
        </>
      )}
    </>
  );
}

function Cap({ at }: { at: number }) {
  return (
    <span
      className="absolute top-1/2 h-2 w-[1.5px] -translate-x-1/2 -translate-y-1/2 bg-whisker shadow-[0_0_0_1px_var(--chart-surface)]"
      style={{ left: `${at}%` }}
    />
  );
}

/** An arrowhead at the axis end: the mark continues off the scale. */
function Arrow({ side, className }: { side: "left" | "right"; className?: string }) {
  return (
    <svg
      viewBox="0 0 6 8"
      className={cn("absolute top-1/2 h-2 w-1.5 -translate-y-1/2", side === "right" ? "-right-1.5" : "-left-1.5", className)}
    >
      <path d={side === "right" ? "M0 0 L6 4 L0 8 Z" : "M6 0 L0 4 L6 8 Z"} fill="currentColor" />
    </svg>
  );
}

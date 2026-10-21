"use client";

import Form from "next/form";
import Link from "next/link";

import { FIRST_SEASON, rangePresets, rangeQuery, type SeasonRange } from "@/lib/season-range";

const control = "h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground";

/**
 * The season range, as a GET form: submitting it puts the choices in the URL
 * (?from=2023&to=2025&playoffs=1), which is the page's only state. It works
 * without JavaScript (the Show button); with JavaScript, next/form navigates
 * without a full reload and any change submits at once.
 */
export function RangeControls({ basePath, range, latest }: { basePath: string; range: SeasonRange; latest: number }) {
  const seasons = Array.from({ length: latest - FIRST_SEASON + 1 }, (_, i) => latest - i);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2.5">
      <Form
        action=""
        scroll={false}
        onChange={(e) => e.currentTarget.requestSubmit()}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"
      >
        <label className="flex items-center gap-1.5">
          <span className="text-ink-2">Seasons</span>
          <select name="from" defaultValue={range.from} key={`from-${range.from}`} className={control} aria-label="First season">
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-ink-2">to</span>
          <select name="to" defaultValue={range.to} key={`to-${range.to}`} className={control} aria-label="Last season">
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
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
        <noscript>
          <button type="submit" className={`${control} font-medium`}>
            Show
          </button>
        </noscript>
      </Form>
      <nav aria-label="Season presets" className="flex flex-wrap gap-1.5 text-sm">
        {rangePresets(range, latest).map((p) => {
          const current = p.range.from === range.from && p.range.to === range.to;
          return (
            <Link
              key={p.label}
              href={`${basePath}${rangeQuery(p.range, latest)}`}
              scroll={false}
              aria-current={current ? "true" : undefined}
              className={
                current
                  ? "rounded-full border border-highlight bg-highlight-wash px-2.5 py-0.5 text-highlight-ink no-underline"
                  : "rounded-full border border-input px-2.5 py-0.5 text-foreground no-underline hover:bg-accent"
              }
            >
              {p.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

"use client";

import Form from "next/form";
import Link from "next/link";

import { FIRST_SEASON, type SeasonRange } from "@/lib/season-range";

const control = "h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground";

/**
 * The board's choices as a GET form (?situation=wind&value=15_plus&from=2024):
 * the URL is the page's only state. Changing the situation leaves the value
 * out, so the page opens on that situation's first value instead of a value
 * that belongs to the old one. Works without JavaScript (the Show button).
 */
export function BoardForm({
  situations,
  situation,
  value,
  values,
  range,
  latest,
  presets,
}: {
  situations: { key: string; label: string }[];
  situation: string;
  value: string;
  range: SeasonRange;
  latest: number;
  values: { value: string; label: string }[];
  presets: { label: string; href: string; current: boolean }[];
}) {
  const seasons = Array.from({ length: latest - FIRST_SEASON + 1 }, (_, i) => latest - i);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2.5">
      <Form
        action="/leaderboards"
        scroll={false}
        onChange={(e) => {
          const form = e.currentTarget;
          if ((e.target as HTMLElement).getAttribute("name") === "situation") {
            const valueSelect = form.elements.namedItem("value") as HTMLSelectElement | null;
            if (valueSelect) valueSelect.disabled = true; // disabled fields aren't sent
          }
          form.requestSubmit();
        }}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"
      >
        <label className="flex items-center gap-1.5">
          <span className="text-ink-2">Situation</span>
          <select name="situation" defaultValue={situation} key={`s-${situation}`} className={control} aria-label="Situation">
            {situations.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-ink-2">Value</span>
          <select name="value" defaultValue={value} key={`v-${situation}-${value}`} className={control} aria-label="Value">
            {values.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
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
    </div>
  );
}

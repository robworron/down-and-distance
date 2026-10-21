// The season range a page shows, kept in the URL so a link reproduces the
// view: ?from=2023&to=2025&playoffs=1&with2020=1. Every parameter is optional;
// missing or unreadable ones fall back to the defaults, and links built here
// leave the defaults out, so the plain URL is the default view.

import { defaultRange } from "./records";

/** The first season in the marts (schedules start in 1999). */
export const FIRST_SEASON = 1999;

export type SeasonRange = {
  from: number;
  to: number;
  /** Add the playoffs to the regular season. Default: regular season only. */
  playoffs: boolean;
  /** Keep 2020 in home/away splits. Default: left out (mostly empty stadiums). */
  with2020: boolean;
};

export type SeasonType = "REG" | "POST";

/** What Next.js passes a page as `searchParams`: a key may repeat. */
export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A four-digit season, or null for anything else ("abc", "20.5", ""). */
function parseSeason(value: string | undefined): number | null {
  return value !== undefined && /^\d{4}$/.test(value) ? Number(value) : null;
}

const clamp = (x: number, low: number, high: number) => Math.min(Math.max(x, low), high);

/**
 * Read the range from the URL. Seasons are clamped to FIRST_SEASON..latest,
 * a reversed range is swapped, and anything unreadable takes its default
 * (the latest three seasons unless the page passes its own, regular season
 * only, 2020 left out of venue). Unknown parameters are ignored.
 */
export function parseSeasonRange(
  params: SearchParams,
  latest: number,
  defaults: [number, number] = defaultRange(latest),
): SeasonRange {
  const [defaultFrom, defaultTo] = defaults;
  let from = clamp(parseSeason(first(params.from)) ?? defaultFrom, FIRST_SEASON, latest);
  let to = clamp(parseSeason(first(params.to)) ?? defaultTo, FIRST_SEASON, latest);
  if (from > to) [from, to] = [to, from];
  return { from, to, playoffs: first(params.playoffs) === "1", with2020: first(params.with2020) === "1" };
}

/** The season types to sum: the regular season, plus the playoffs when asked. */
export function seasonTypes(range: SeasonRange): SeasonType[] {
  return range.playoffs ? ["REG", "POST"] : ["REG"];
}

/** True when 2020 falls inside the range, which is when the venue rule applies. */
export function includes2020(range: SeasonRange): boolean {
  return range.from <= 2020 && 2020 <= range.to;
}

/** The query string for a range, without the defaults: "" for the default view. */
export function rangeQuery(range: SeasonRange, latest: number, defaults: [number, number] = defaultRange(latest)): string {
  const params = rangeParams(range, defaults);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The range's non-default settings as URL parameters, for pages that add their own. */
export function rangeParams(range: SeasonRange, [defaultFrom, defaultTo]: [number, number]): URLSearchParams {
  const params = new URLSearchParams();
  if (range.from !== defaultFrom) params.set("from", String(range.from));
  if (range.to !== defaultTo) params.set("to", String(range.to));
  if (range.playoffs) params.set("playoffs", "1");
  if (range.with2020) params.set("with2020", "1");
  return params;
}

/** The preset ranges offered beside the selects, keeping the other settings. */
export function rangePresets(range: SeasonRange, latest: number): { label: string; range: SeasonRange }[] {
  const preset = (label: string, from: number) => ({ label, range: { ...range, from, to: latest } });
  return [
    preset("Last 3", latest - 2),
    preset("Last 5", latest - 4),
    preset("Since 2016", 2016),
    preset("All", FIRST_SEASON),
  ];
}

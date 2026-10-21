// This week: each game with the situations each side faces. Featured
// situations lead with their league-wide effect (lib/effects.ts); every
// situation carries the team's own record and best estimate over the
// default seasons. Pure, so it's unit-tested without a database.

import { effectId, type FeaturedEffect } from "./effects";
import { formatCount, formatPct, formatSigned, formatWholePct } from "./format";
import type { Situation, TeamSplitSums, WeekRow } from "./queries";
import { formatRecord } from "./records";
import { valueStatsByTeam, type TeamValueStats } from "./splits";

/** A team's own line under a situation: its record and best estimate there. */
export type TeamLine = { team: string; text: string; href: string };

export type SituationLine = {
  key: string;
  /** "Rest advantage". */
  label: string;
  /** "3+ days more", or a status such as "Forecast not available yet." */
  value: string;
  featured: boolean;
  /** For featured values: the league-wide effect in a sentence, and its CI for the tooltip. */
  effect: { text: string; detail: string } | null;
  teams: TeamLine[];
};

export type SideView = { team: string; isHome: boolean; featured: SituationLine[]; other: SituationLine[] };

export type GameCard = {
  gameId: string;
  /** "Sun Oct 18, 1:00 pm ET". */
  kickoff: string;
  stadium: string | null;
  finished: boolean;
  away: string;
  home: string;
  /** Final score, away first, when finished. */
  score: { away: number; home: number } | null;
  neutral: boolean;
  spread: string;
  /** The same for both teams: roof and weather (featured), time slot (other). */
  sharedFeatured: SituationLine[];
  sharedOther: SituationLine[];
  sides: [SideView, SideView];
};

export type ThisWeek = {
  /** "Week 6" or "Wild-card round". */
  title: string;
  /** "Oct 15–19". */
  dates: string;
  games: GameCard[];
  /** Teams without a game this week (regular season only). */
  byes: string[];
};

const ROUNDS: Record<string, string> = {
  WC: "Wild-card round",
  DIV: "Divisional round",
  CON: "Conference championships",
  SB: "Super Bowl",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-18" -> day of week, month and day, read as a calendar date (no time zone). */
function calendar(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { day: DAYS[weekday], month: MONTHS[m - 1], date: d };
}

/** "13:05:00" -> "1:05 pm". */
export function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The Eastern kickoff as "Sun Oct 18, 1:00 pm ET" (nflverse times are Eastern wall-clock times). */
export function kickoffText(gameday: string, kickoffEt: string | null): string {
  const c = calendar(gameday);
  const time = kickoffEt ? `, ${clock(kickoffEt.slice(11, 19))} ET` : "";
  return `${c.day} ${c.month} ${c.date}${time}`;
}

function dateRange(days: string[]): string {
  const sorted = [...days].sort();
  const a = calendar(sorted[0]);
  const b = calendar(sorted[sorted.length - 1]);
  if (sorted[0] === sorted[sorted.length - 1]) return `${a.month} ${a.date}`;
  return a.month === b.month ? `${a.month} ${a.date}–${b.date}` : `${a.month} ${a.date}–${b.month} ${b.date}`;
}

/** The spread in words, from the home team's line: "BAL favoured by 3". */
export function spreadText(home: WeekRow, away: WeekRow): string {
  if (home.teamSpread === null) return "No line yet";
  if (Math.abs(home.teamSpread) < 0.5) return "Pick'em";
  const fav = home.teamSpread < 0 ? home : away;
  return `${fav.team} favoured by ${Math.abs(home.teamSpread)}`;
}

/** What the page can say about a game's weather until forecasts are loaded. */
export function weatherStatus(r: WeekRow, labels: Map<string, Map<string, string>>): string {
  if (r.roofType === "dome") return "Indoors: weather doesn't apply.";
  if (r.roofType === "retractable_closed") return "Roof closed: weather doesn't apply.";
  if (r.roofType === null && r.stadiumRoof === "retractable") {
    return "Retractable roof: open or closed is decided on game day.";
  }
  if (!r.isFinished) return "Forecast not available yet.";
  const parts = [
    ["temperature", r.temperatureBucket],
    ["precipitation", r.precipitationBucket],
    ["wind", r.windBucket],
  ]
    .filter(([, v]) => v !== null)
    .map(([k, v]) => labels.get(k!)?.get(v!) ?? v!);
  return parts.length > 0 ? `${parts.join(", ")}.` : "Recorded weather is added about a week after the game.";
}

/** The league-wide effect of a featured value, in a plain sentence. */
export function effectSentence(key: string, value: string, valueLabel: string, e: FeaturedEffect | undefined): SituationLine["effect"] {
  if (key === "rest_advantage" && value === "even") return { text: "No rest edge either way.", detail: "" };
  if (!e) return null;
  const span = "1999–2025";
  if (e.kind === "points") {
    const x = e.effect.value;
    const ci = e.effect.ci ? `95% CI ${formatSigned(e.effect.ci.low)} to ${formatSigned(e.effect.ci.high)} points` : "";
    const over = e.overDiff === null ? "" : `; over % ${formatSigned(e.overDiff * 100)} points against the league`;
    return {
      text: `${valueLabel}: ${Math.abs(x).toFixed(1)} ${x >= 0 ? "more" : "fewer"} points a game than the average game (${formatCount(e.games)} games, ${span}).`,
      detail: `${ci}${over}`,
    };
  }
  const m = e.margin?.value ?? 0;
  return {
    text:
      value === "less_rest"
        ? `Teams with 3+ days less rest won ${formatPct(e.winPct.value)} and were outscored by ${Math.abs(m).toFixed(1)} a game (${formatCount(e.games)} games, ${span}).`
        : `Teams with 3+ days more rest won ${formatPct(e.winPct.value)} and outscored opponents by ${Math.abs(m).toFixed(1)} a game (${formatCount(e.games)} games, ${span}).`,
    detail: e.winPct.ci ? `Win % 95% CI ${formatPct(e.winPct.ci.low)}–${formatPct(e.winPct.ci.high)}` : "",
  };
}

type Context = {
  situations: Map<string, Situation>;
  labels: Map<string, Map<string, string>>;
  effects: Map<string, FeaturedEffect>;
  stats: (key: string, value: string) => Map<string, TeamValueStats>;
  /** "2024–26" for the team lines. */
  span: string;
  /** The team page's query string for the default range ("" when it's the page's own default). */
  rangeQuery: string;
};

function teamLine(ctx: Context, key: string, value: string, team: string): TeamLine {
  const s = ctx.stats(key, value).get(team);
  const href = `/teams/${team.toLowerCase()}${ctx.rangeQuery}#situation-${key}`;
  if (!s || s.n === 0) return { team, text: `${team}, ${ctx.span}: no games here`, href };
  const est = s.shrunk ? ` · best estimate ${formatWholePct(s.shrunk.value)}` : "";
  return { team, text: `${team}, ${ctx.span}: ${formatRecord(s.record)}${est}`, href };
}

function line(ctx: Context, key: string, value: string | null, teams: string[], extra?: string): SituationLine | null {
  const situation = ctx.situations.get(key);
  if (!situation || value === null) return null;
  const valueLabel = ctx.labels.get(key)?.get(value) ?? value;
  const featured = situation.tier === "featured";
  return {
    key,
    label: situation.label,
    value: extra ? `${valueLabel} (${extra})` : valueLabel,
    featured,
    effect: featured ? effectSentence(key, value, valueLabel, ctx.effects.get(effectId(key, value))) : null,
    teams: teams.map((t) => teamLine(ctx, key, value, t)),
  };
}

const present = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);

function side(ctx: Context, r: WeekRow): SideView {
  const zones = r.timeZoneShift === null || r.timeZoneShift === 0 ? undefined : `${Math.abs(r.timeZoneShift)} ${r.timeZoneShift > 0 ? "east" : "west"}`;
  return {
    team: r.team,
    isHome: r.isHome,
    featured: present([line(ctx, "rest_advantage", r.restAdvantage, [r.team])]),
    other: present([
      line(ctx, "rest", r.restBucket, [r.team], r.restDays === null ? undefined : `${r.restDays} days`),
      line(ctx, "time_zone_travel", r.timeZoneTravel, [r.team], zones),
      line(ctx, "body_clock", r.bodyClock, [r.team], r.bodyClockTime ? clock(r.bodyClockTime) : undefined),
      line(ctx, "venue", r.venue, [r.team]),
      line(ctx, "spread_role", r.spreadRole, [r.team], r.teamSpread === null ? undefined : formatSigned(r.teamSpread)),
    ]),
  };
}

/**
 * Build the week. Rows come two per game (both sides). Weather rows show
 * a status until forecasts are loaded: indoors, a retractable roof decided
 * on game day, or "Forecast not available yet."
 */
export function buildThisWeek({
  rows,
  situations,
  effects,
  teamSums,
  allTeams,
  span,
  rangeQuery,
  exclude2020 = false,
}: {
  rows: WeekRow[];
  situations: Situation[];
  effects: Map<string, FeaturedEffect>;
  teamSums: TeamSplitSums[];
  allTeams: string[];
  span: string;
  rangeQuery: string;
  /** The default range covers 2020: apply the venue rule to venue lines. */
  exclude2020?: boolean;
}): ThisWeek | null {
  if (rows.length === 0) return null;
  const bySituation = new Map(situations.map((s) => [s.key, s]));
  const labels = new Map(situations.map((s) => [s.key, new Map(s.values.map((v) => [v.value, v.label]))]));
  const cache = new Map<string, Map<string, TeamValueStats>>();
  const ctx: Context = {
    situations: bySituation,
    labels,
    effects,
    span,
    rangeQuery,
    stats: (key, value) => {
      const k = `${key}|${value}`;
      if (!cache.has(k)) {
        const s = bySituation.get(key);
        cache.set(k, new Map(s ? valueStatsByTeam(s, value, teamSums, exclude2020).map((t) => [t.team, t]) : []));
      }
      return cache.get(k)!;
    },
  };

  const byGame = new Map<string, WeekRow[]>();
  for (const r of rows) byGame.set(r.gameId, [...(byGame.get(r.gameId) ?? []), r]);

  const games: GameCard[] = [...byGame.values()].map((pair) => {
    const home = pair.find((r) => r.isHome) ?? pair[0];
    const away = pair.find((r) => r !== home) ?? pair[1];
    const both = [away.team, home.team];
    const weather: SituationLine = {
      key: "weather",
      label: "Weather",
      value: weatherStatus(home, labels),
      featured: true,
      effect: null,
      teams: [],
    };
    return {
      gameId: home.gameId,
      kickoff: kickoffText(home.gameday, home.kickoffEt),
      stadium: home.stadiumName ? `${home.stadiumName}${home.city ? `, ${home.city}` : ""}` : null,
      finished: home.isFinished,
      away: away.team,
      home: home.team,
      score: home.isFinished && home.pointsFor !== null && away.pointsFor !== null ? { away: away.pointsFor, home: home.pointsFor } : null,
      neutral: home.venue === "neutral",
      spread: spreadText(home, away),
      sharedFeatured: present([line(ctx, "roof", home.roofType, both), weather]),
      sharedOther: present([line(ctx, "time_slot", home.timeSlot, both)]),
      sides: [side(ctx, away), side(ctx, home)],
    };
  });

  const first = rows[0];
  const playing = new Set(rows.map((r) => r.team));
  return {
    title: first.gameType === "REG" ? `Week ${first.week}` : (ROUNDS[first.gameType] ?? `Week ${first.week}`),
    dates: dateRange(rows.map((r) => r.gameday)),
    games,
    byes: first.gameType === "REG" ? allTeams.filter((t) => !playing.has(t)) : [],
  };
}

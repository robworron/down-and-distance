// Number formats shared by tables, stats and charts.

const MINUS = "−"; // a true minus sign, the width of a plus

/** 0.744 -> "74.4%"; null -> "—". */
export function formatPct(x: number | null, digits = 1): string {
  return x === null ? "—" : `${(x * 100).toFixed(digits)}%`;
}

/** 7.6 -> "+7.6", -2.4 -> "−2.4", 0 -> "0.0"; null -> "—". */
export function formatSigned(x: number | null, digits = 1): string {
  if (x === null) return "—";
  const s = Math.abs(x).toFixed(digits);
  if (Number(s) === 0) return s;
  return x > 0 ? `+${s}` : `${MINUS}${s}`;
}

/** 0.744 -> "74%": whole percents, for small samples where a decimal is noise. */
export function formatWholePct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

/** The share of a shrunk estimate from the team's own games: "14%", or "0.6%" below 1%. */
export function formatShare(w: number): string {
  return w >= 0.01 ? `${Math.round(w * 100)}%` : `${(w * 100).toFixed(1)}%`;
}

/** 1234 -> "1,234". */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * "2026-10-21T09:41:07Z" -> "Wed Oct 21, 5:41 am ET": a UTC instant in US
 * Eastern time, daylight saving time included (the zone name, never a fixed
 * offset). Null for an unreadable value.
 */
export function formatEastern(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const part = Object.fromEntries(EASTERN.formatToParts(date).map((p) => [p.type, p.value]));
  return `${part.weekday} ${part.month} ${part.day}, ${part.hour}:${part.minute} ${part.dayPeriod.toLowerCase()} ET`;
}

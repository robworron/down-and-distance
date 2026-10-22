/**
 * Regular-season win % for every season, with the selected range shaded and
 * its seasons dotted (with no range, the line alone, as in the static shell). Drawn in currentColor, so it takes the header band's
 * text colour (white or near-black, chosen by contrast with the team colour).
 */
export function WinSparkline({ points, range }: { points: { season: number; winPct: number }[]; range: [number, number] | null }) {
  if (points.length < 2) return null;
  const W = 270, H = 64, padL = 28, padR = 4, padY = 6;
  const first = points[0].season, last = points[points.length - 1].season;
  const x = (s: number) => padL + ((s - first) / (last - first)) * (W - padL - padR);
  const y = (p: number) => padY + (1 - p) * (H - 2 * padY);
  const half = (x(first + 1) - x(first)) / 2;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.season).toFixed(1)},${y(p.winPct).toFixed(1)}`).join(" ");
  const inRange = range ? points.filter((p) => p.season >= range[0] && p.season <= range[1]) : [];

  return (
    <figure className="m-0">
      <figcaption className="mb-0.5 text-[0.6875rem] opacity-85">
        Regular-season win %, {first}–{last}
        {range && ` · shaded ${range[0]}–${range[1]}`}
      </figcaption>
      <svg width={W} height={H + 14} viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={`Regular-season win % by season, ${first} to ${last}${range ? `, with ${range[0]} to ${range[1]} shaded` : ""}`}>
        {range && (
          <rect x={x(range[0]) - half} y={0} width={x(range[1]) - x(range[0]) + 2 * half} height={H} rx={3} fill="currentColor" opacity={0.16} />
        )}
        <line x1={padL} x2={W - padR} y1={y(0.5)} y2={y(0.5)} stroke="currentColor" strokeWidth={1} opacity={0.35} />
        <text x={0} y={y(0.5) + 3} fontSize={9} fill="currentColor" opacity={0.8}>
          .500
        </text>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
        {inRange.map((p) => (
          <circle key={p.season} cx={x(p.season)} cy={y(p.winPct)} r={3} fill="currentColor" />
        ))}
        <text x={padL} y={H + 12} fontSize={10} fill="currentColor" opacity={0.85}>
          {first}
        </text>
        <text x={W - padR} y={H + 12} fontSize={10} fill="currentColor" opacity={0.85} textAnchor="end">
          {last}
        </text>
      </svg>
    </figure>
  );
}

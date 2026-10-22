import { Container } from "@/components/container";
import type { Stadium, TeamProfile } from "@/lib/queries";
import { textOn } from "@/lib/team-colors";

const ROOFS: Record<string, string> = { outdoors: "Open air", dome: "Dome", retractable: "Retractable" };
const SURFACES: Record<string, string> = {
  grass: "Grass",
  dessograss: "Hybrid grass",
  fieldturf: "FieldTurf",
  astroturf: "AstroTurf",
  sportturf: "SportTurf",
  a_turf: "A-Turf",
  matrixturf: "Matrix Turf",
  astroplay: "AstroPlay",
};

function surfaceLabel(s: Stadium) {
  const name = SURFACES[s.surface] ?? s.surface;
  return s.surfaceType === "turf" ? `${name} (artificial)` : name;
}

/** "Eastern Time" for America/New_York: the zone's everyday name. */
function zoneName(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longGeneric" }).formatToParts(0);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timezone;
}

/**
 * The team's band: its primary colour with a stripe of its secondary colour,
 * the abbreviation as a faint monogram behind the name, home-field facts and a
 * win % sparkline. Colours and abbreviations only, never logos.
 */
export function TeamHeader({ team, sparkline }: { team: TeamProfile; sparkline: React.ReactNode }) {
  const ink = textOn(team.color);
  const s = team.stadium;
  const facts = s
    ? [
        ["Stadium", s.name],
        ["City", s.country === "US" ? `${s.city}, ${s.region}` : `${s.city}, ${s.country}`],
        ["Roof", ROOFS[s.roof] ?? s.roof],
        ["Surface", surfaceLabel(s)],
        ["Elevation", `${s.altitudeM.toLocaleString("en-US")} m (${Math.round(s.altitudeM * 3.28084).toLocaleString("en-US")} ft)`],
        ["Time zone", zoneName(s.timezone)],
      ]
    : [];

  return (
    <section
      // The top hairline draws the band's edge where a near-black team colour
      // (Las Vegas, Pittsburgh) meets the dark theme's near-black header.
      className="relative overflow-hidden border-t border-b-[5px] border-t-rule-strong"
      style={{ backgroundColor: team.color, color: ink, borderBottomColor: team.color2 }}
    >
      <Container className="relative grid items-end gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6 md:py-6">
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-3 left-0 text-[110px] leading-none font-extrabold tracking-[-0.04em] opacity-10 select-none md:-top-4 md:text-[150px]"
          >
            {team.abbr}
          </div>
          <p className="relative text-[0.8125rem] font-semibold tracking-[0.06em] uppercase opacity-85">{team.division}</p>
          <h1 className="relative text-[1.75rem] leading-tight font-bold tracking-tight md:text-4xl">{team.name}</h1>
          {facts.length > 0 && (
            <dl className="relative mt-3.5 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem]">
              {facts.map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-[0.6875rem] tracking-[0.05em] uppercase opacity-75">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {sparkline}
      </Container>
    </section>
  );
}

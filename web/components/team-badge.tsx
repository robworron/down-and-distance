import { cn } from "cn";

import { textOn } from "@/lib/team-colors";

/**
 * A team's abbreviation on its primary colour: the site's team mark (no logos).
 * The text colour is chosen by contrast, and a hairline ring keeps dark
 * badges visible on the dark theme's dark background.
 */
export function TeamBadge({ abbr, color, className }: { abbr: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid size-10 shrink-0 place-items-center rounded-md text-sm font-bold tracking-wide ring-1 ring-rule-strong",
        className,
      )}
      style={{ backgroundColor: color, color: textOn(color) }}
    >
      {abbr}
    </span>
  );
}

// Wording shared by every page that shows situations: the tier headings and
// the level labels with their explanations. Plain text, so client
// components can import it too.

import type { Tier } from "./queries";

export const TIERS: Record<Tier, { title: string; intro: string; short: string }> = {
  featured: {
    title: "Situations that measurably change results",
    intro: "Across every game from 1999 to 2025, these made a difference bigger than chance and big enough to matter.",
    short: "Featured",
  },
  filter: {
    title: "Other situations",
    intro: "No clear effect so far. Useful as filters, and re-checked as seasons accumulate.",
    short: "Other situations",
  },
  context: {
    title: "Context",
    intro: "Home field and the betting line: the baselines every other split is read against.",
    short: "Context",
  },
};

export const LEVELS = {
  game: {
    label: "Same for both teams",
    tip: "Weather, roof and kickoff time are the same for both teams, so across the league one wins and one loses: the league's win % is 50% by definition. These situations are compared on scoring instead.",
  },
  team: {
    label: "Differs by team",
    tip: "Rest, travel and the betting line can differ between the two teams, so win % and margin compare fairly with the league's.",
  },
} as const;

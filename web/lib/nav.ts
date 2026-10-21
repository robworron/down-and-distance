/** The site's main views. Each later step adds its link once its page exists. */
export const NAV_LINKS = [
  { href: "/teams", label: "Teams" },
  { href: "/explorer", label: "Explorer" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/this-week", label: "This week" },
] as const;

"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Light/dark mode. next-themes puts a .dark class on <html> before the page
 * paints (so there's no flash), following the system setting unless the
 * viewer picks light or dark, which it remembers in localStorage.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Down & Distance", template: "%s · Down & Distance" },
  description:
    "How every NFL team performs in specific game situations (weather, rest, travel, venue), with the number of games behind every figure.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the theme class on <html> before React hydrates, so
    // React is told to expect that one attribute to differ.
    <html lang="en" className={geistSans.variable} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          {/* One provider for every tooltip, so they share an open delay. */}
          <TooltipProvider delayDuration={150}>
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

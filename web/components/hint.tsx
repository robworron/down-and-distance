"use client";

import { cn } from "cn";
import { useSyncExternalStore } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// A touch screen can't hover, so a tooltip there never opens. `(hover: none)`
// is true when the main pointer can't hover (phones, most tablets).
const NO_HOVER = "(hover: none)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(NO_HOVER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True on a touch screen. The server can't know, so it renders the mouse
 * version ("hover") and the browser switches after hydration without a
 * mismatch warning: useSyncExternalStore's server snapshot is used for the
 * first client render too.
 */
export function useNoHover(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NO_HOVER).matches,
    () => false,
  );
}

type Side = "top" | "right" | "bottom" | "left";

/**
 * An explanation attached to a trigger: a tooltip on hover or keyboard focus
 * with a mouse, a popover that opens on tap on a touch screen. `children` is
 * the trigger itself (a focusable element: a button, or an element with
 * tabIndex 0), so the same markup works for both.
 */
export function Hint({
  content,
  children,
  side,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: Side;
  className?: string;
}) {
  const touch = useNoHover();
  if (touch) {
    return (
      <Popover>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent side={side} className={cn("w-fit max-w-[18rem] gap-1 px-3 py-2 text-xs", className)}>
          {content}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Text with an explanation on hover or keyboard focus. The trigger is a real
 * button, so it can be reached with Tab; a dotted underline marks it.
 */
export function InfoTip({ tip, className, children }: { tip: string; className?: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "cursor-help underline decoration-dotted decoration-1 underline-offset-[3px] focus-visible:rounded-sm focus-visible:outline-2",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[18rem] text-left leading-snug font-normal tracking-normal normal-case">{tip}</TooltipContent>
    </Tooltip>
  );
}

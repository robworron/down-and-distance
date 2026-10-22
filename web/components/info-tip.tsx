import { cn } from "cn";

import { Hint } from "@/components/hint";

/**
 * Text with an explanation: on hover or keyboard focus with a mouse, on tap
 * on a touch screen (Hint). The trigger is a real button, so it can be
 * reached with Tab; a dotted underline marks it.
 */
export function InfoTip({ tip, className, children }: { tip: string; className?: string; children: React.ReactNode }) {
  return (
    <Hint content={tip} className="max-w-[18rem] text-left leading-snug font-normal tracking-normal normal-case">
      <button
        type="button"
        className={cn(
          "cursor-help underline decoration-dotted decoration-1 underline-offset-[3px] focus-visible:rounded-sm focus-visible:outline-2",
          className,
        )}
      >
        {children}
      </button>
    </Hint>
  );
}

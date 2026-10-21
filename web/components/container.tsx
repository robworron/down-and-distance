import { cn } from "cn";

/** The site's content column: 1,180 px wide at most, with a 16 px gutter. */
export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1180px] px-4", className)} {...props} />;
}

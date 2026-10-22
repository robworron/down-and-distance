import { formatEastern } from "@/lib/format";
import { getDataUpdatedAt } from "@/lib/queries";

/**
 * "Data updated Wed Oct 21, 5:41 am ET" in the footer: when the nightly job
 * last loaded the schedule successfully. Cached with the marts, so it moves
 * when the nightly refresh does. `pipeline refresh --expect-stamp` reads the
 * <time> element's dateTime to confirm the refresh reached the page.
 */
export async function DataUpdated() {
  const iso = await getDataUpdatedAt();
  const text = iso ? formatEastern(iso) : null;
  if (!iso || !text) return null;
  return (
    <span>
      <time dateTime={iso}>Data updated {text}</time>
    </span>
  );
}

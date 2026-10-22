import { describe, expect, it } from "vitest";

import { formatEastern } from "../format";

describe("formatEastern", () => {
  it("shows a summer instant in daylight saving time (UTC-4)", () => {
    expect(formatEastern("2026-10-21T09:41:07Z")).toBe("Wed Oct 21, 5:41 am ET");
  });

  it("shows a winter instant in standard time (UTC-5)", () => {
    expect(formatEastern("2026-12-02T09:41:07Z")).toBe("Wed Dec 2, 4:41 am ET");
  });

  it("follows the clocks on the change-over days", () => {
    // 1 November 2026: 2 am EDT becomes 1 am EST (06:00 UTC).
    expect(formatEastern("2026-11-01T05:30:00Z")).toBe("Sun Nov 1, 1:30 am ET"); // EDT, before
    expect(formatEastern("2026-11-01T06:30:00Z")).toBe("Sun Nov 1, 1:30 am ET"); // EST, after: the hour repeats
    // 8 March 2026: 2 am EST becomes 3 am EDT (07:00 UTC).
    expect(formatEastern("2026-03-08T06:59:00Z")).toBe("Sun Mar 8, 1:59 am ET");
    expect(formatEastern("2026-03-08T07:00:00Z")).toBe("Sun Mar 8, 3:00 am ET");
  });

  it("moves to the previous day in Eastern time", () => {
    expect(formatEastern("2026-10-22T02:15:00Z")).toBe("Wed Oct 21, 10:15 pm ET");
  });

  it("writes noon and midnight as 12", () => {
    expect(formatEastern("2026-10-21T16:00:00Z")).toBe("Wed Oct 21, 12:00 pm ET");
    expect(formatEastern("2026-10-21T04:00:00Z")).toBe("Wed Oct 21, 12:00 am ET");
  });

  it("gives null for an unreadable value", () => {
    expect(formatEastern("not a date")).toBeNull();
  });
});

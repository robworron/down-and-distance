import { describe, expect, it } from "vitest";

import { contrastRatio, DARK_TEXT, LIGHT_TEXT, luminance, textOn } from "../team-colors";

// Every team's primary colour in marts.dim_teams (2026-10-19).
const PRIMARY = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D", CAR: "#0085CA", CHI: "#0B162A",
  CIN: "#FB4F14", CLE: "#FF3C00", DAL: "#002244", DEN: "#002244", DET: "#0076B6", GB: "#203731",
  HOU: "#03202F", IND: "#002C5F", JAX: "#006778", KC: "#E31837", LA: "#003594", LAC: "#007BC7",
  LV: "#000000", MIA: "#008E97", MIN: "#4F2683", NE: "#002244", NO: "#D3BC8D", NYG: "#0B2265",
  NYJ: "#003F2D", PHI: "#004C54", PIT: "#000000", SEA: "#002244", SF: "#AA0000", TB: "#A71930",
  TEN: "#4495D2", WAS: "#5A1414",
};

describe("luminance and contrast (WCAG 2)", () => {
  it("puts black at 0 and white at 1", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("gives black on white the maximum 21:1, in either order", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 10);
  });

  it("matches a published value: #767676 on white is 4.54:1", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

describe("textOn", () => {
  it("uses white on dark colours and near-black on light ones", () => {
    expect(textOn("#00338D")).toBe(LIGHT_TEXT); // Bills blue
    expect(textOn("#000000")).toBe(LIGHT_TEXT); // Raiders black
    expect(textOn("#D3BC8D")).toBe(DARK_TEXT); // Saints gold
    expect(textOn("#FB4F14")).toBe(DARK_TEXT); // Bengals orange
  });

  it.each(Object.entries(PRIMARY))("clears 4.5:1 on %s's %s", (_team, colour) => {
    expect(contrastRatio(textOn(colour), colour)).toBeGreaterThanOrEqual(4.5);
  });
});

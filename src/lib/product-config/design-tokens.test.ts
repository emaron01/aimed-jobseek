import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  designTokens,
  tokenContrastPairs,
  WCAG_AA_NORMAL_TEXT,
} from "@/lib/product-config/design-tokens";

describe("design token contrast", () => {
  it("meets WCAG AA for text on its intended backgrounds", () => {
    for (const pair of tokenContrastPairs) {
      expect(
        contrastRatio(pair.fg, pair.bg),
        pair.name,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });

  it("keeps white readable on primary and navigation ink", () => {
    expect(
      contrastRatio(designTokens.color.onPrimary, designTokens.color.primary),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(designTokens.color.onInk, designTokens.color.ink),
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

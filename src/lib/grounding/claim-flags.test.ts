import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("claim flags", () => {
  it("are removed from production source", () => {
    expect(existsSync("src/lib/grounding/claim-flags.ts")).toBe(false);
    expect(existsSync("src/components/ClaimFlagBanner.tsx")).toBe(false);
  });
});

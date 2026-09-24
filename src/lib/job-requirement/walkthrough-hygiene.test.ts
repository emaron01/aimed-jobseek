import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("walkthrough hygiene", () => {
  it("keeps unlock and grant tools out of the repository", () => {
    expect(existsSync("scripts/ad-hoc/walkthrough-unlock-billing.ts")).toBe(false);
    expect(existsSync("scripts/ad-hoc/walkthrough-grant-research.ts")).toBe(false);
    expect(existsSync("scripts/ad-hoc/walkthrough-status.ts")).toBe(false);
    expect(existsSync("scripts/ad-hoc/walkthrough-verify-url.ts")).toBe(false);
    expect(existsSync("scripts/ad-hoc/walkthrough-rerun-research.ts")).toBe(false);
    expect(readFileSync(".gitignore", "utf8")).toContain("scripts/ad-hoc/");
  });
});

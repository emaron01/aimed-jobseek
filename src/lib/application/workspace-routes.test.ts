import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applicationStepFromPathname,
  applicationStepHref,
  applicationStepList,
} from "@/lib/product-config/application-steps";

describe("application workspace routes", () => {
  it("has a page file for every page step and keeps Applied on the overview", () => {
    for (const step of applicationStepList) {
      if (!step.hrefSegment) {
        expect(applicationStepHref("camp_1", step.key)).toBe("/campaigns/camp_1#applied");
        continue;
      }
      const file = `src/app/(app)/campaigns/[id]/${step.hrefSegment}/page.tsx`;
      expect(existsSync(file), file).toBe(true);
      expect(applicationStepFromPathname(applicationStepHref("camp_1", step.key))).toBe(
        step.key,
      );
    }
    expect(applicationStepFromPathname("/campaigns/camp_1")).toBe("overview");
    expect(applicationStepFromPathname("/campaigns/camp_1/interviews/stage_1")).toBe(
      "interviews",
    );
  });
});

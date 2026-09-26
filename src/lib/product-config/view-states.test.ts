import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { polishCopy } from "@/lib/product-config/polish";

const ROOT = process.cwd();

describe("designed view states", () => {
  it("exports shared empty, loading, and error chrome", () => {
    const empty = readFileSync(join(ROOT, "src/components/design/EmptyState.tsx"), "utf8");
    const skeleton = readFileSync(join(ROOT, "src/components/design/Skeleton.tsx"), "utf8");
    const error = readFileSync(join(ROOT, "src/components/design/ErrorState.tsx"), "utf8");
    expect(empty).toContain("description");
    expect(empty).toContain("actions");
    expect(skeleton).toContain("role=\"status\"");
    expect(error).toContain("onRetry");
    expect(error).toContain("data-testid=\"error-state\"");
    expect(error).toContain("polishCopy.errorTitle");
  });

  it("has route loading skeletons for seeker chrome", () => {
    for (const file of [
      "src/app/(app)/loading.tsx",
      "src/app/(app)/campaigns/loading.tsx",
      "src/app/(app)/campaigns/[id]/loading.tsx",
      "src/app/(app)/settings/loading.tsx",
    ]) {
      expect(existsSync(join(ROOT, file)), file).toBe(true);
      expect(readFileSync(join(ROOT, file), "utf8")).toContain("Skeleton");
      expect(readFileSync(join(ROOT, file), "utf8")).toContain(polishCopy.loading ? "polishCopy.loading" : "loading");
    }
  });

  it("shows designed errors when Harper or the tracker cannot load", () => {
    const harper = readFileSync(join(ROOT, "src/components/ConsultationSection.tsx"), "utf8");
    const tracker = readFileSync(join(ROOT, "src/components/ApplicationSidebarTracker.tsx"), "utf8");
    expect(harper).toContain("consultation-failed");
    expect(harper).toContain("consultationConversationCopy.generationFailed");
    expect(tracker).toContain("ErrorState");
    expect(tracker).toContain("polishCopy.trackerLoadFailed");
    expect(tracker).toContain("Skeleton");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vocab } from "@/lib/product-config";

const source = readFileSync("src/components/ScoreReportClient.tsx", "utf8");

describe("ScoreReportClient table layout", () => {
  it("uses a fixed-width table with sticky headers", () => {
    expect(source).toContain("table-fixed");
    expect(source).toContain("sticky top-0");
    expect(source).toContain("<colgroup>");
  });

  it("shows qualification bucket and reason instead of numeric score columns", () => {
    expect(source).toContain("Qualification");
    expect(source).toContain("readQualificationBucket");
    expect(source).toContain("readQualificationReason");
    expect(source).not.toContain(">Overall</th>");
    expect(source).not.toContain(`>${vocab.persona.Singular}</th>`);
  });

  it("keeps ICP detail sections in the expanded panel", () => {
    expect(source).toContain('data-testid="icp-confirmed-failures"');
    expect(source).toContain('data-testid="mandatory-suggestions"');
    expect(source).toContain("makePrimaryCriterionMandatoryAndRescoreAction");
    expect(source).toContain('data-testid="icp-qualification-why"');
    expect(source).toContain('data-testid="icp-criterion-provenance"');
    expect(source).toContain('data-testid="exclusion-detail-panel"');
  });

  it("shows inline exclusion details and restore actions for excluded rows", () => {
    expect(source).toContain("readExclusionDetails");
    expect(source).toContain("ExclusionDetailList");
    expect(source).toContain("overrideQualificationBucketAction");
    expect(source).toContain("bulkRestoreQualificationAction");
    expect(source).toContain('data-testid="bulk-exclusion-restore"');
    expect(source).toContain("`restore-contact-${row.contactId}`");
  });

  it("caps non-excluded reasons at two lines and keeps details expandable", () => {
    expect(source).toContain("line-clamp-2");
    expect(source).toContain("Show details");
    expect(source).toContain("resolvedQualification.reason");
    expect(source).toContain("SECONDARY_BUTTON_CLASS");
  });
});

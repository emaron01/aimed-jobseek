import { describe, expect, it } from "vitest";
import {
  buildSourceIndex,
  formatSourceMarkerLabel,
  sourceMarkerNumbers,
} from "@/lib/research/source-index";

describe("source index helpers", () => {
  it("numbers unique sources in order", () => {
    const index = buildSourceIndex(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      (source) => source.id,
    );
    expect(index.get("a")).toBe(1);
    expect(index.get("b")).toBe(2);
    expect(sourceMarkerNumbers(["b", "a"], index)).toEqual([1, 2]);
    expect(formatSourceMarkerLabel([1, 3])).toBe("[1,3]");
  });
});

describe("print stylesheet contracts", () => {
  it("keeps chips compact and avoids forced section page breaks", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/app/globals.css", "utf8");
    const researchDoc = readFileSync(
      "src/components/research-document.tsx",
      "utf8",
    );
    const product = readFileSync("src/components/ProductDraftReview.tsx", "utf8");
    const persona = readFileSync(
      "src/components/PersonaBriefingDocument.tsx",
      "utf8",
    );

    expect(css).not.toContain("break-inside: avoid");
    expect(css).toContain(".research-source-chip-popup");
    expect(researchDoc).toContain("print:hidden");
    expect(researchDoc).toContain("research-source-chip-print");
    expect(researchDoc).not.toContain("print:!block");
    expect(product).not.toContain("print:break-before-page");
    expect(persona).not.toContain("print:break-before-page");
  });
});

describe("icp briefing page contracts", () => {
  it("reads as a document with edit behind a single action", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync(
      "src/app/(app)/setup/[productId]/icps/[icpId]/page.tsx",
      "utf8",
    );
    const form = readFileSync("src/components/IcpDetailsForm.tsx", "utf8");
    const briefing = readFileSync("src/components/IcpBriefingDocument.tsx", "utf8");

    expect(page).toContain("IcpDetailsForm");
    expect(form).toContain('editing ? "Done editing" : "Edit"');
    expect(form).toContain("IcpBriefingDocument");
    expect(form).toContain("ExportPdfButton");
    expect(form).toContain("data-print-document");
    expect(briefing).toContain("{vocab.idealCustomer.Singular} definition");
    expect(briefing).toContain("evidenceClassAvailabilityLabel");
    expect(form).toContain("IcpCriteriaReview");
  });
});

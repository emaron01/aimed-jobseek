import { describe, expect, it } from "vitest";
import {
  formatProductUrlUnreadableError,
  isLikelySiteChromeExtraction,
  isUsableProductUrlExtraction,
} from "@/lib/product-research/extraction-quality";
import {
  describeProductSourceLead,
  isNearEmptyProductDraft,
} from "@/lib/product-research/review";
import { emptyCandidateProfile } from "@/lib/product-research/candidate-profile";

const OPENTEXT_SHELL = `
Network Management Software & Network Operations Management --> OpenText home page.
Why OpenText Products Solutions Services Partners Support Resources Contact
Back to primary navigation Why OpenText Why OpenText Empowering people Deploy anywhere AI leadership
Back to Why OpenText menu Why OpenText Overview Why OpenText OpenText brings decades of expertise
Back to Products menu Experience and Fax Overview Partners Support Resources Contact
`.repeat(20);

describe("product URL extraction quality", () => {
  it("rejects near-empty and menu-chrome shells", () => {
    expect(isLikelySiteChromeExtraction("Short")).toBe(true);
    expect(isLikelySiteChromeExtraction(OPENTEXT_SHELL)).toBe(true);
    expect(isUsableProductUrlExtraction(OPENTEXT_SHELL)).toBe(false);
  });

  it("accepts real product prose", () => {
    const prose = `
      Acme Forecast is a software platform that helps sales leaders improve forecast
      confidence. It solves problems with unreliable CRM data and manual forecast calls.
      Capabilities include pipeline inspection automation, risk scoring, and coaching workflows.
      Buyers include CROs, VP Sales, and Directors of Sales Operations.
      Customers report improved outcomes and reduced forecast administration time.
    `.repeat(3);
    expect(isLikelySiteChromeExtraction(prose)).toBe(false);
    expect(isUsableProductUrlExtraction(prose)).toBe(true);
  });

  it("reports extracted character counts in the unreadable error", () => {
    expect(
      formatProductUrlUnreadableError({
        extractedCharCount: 8000,
        blockedOrEmpty: false,
      }),
    ).toMatch(/8000 characters/);
  });
});

describe("near-empty product draft", () => {
  it("treats all-unknown profiles as a failed read", () => {
    const empty = emptyCandidateProfile();
    expect(isNearEmptyProductDraft(empty)).toBe(true);

    const lead = describeProductSourceLead({
      sources: [
        {
          id: "s1",
          sourceType: "URL",
          displayName: "OpenText NOM",
          originalUrl:
            "https://www.opentext.com/products/network-operations-management",
          status: "FAILED",
          errorSafe:
            "We could not read usable product content from this page. (Extracted 8000 characters — mostly site navigation or an empty shell, not product detail.)",
          extractedCharCount: 8000,
        },
      ],
      draft: empty,
    });
    expect(lead.kind).toBe("failed_read");
    expect(lead.sentence).not.toMatch(/We read your website/i);
    expect(lead.detail).toMatch(/8000 characters/i);
    expect(lead.detail).toMatch(/Paste resume or LinkedIn text/i);
  });
});

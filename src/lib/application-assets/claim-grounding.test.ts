import { describe, expect, it } from "vitest";
import {
  formatAssetVerificationMessage,
  formatClaimViolation,
  sanitizeAssetContent,
} from "@/lib/application-assets/claim-grounding";
import { applicationAssetConfig } from "@/lib/product-config";
import type { ResumeAssetContent } from "@/lib/application-assets/contract";

describe("asset claim presentation", () => {
  it("shows each violation with the claim, source, and reason", () => {
    const formatted = formatClaimViolation({
      claimId: "bullet-1",
      claimText: "Cut failed billing runs from 18% to under 1%.",
      sourceId: "profile:ach_1",
      sourceLabel: "Personal Profile",
      reason: "the number 18 is not in the source",
    });
    expect(formatted).toContain("Cut failed billing runs from 18%");
    expect(formatted).toContain("Personal Profile");
    expect(formatted).toContain("the number 18 is not in the source");
    const message = formatAssetVerificationMessage([formatted]);
    expect(message).toContain(applicationAssetConfig.labels.verificationFailed);
    expect(message).toContain("the number 18");
  });

  it("drops empty bullets instead of leaving blank list items", () => {
    const resume: ResumeAssetContent = {
      type: "RESUME",
      header: {
        name: {
          id: "name",
          text: "Alex Chen",
          supports: [{ sourceId: "profile:id_name", quote: "Alex Chen" }],
        },
        contactDetails: [
          {
            id: "empty-contact",
            text: "   ",
            supports: [{ sourceId: "profile:id_email", quote: "n/a" }],
          },
        ],
      },
      summary: [
        {
          id: "summary",
          text: "Senior Software Engineer",
          supports: [{ sourceId: "profile:id_headline", quote: "Senior Software Engineer" }],
        },
      ],
      experience: [
        {
          roleId: "role_1",
          employer: "Northwind Analytics",
          title: "Senior Software Engineer",
          startDate: "2021-01",
          endDate: null,
          location: null,
          hidden: false,
          condensed: false,
          bullets: [
            {
              id: "empty",
              text: "  ",
              supports: [{ sourceId: "profile:ach_1", quote: "n/a" }],
            },
            {
              id: "kept",
              text: "Rewrote invoice generation.",
              supports: [{ sourceId: "profile:ach_1", quote: "rewrite" }],
            },
          ],
        },
      ],
      skills: [],
      education: [],
      credentials: [],
    };
    const sanitized = sanitizeAssetContent(resume);
    expect(sanitized.header.contactDetails).toEqual([]);
    expect(sanitized.experience[0]?.bullets.map((item) => item.id)).toEqual(["kept"]);
  });
});

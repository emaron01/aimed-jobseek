/**
 * Claim origin classification — only MODEL_ORIGINATED surfaces.
 */
import { describe, expect, it } from "vitest";
import {
  buildRepClaimSources,
  classifyClaimOrigin,
  computeRepEditDelta,
  deterministicClaimViolations,
  deterministicSignalLeakageViolations,
  keepModelOriginatedViolations,
} from "@/lib/email-generation/claim-origin";

describe("claim origin", () => {
  it("treats emailGuidance website-visitor knowledge as rep-asserted (motivating case)", () => {
    const guidance =
      "These are prospects that visited my website.";
    const sources = buildRepClaimSources({
      offer: { offerName: null, offerDescription: null, offerCta: null, offerNotes: null },
      emailGuidance: guidance,
    });
    expect(
      classifyClaimOrigin(
        {
          bodyExcerpt: "I noticed you visited our website",
          description:
            "Claims the prospect visited the website without research support",
          matchedGuard: null,
        },
        sources,
        [],
      ),
    ).toBe("REP_ASSERTED");

    // Substring match on shared distinctive phrase from guidance
    expect(
      classifyClaimOrigin(
        {
          bodyExcerpt: "visited my website",
          matchedGuard: "visited my website",
          description: "Website visit claim",
        },
        sources,
        [],
      ),
    ).toBe("REP_ASSERTED");

    const filtered = keepModelOriginatedViolations(
      [
        {
          type: "UNSUPPORTED_FACT",
          description: "Website visit claim",
          matchedGuard: "visited my website",
          bodyExcerpt: "visited my website recently",
        },
      ],
      sources,
      [],
    );
    expect(filtered).toEqual([]);
  });

  it("trusts a claim that overlaps a seeker-authored consultation answer", () => {
    const sources = buildRepClaimSources({
      offer: { offerName: null, offerDescription: null, offerCta: null, offerNotes: null },
    });
    const consultation = [
      {
        id: "turn_1",
        text: "I cut failed billing runs from 8% to under 1% over two quarters.",
        seekerAuthored: true as const,
      },
    ];
    expect(
      classifyClaimOrigin(
        {
          bodyExcerpt: "cut failed billing runs from 8% to under 1%",
          description: "Billing metric",
          matchedGuard: null,
        },
        sources,
        [],
        consultation,
      ),
    ).toBe("CONSULTATION_ANSWER");
    const filtered = keepModelOriginatedViolations(
      [
        {
          type: "UNSUPPORTED_FACT",
          description: "Billing metric",
          matchedGuard: null,
          bodyExcerpt: "cut failed billing runs from 8% to under 1%",
        },
      ],
      sources,
      [],
      consultation,
    );
    expect(filtered).toEqual([]);
  });

  it("keeps model inventions that appear in neither rep sources nor evidence", () => {
    const sources = buildRepClaimSources({
      offer: {
        offerName: "Assessment",
        offerDescription: "On-site security review",
        offerCta: null,
        offerNotes: null,
      },
      emailGuidance: null,
    });
    const filtered = keepModelOriginatedViolations(
      [
        {
          type: "INVENTED_OFFER_TERM",
          description: "Invented a 90-day trial not in the offer",
          matchedGuard: null,
          bodyExcerpt: "includes a complimentary 90-day trial",
        },
      ],
      sources,
      ["Deployment timing is determined after an on-site assessment."],
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.origin).toBe("MODEL_ORIGINATED");
  });

  it("does not deterministically flag prohibited claims that the offer already asserts", () => {
    const sources = buildRepClaimSources({
      offer: {
        offerName: null,
        offerDescription: "Guaranteed revenue growth for Q4",
        offerCta: null,
        offerNotes: null,
      },
    });
    const violations = deterministicClaimViolations({
      body: "We deliver Guaranteed revenue growth this quarter.",
      claimsNotToMake: ["Guaranteed revenue growth"],
      terminologyToAvoid: [],
      repSources: sources,
    });
    expect(violations).toEqual([]);
  });

  it("deterministically flags prohibited claims the model invents without rep input", () => {
    const sources = buildRepClaimSources({
      offer: {
        offerName: null,
        offerDescription: "Friendly intro call",
        offerCta: null,
        offerNotes: null,
      },
    });
    const violations = deterministicClaimViolations({
      body: "We deliver Guaranteed revenue growth this quarter.",
      claimsNotToMake: ["Guaranteed revenue growth"],
      terminologyToAvoid: [],
      repSources: sources,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.origin).toBe("MODEL_ORIGINATED");
  });

  it("treats sentences the rep added versus generatedBody as rep edits", () => {
    const generated =
      "Hi Alex, we help teams improve planning.\nWould a short review help?";
    const edited =
      "Hi Alex, we help teams improve planning.\nI added that you visited my website.\nWould a short review help?";
    expect(computeRepEditDelta(generated, edited)).toContain(
      "visited my website",
    );
    expect(computeRepEditDelta(generated, generated)).toBe("");
  });

  it("flags excluded research signals that leak into the copy", () => {
    const sources = buildRepClaimSources({
      offer: {
        offerName: null,
        offerDescription: "Friendly intro",
        offerCta: null,
        offerNotes: null,
      },
    });
    const violations = deterministicSignalLeakageViolations({
      body: "I noticed recent churn risk around renewals at your account.",
      riskSignals: ["churn risk around renewals"],
      professionalSignals: [],
      negativeRoleSignals: [],
      repSources: sources,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.type).toBe("UNSUPPORTED_FACT");
    expect(violations[0]?.origin).toBe("MODEL_ORIGINATED");
  });
});

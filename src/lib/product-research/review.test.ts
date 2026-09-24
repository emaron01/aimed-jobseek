/**
 * Candidate profile review parse, source lead-in, and save-field coverage.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  describeProductSourceLead,
  describeReadSources,
  diffCandidateProfileFields,
  parseCandidateProfileFromFormData,
  productSourceTypeLabel,
} from "@/lib/product-research/review";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";
import type { CandidateProfile } from "@/lib/product-research/candidate-profile";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

function formFromProfile(profile: CandidateProfile): FormData {
  const fd = new FormData();
  fd.set("candidateProfileJson", JSON.stringify(profile));
  return fd;
}

describe("productSourceTypeLabel", () => {
  it("uses seeker-facing labels instead of stored type names", () => {
    expect(productSourceTypeLabel("PASTED_TEXT")).toBe("Pasted text");
    expect(productSourceTypeLabel("UPLOADED_DOCUMENT")).toBe(
      "Uploaded document",
    );
    expect(productSourceTypeLabel("URL")).toBe("Website");
    expect(productSourceTypeLabel("USER_NOTE")).toBe("Notes");
    expect(productSourceTypeLabel("UNKNOWN_KIND")).toBe("Source");
  });
});

describe("product review source lead-in", () => {
  it("names a website and one uploaded document", () => {
    const lead = describeReadSources([
      {
        id: "s1",
        sourceType: "URL",
        displayName: "acme.example",
        originalUrl: "https://acme.example",
        status: "ACQUIRED",
      },
      {
        id: "s2",
        sourceType: "UPLOADED_DOCUMENT",
        displayName: "Methodology",
        filename: "resume.pdf",
        status: "ACQUIRED",
      },
    ]);
    expect(lead.sentence).toBe("We read your site and 1 uploaded document.");
    expect(lead.names).toEqual(["acme.example", "resume.pdf"]);
  });

  it("does not claim a failed URL was read", () => {
    const lead = describeProductSourceLead({
      sources: [
        {
          id: "s1",
          sourceType: "URL",
          displayName: "opentext",
          originalUrl: "https://www.opentext.com/products/x",
          status: "FAILED",
          errorSafe: "Extracted 8000 characters — mostly site navigation",
          extractedCharCount: 8000,
        },
      ],
      draft: null,
    });
    expect(lead.kind).toBe("failed_read");
    expect(lead.sentence).not.toMatch(/We read your website/i);
  });
});

describe("candidateProfileFromFormData persists every profile field", () => {
  it("round-trips the candidate profile JSON", () => {
    const profile = fixtureAlexChenProfile();
    const parsed = parseCandidateProfileFromFormData(formFromProfile(profile));
    expect(parsed.identity.name?.text).toBe("Alex Chen");
    expect(parsed.experience).toHaveLength(2);
    expect(parsed.skills.map((item) => item.text)).toContain("TypeScript");
    expect(parsed.compensation?.text).toMatch(/180,000/);
    expect(parsed.gaps.length).toBeGreaterThan(0);
  });

  it("records edits against the original profile", () => {
    const original = fixtureAlexChenProfile();
    const next: CandidateProfile = {
      ...original,
      identity: {
        ...original.identity,
        location: {
          ...original.identity.location!,
          text: "Portland, OR",
        },
      },
    };
    expect(diffCandidateProfileFields(original, next)).toEqual([
      "identity.location",
    ]);
  });
});

describe("product review UI contracts", () => {
  it("renders candidate profile fields and FACT/INFERENCE markers", () => {
    const src = readFileSync("src/components/ProductDraftReview.tsx", "utf8");
    expect(src).toContain("Approve this profile");
    expect(src).toContain("no supporting evidence was found");
    expect(src).toContain("None recorded from the material.");
    expect(src).toContain("max-w-3xl");
    expect(src).toContain("AutosizeTextarea");
    expect(src).toContain("FACT");
    expect(src).toContain("INFERENCE");
    expect(src).toContain("profile-gaps-panel");
    expect(src).toContain("candidateProfileJson");
    expect(src).not.toMatch(/completeness|confidence meter|score badge/i);
    expect(src).not.toContain("Review & Save Product");
    expect(src).not.toContain("suggestedBuyerRoles");
  });

  it("research page leads with the profile and named sources", () => {
    const page = readFileSync(
      "src/app/(app)/setup/[productId]/research/page.tsx",
      "utf8",
    );
    expect(page).toContain("sources={sourcesForReview");
    const body = page.slice(page.indexOf("return ("));
    expect(body.indexOf("ProductDraftReview")).toBeLessThan(
      body.indexOf("AssistedProductIntake"),
    );
    expect(page).toContain("product-failed-read");
    expect(page).toContain("Review ${product.name}");
    expect(page).not.toContain("Research: ${product.name}");
    expect(page).toContain("Upload materials");
    expect(page).toContain("max-w-3xl");
    expect(page).not.toContain("SuggestedBuyerRolesPanel");
  });

  it("product intake prioritizes upload and paste over URL", () => {
    const src = readFileSync("src/components/AssistedProductSetup.tsx", "utf8");
    const upload = src.indexOf("Upload materials");
    const paste = src.indexOf("Paste resume or LinkedIn profile text");
    const url = src.indexOf("Personal site, portfolio, or GitHub URL (optional)");
    expect(upload).toBeGreaterThan(-1);
    expect(paste).toBeGreaterThan(upload);
    expect(url).toBeGreaterThan(paste);
    expect(src).toMatch(/cannot be read automatically/i);
    expect(src).toContain("LinkedIn blocks");
    expect(src).toContain("product-upload-materials");
  });

  it("save action reads the candidate profile from the form", () => {
    const action = readFileSync("src/app/actions/product-setup.ts", "utf8");
    expect(action).toContain("parseCandidateProfileFromFormData");
    expect(action).toContain("diffCandidateProfileFields");
    expect(action).not.toMatch(
      /editedFields:\s*\[\s*"name",\s*"description",\s*"valueProposition",\s*"websiteUrl"\s*\]/,
    );
  });
});

describe.skipIf(!hasDatabase)(
  "approved product profileJson keeps edited profile fields",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let organizationId = "";
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      const org = await prisma.organization.create({
        data: {
          name: `[TEST] Review persist ${suffix}`,
          slug: `review-persist-${suffix}`,
        },
      });
      organizationId = org.id;
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    it("approve writes the submitted candidate profile onto profileJson", async () => {
      const { approveProductFromDraft } = await import(
        "@/lib/product-research/approve"
      );
      const product = await prisma.product.create({
        data: { organizationId, name: `Review product ${suffix}` },
      });
      const bundle = await prisma.productEvidenceBundle.create({
        data: {
          organizationId,
          productId: product.id,
          version: 1,
          correlationId: `review-${suffix}`,
          sourceIdsJson: [],
          status: "NEEDS_REVIEW",
        },
      });
      const original = fixtureAlexChenProfile();
      const run = await prisma.productSetupRun.create({
        data: {
          organizationId,
          productId: product.id,
          evidenceBundleId: bundle.id,
          correlationId: `review-run-${suffix}`,
          status: "NEEDS_REVIEW",
          productDraftJson: original,
        },
      });
      const edited: CandidateProfile = {
        ...original,
        identity: {
          ...original.identity,
          location: {
            ...original.identity.location!,
            text: "Portland, OR",
          },
        },
      };
      const parsed = parseCandidateProfileFromFormData(formFromProfile(edited));
      await approveProductFromDraft({
        organizationId,
        productId: product.id,
        userId: "user_review",
        setupRunId: run.id,
        fields: {
          name: "Alex Chen",
          description: parsed.identity.headline?.text ?? null,
          valueProposition: parsed.positioning?.text ?? null,
          websiteUrl: null,
          averageOrderValue: null,
        },
        profile: parsed,
        editedFields: ["identity.location"],
      });
      const saved = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      const profile = saved.profileJson as CandidateProfile;
      expect(profile.identity.name?.text).toBe("Alex Chen");
      expect(profile.identity.location?.text).toBe("Portland, OR");
      expect(profile.experience).toHaveLength(2);
      expect(saved.approvalStatus).toBe("APPROVED");
      expect(saved.manuallyEditedFields).toEqual(
        expect.arrayContaining(["identity.location"]),
      );
    });
  },
);

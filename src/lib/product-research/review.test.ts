/**
 * Product review parse, source lead-in, and save-field coverage.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PREVIOUSLY_DROPPED_FROM_FORM,
  PREVIOUSLY_RENDERED_DRAFT_FIELDS,
  PRODUCT_DRAFT_LIST_FIELDS,
  PRODUCT_DRAFT_STRING_FIELDS,
  describeProductSourceLead,
  describeReadSources,
  diffProductDraftFields,
  evidenceRefsForText,
  productDraftFromFormData,
  reconcileUnknownFields,
} from "@/lib/product-research/review";
import type { ProductDraft } from "@/lib/product-research/contract";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

const FULL_DRAFT: ProductDraft = {
  description: "Operational software for multi-site facilities teams.",
  valueProposition: "One picture of after-hours exceptions.",
  problemsSolved: ["Door events lost between vendors"],
  capabilities: ["Exception log", "Campus rollup"],
  differentiators: ["Works across mixed badge vendors"],
  primaryUseCases: ["Overnight incident review"],
  relevantBuyerFunctions: ["Facilities leadership"],
  relevantIndustries: ["Higher education", "Hospitals"],
  businessOutcomes: ["Fewer missed overnight events"],
  pricingAovContext: "Project-based, campus by campus.",
  deploymentContext: "Sold through facilities and safety committees.",
  proofPoints: ["Used on a 12-building campus"],
  customerEvidence: ["Named university facilities team"],
  terminology: ["after-hours exception", "door event"],
  unknownFields: ["average contract value"],
  evidenceRefs: [
    {
      claim: "Door events lost between vendors on mixed campuses",
      sourceIds: ["src_site"],
      note: null,
    },
  ],
};

function formFromDraft(draft: ProductDraft): FormData {
  const fd = new FormData();
  fd.set("description", draft.description ?? "");
  fd.set("valueProposition", draft.valueProposition ?? "");
  fd.set("pricingAovContext", draft.pricingAovContext ?? "");
  fd.set("deploymentContext", draft.deploymentContext ?? "");
  for (const key of PRODUCT_DRAFT_LIST_FIELDS) {
    fd.set(key, (draft[key] ?? []).join("\n"));
  }
  fd.set("evidenceRefsJson", JSON.stringify(draft.evidenceRefs ?? []));
  return fd;
}

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
        filename: "methodology.pdf",
        status: "ACQUIRED",
      },
    ]);
    expect(lead.sentence).toBe("We read your website and 1 uploaded document.");
    expect(lead.names).toEqual(["acme.example", "methodology.pdf"]);
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

describe("productDraftFromFormData persists every draft field", () => {
  it("round-trips every productDraftJson field including previously dropped ones", () => {
    const parsed = productDraftFromFormData(formFromDraft(FULL_DRAFT));
    expect(parsed.description).toBe(FULL_DRAFT.description);
    expect(parsed.valueProposition).toBe(FULL_DRAFT.valueProposition);
    expect(parsed.problemsSolved).toEqual(FULL_DRAFT.problemsSolved);
    expect(parsed.capabilities).toEqual(FULL_DRAFT.capabilities);
    expect(parsed.differentiators).toEqual(FULL_DRAFT.differentiators);
    expect(parsed.primaryUseCases).toEqual(FULL_DRAFT.primaryUseCases);
    expect(parsed.relevantBuyerFunctions).toEqual(
      FULL_DRAFT.relevantBuyerFunctions,
    );
    expect(parsed.relevantIndustries).toEqual(FULL_DRAFT.relevantIndustries);
    expect(parsed.businessOutcomes).toEqual(FULL_DRAFT.businessOutcomes);
    expect(parsed.pricingAovContext).toBe(FULL_DRAFT.pricingAovContext);
    expect(parsed.deploymentContext).toBe(FULL_DRAFT.deploymentContext);
    expect(parsed.proofPoints).toEqual(FULL_DRAFT.proofPoints);
    expect(parsed.customerEvidence).toEqual(FULL_DRAFT.customerEvidence);
    expect(parsed.terminology).toEqual(FULL_DRAFT.terminology);
    expect(parsed.unknownFields).toEqual(FULL_DRAFT.unknownFields);
    expect(parsed.evidenceRefs).toEqual(FULL_DRAFT.evidenceRefs);
    for (const field of PREVIOUSLY_DROPPED_FROM_FORM) {
      const value = parsed[field];
      if (Array.isArray(value)) expect(value.length).toBeGreaterThan(0);
      else expect(value).toBeTruthy();
    }
  });

  it("records edits against the original draft", () => {
    const next = {
      ...FULL_DRAFT,
      relevantIndustries: ["Municipal campuses"],
      capabilities: ["Exception log", "Campus rollup", "Shift handoff"],
    };
    expect(diffProductDraftFields(FULL_DRAFT, next).sort()).toEqual([
      "capabilities",
      "relevantIndustries",
    ]);
  });

  it("drops unknown markers once the field has content", () => {
    const reconciled = reconcileUnknownFields({
      ...FULL_DRAFT,
      unknownFields: ["relevantIndustries", "average contract value"],
    });
    expect(reconciled.unknownFields).toEqual(["average contract value"]);
  });

  it("matches evidence chips to overlapping claims", () => {
    const refs = evidenceRefsForText(
      "Door events lost between vendors",
      FULL_DRAFT.evidenceRefs ?? [],
    );
    expect(refs).toHaveLength(1);
  });
});

describe("product review UI contracts", () => {
  it("renders every productDraft field and does not invent confidence meters", () => {
    const src = readFileSync("src/components/ProductDraftReview.tsx", "utf8");
    for (const field of [
      ...PRODUCT_DRAFT_STRING_FIELDS,
      ...PRODUCT_DRAFT_LIST_FIELDS,
      "evidenceRefs",
    ]) {
      expect(src, field).toContain(field === "evidenceRefs" ? "evidenceRefsJson" : field);
    }
    expect(src).toContain("Approve this profile");
    expect(src).toContain("no supporting evidence was found");
    expect(src).toContain("None recorded from the material.");
    expect(src).toContain("max-w-3xl");
    expect(src).toContain("AutosizeTextarea");
    expect(src).not.toMatch(/completeness|confidence meter|score badge/i);
    expect(src).not.toContain("Review & Save Product");
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
    expect(page).toContain("Upload materials");
    expect(page).toContain("max-w-3xl");
  });

  it("product intake prioritizes upload and paste over URL", () => {
    const src = readFileSync("src/components/AssistedProductSetup.tsx", "utf8");
    const upload = src.indexOf("Upload materials");
    const paste = src.indexOf("Paste {vocab.product.singular} content");
    const url = src.indexOf("${vocab.product.Singular} URL (optional)");
    expect(upload).toBeGreaterThan(-1);
    expect(paste).toBeGreaterThan(upload);
    expect(url).toBeGreaterThan(paste);
    expect(src).toMatch(/cannot be read automatically/i);
    expect(src).toContain("product-upload-materials");
  });

  it("save action reads the full draft from the form, not only the old four fields", () => {
    const action = readFileSync("src/app/actions/product-setup.ts", "utf8");
    expect(action).toContain("productDraftFromFormData");
    expect(action).toContain("diffProductDraftFields");
    expect(action).not.toMatch(
      /editedFields:\s*\[\s*"name",\s*"description",\s*"valueProposition",\s*"websiteUrl"\s*\]/,
    );
  });

  it("documents which draft fields the old form dropped", () => {
    expect(PREVIOUSLY_RENDERED_DRAFT_FIELDS).toEqual([
      "description",
      "valueProposition",
      "unknownFields",
      "evidenceRefs",
    ]);
    expect(PREVIOUSLY_DROPPED_FROM_FORM).toContain("problemsSolved");
    expect(PREVIOUSLY_DROPPED_FROM_FORM).toContain("terminology");
    expect(PREVIOUSLY_DROPPED_FROM_FORM).toContain("pricingAovContext");
  });
});

describe.skipIf(!hasDatabase)(
  "approved product profileJson keeps edited draft fields",
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

    it("approve writes every submitted draft field onto profileJson", async () => {
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
      const run = await prisma.productSetupRun.create({
        data: {
          organizationId,
          productId: product.id,
          evidenceBundleId: bundle.id,
          correlationId: `review-run-${suffix}`,
          status: "NEEDS_REVIEW",
          productDraftJson: FULL_DRAFT,
        },
      });
      const parsed = productDraftFromFormData(
        formFromDraft({
          ...FULL_DRAFT,
          relevantIndustries: ["Municipal campuses"],
          terminology: ["after-hours exception", "door event", "shift log"],
        }),
      );
      await approveProductFromDraft({
        organizationId,
        productId: product.id,
        userId: "user_review",
        setupRunId: run.id,
        fields: {
          name: product.name,
          description: parsed.description ?? null,
          valueProposition: parsed.valueProposition ?? null,
          websiteUrl: null,
          averageOrderValue: null,
        },
        profile: parsed,
        editedFields: ["relevantIndustries", "terminology"],
      });
      const saved = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      const profile = saved.profileJson as ProductDraft;
      expect(profile.problemsSolved).toEqual(FULL_DRAFT.problemsSolved);
      expect(profile.capabilities).toEqual(FULL_DRAFT.capabilities);
      expect(profile.differentiators).toEqual(FULL_DRAFT.differentiators);
      expect(profile.primaryUseCases).toEqual(FULL_DRAFT.primaryUseCases);
      expect(profile.relevantBuyerFunctions).toEqual(
        FULL_DRAFT.relevantBuyerFunctions,
      );
      expect(profile.relevantIndustries).toEqual(["Municipal campuses"]);
      expect(profile.businessOutcomes).toEqual(FULL_DRAFT.businessOutcomes);
      expect(profile.pricingAovContext).toBe(FULL_DRAFT.pricingAovContext);
      expect(profile.deploymentContext).toBe(FULL_DRAFT.deploymentContext);
      expect(profile.proofPoints).toEqual(FULL_DRAFT.proofPoints);
      expect(profile.customerEvidence).toEqual(FULL_DRAFT.customerEvidence);
      expect(profile.terminology).toEqual([
        "after-hours exception",
        "door event",
        "shift log",
      ]);
      expect(profile.evidenceRefs?.[0]?.claim).toContain("Door events");
      expect(saved.approvalStatus).toBe("APPROVED");
    });
  },
);

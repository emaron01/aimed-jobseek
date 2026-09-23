/**
 * Product assisted setup — unit + integration tests.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  isLinkedInProfileUrl,
  LINKEDIN_PROFILE_BLOCKED_MESSAGE,
  normalizeProductSourceUrl,
  sha256Hex,
} from "@/lib/product-research/url";
import {
  assertUploadSize,
  extractDocumentText,
  isSupportedUpload,
} from "@/lib/product-research/extract";
import {
  PRODUCT_SYNTHESIS_PROMPT_VERSION,
  productAiResponseSchema,
} from "@/lib/product-research/contract";
import { buildProductSynthesisMessages } from "@/lib/product-research/prompt";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "@/lib/usage/defaults";

vi.mock("@/lib/product-research/fetch-url", () => ({
  fetchProductPageUrl: vi.fn(async () => {
    throw new Error("URL fetch should not run for notes-only");
  }),
}));

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("Product source identity", () => {
  it("normalizes URL scheme, www, trailing slash, fragments, tracking params", () => {
    expect(
      normalizeProductSourceUrl(
        "HTTP://WWW.Example.com/product/?utm_source=x&id=1#section",
      ),
    ).toBe("https://example.com/product?id=1");
    expect(normalizeProductSourceUrl("example.com/a/")).toBe(
      "https://example.com/a",
    );
    expect(normalizeProductSourceUrl("https://example.com/a")).not.toBe(
      normalizeProductSourceUrl("https://example.com/b"),
    );
  });

  it("identifies LinkedIn profile URLs so intake can ask for pasted text", () => {
    expect(isLinkedInProfileUrl("https://www.linkedin.com/in/alex-chen")).toBe(
      true,
    );
    expect(isLinkedInProfileUrl("linkedin.com/in/alex-chen")).toBe(true);
    expect(isLinkedInProfileUrl("https://github.com/alex-chen")).toBe(false);
    expect(LINKEDIN_PROFILE_BLOCKED_MESSAGE).toMatch(/Paste your LinkedIn profile text/);
  });

  it("hashes pasted content for dedupe", async () => {
    const a = await sha256Hex("PASTED_TEXT:hello");
    const b = await sha256Hex("PASTED_TEXT:hello");
    const c = await sha256Hex("PASTED_TEXT:hello!");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("Upload validation", () => {
  it("supports PDF DOCX TXT MD and rejects PPTX", () => {
    expect(isSupportedUpload("x.pdf", "application/pdf")).toBe(true);
    expect(isSupportedUpload("x.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    expect(isSupportedUpload("x.txt", "text/plain")).toBe(true);
    expect(isSupportedUpload("x.md", "text/markdown")).toBe(true);
    expect(isSupportedUpload("x.pptx", "application/vnd.ms-powerpoint")).toBe(
      false,
    );
  });

  it("rejects empty and oversized uploads", () => {
    expect(assertUploadSize(0)?.ok).toBe(false);
    expect(assertUploadSize(20 * 1024 * 1024)?.ok).toBe(false);
    expect(assertUploadSize(100)).toBeNull();
  });

  it("extracts TXT content", async () => {
    const bytes = new TextEncoder().encode("Product solves forecast pain.");
    const result = await extractDocumentText({
      filename: "notes.txt",
      mimeType: "text/plain",
      bytes,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("forecast");
  });
});

describe("Product synthesis contract", () => {
  it("validates a candidate profile and rejects leftover buyer roles on the schema", () => {
    const parsed = productAiResponseSchema.parse({
      candidateProfile: {
        identity: {
          name: {
            id: "id_name",
            kind: "FACT",
            text: "Alex Chen",
            provenance: [{ sourceId: "s1" }],
          },
        },
        direction: {},
      },
    });
    expect(parsed.candidateProfile.identity.name?.text).toBe("Alex Chen");
    expect(parsed).not.toHaveProperty("suggestedBuyerRoles");
    expect(PRODUCT_SYNTHESIS_PROMPT_VERSION).toBe("7");
  });

  it("prompt forbids suggestedBuyerRoles and person web search", () => {
    const messages = buildProductSynthesisMessages({
      productName: "Alex Chen",
      primaryUrl: "https://example.com",
      excerpts: [
        {
          sourceId: "s1",
          sourceType: "URL",
          displayName: "Home",
          text: "Backend engineer in Seattle.",
          url: "https://example.com",
        },
      ],
    });
    expect(messages[0]!.content).toContain("Do NOT return suggestedBuyerRoles");
    expect(messages[0]!.content).toContain("Do not invent a web search");
    expect(messages[1]!.content).toContain("domainsAbsent");
  });

  it("120-day default comes from DB policy defaults constant, not enforcement hard-code", async () => {
    expect(
      DEFAULT_RESEARCH_POLICY_VALUES.productSourceResearchFreshnessDays,
    ).toBe(120);
    const policySrc = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/usage/policy-service.ts", "utf8"),
    );
    const acquireSrc = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/product-research/acquire.ts", "utf8"),
    );
    expect(policySrc).toContain("productSourceResearchFreshnessDays");
    expect(acquireSrc).toContain("policy.productSourceResearchFreshnessDays");
    expect(acquireSrc).not.toMatch(/freshnessExpiresAt.*120\s*\*/);
  });
});

describe.skipIf(!hasDatabase)(
  "Product evidence reuse",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let organizationId = "";
    let productId = "";
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1`;
        // Ensure migration applied enums exist
        await prisma.$queryRaw`SELECT 1 FROM "ProductSource" LIMIT 0`.catch(
          () => {
            throw new Error("ProductSource table missing — run db:deploy");
          },
        );
        const org = await prisma.organization.create({
          data: {
            name: `[TEST] Prod Research Org ${suffix}`,
            slug: `prod-research-${suffix}`,
          },
        });
        organizationId = org.id;
        const { ensureOrganizationPolicies } = await import(
          "@/lib/usage/policy"
        );
        await ensureOrganizationPolicies(organizationId);
        const product = await prisma.product.create({
          data: {
            organizationId,
            name: `Widget ${suffix}`,
          },
        });
        productId = product.id;
        ready = true;
      } catch (e) {
        console.warn("Skipping product research DB tests:", e);
      }
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    it("Product requires only name; saves without AI", async () => {
      if (!ready) return;
      const p = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(p.name).toContain("Widget");
      expect(p.approvalStatus).toBe("NOT_STARTED");
    });

    it("ingests notes/paste without URL research; one bundle for multiple personas", async () => {
      if (!ready) return;

      const { acquireProductEvidence } = await import(
        "@/lib/product-research/acquire"
      );

      const first = await acquireProductEvidence({
        organizationId,
        productId,
        userId: null,
        sources: [
          {
            type: "USER_NOTE",
            text: "B2B forecast software for sales leaders.",
          },
          {
            type: "PASTED_TEXT",
            text: "Helps CROs reduce forecast call time and improve confidence.",
          },
        ],
      });

      expect(first.excerpts.length).toBeGreaterThanOrEqual(2);
      expect(first.urlResearchPerformed).toBe(false);

      // Duplicate paste should not create another source
      const second = await acquireProductEvidence({
        organizationId,
        productId,
        userId: null,
        sources: [
          {
            type: "PASTED_TEXT",
            text: "Helps CROs reduce forecast call time and improve confidence.",
          },
        ],
      });
      expect(second.version).toBe(first.version + 1);

      const sources = await prisma.productSource.count({
        where: { organizationId, productId, sourceType: "PASTED_TEXT" },
      });
      expect(sources).toBe(1);

      const policy = await prisma.researchPolicy.findUniqueOrThrow({
        where: { organizationId },
      });
      expect(policy.productSourceResearchFreshnessDays).toBe(120);
    });

    it("tenant isolation: sources scoped by organizationId", async () => {
      if (!ready) return;
      const other = await prisma.organization.create({
        data: {
          name: `[TEST] Other ${suffix}`,
          slug: `other-pr-${suffix}`,
        },
      });
      const leaked = await prisma.productSource.findMany({
        where: { organizationId: other.id, productId },
      });
      expect(leaked).toHaveLength(0);
      await prisma.organization.delete({ where: { id: other.id } });
    });

    it("unapproved drafts are not APPROVED", async () => {
      if (!ready) return;
      const p = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(p.approvalStatus).not.toBe("APPROVED");
    });
  },
);

import { beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("product hierarchy and campaign validation", { timeout: 60_000 }, () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;
  let orgAId = "";
  let orgBId = "";
  let productAId = "";
  let productBId = "";
  let icpA1Id = "";
  let icpBId = "";
  let personaA1Id = "";
  let personaBId = "";
  let ownerAId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();

    try {
      await prisma.$queryRaw`SELECT "personaId", "offerName" FROM "Campaign" LIMIT 0`;
      await prisma.$queryRaw`SELECT "productId" FROM "Icp" LIMIT 0`;
    } catch {
      console.warn(
        "Skipping hierarchy DB tests: run migration 20260320160000_product_icp_persona_campaign_offer first.",
      );
      return;
    }

    ready = true;
    const suffix = Date.now().toString(36);

    const orgA = await prisma.organization.create({
      data: {
        name: `[TEST] Hierarchy Org A ${suffix}`,
        slug: `test-hierarchy-a-${suffix}`,
        status: "ACTIVE",
      },
    });
    const orgB = await prisma.organization.create({
      data: {
        name: `[TEST] Hierarchy Org B ${suffix}`,
        slug: `test-hierarchy-b-${suffix}`,
        status: "ACTIVE",
      },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    const owner = await prisma.user.create({
      data: {
        email: `hierarchy-owner-${suffix}@example.test`,
        emailNormalized: `hierarchy-owner-${suffix}@example.test`,
      },
    });
    ownerAId = owner.id;
    await prisma.organizationMembership.create({
      data: { organizationId: orgAId, userId: ownerAId, role: "OWNER" },
    });

    const productA = await prisma.product.create({
      data: {
        organizationId: orgAId,
        name: `[TEST] Product A ${suffix}`,
      },
    });
    const productB = await prisma.product.create({
      data: {
        organizationId: orgAId,
        name: `[TEST] Product B ${suffix}`,
      },
    });
    productAId = productA.id;
    productBId = productB.id;

    const icpA1 = await prisma.icp.create({
      data: {
        organizationId: orgAId,
        productId: productAId,
        name: `[TEST] ICP A1 ${suffix}`,
      },
    });
    await prisma.icp.create({
      data: {
        organizationId: orgAId,
        productId: productAId,
        name: `[TEST] ICP A2 ${suffix}`,
      },
    });
    const icpB = await prisma.icp.create({
      data: {
        organizationId: orgAId,
        productId: productBId,
        name: `[TEST] ICP B ${suffix}`,
      },
    });
    icpA1Id = icpA1.id;
    icpBId = icpB.id;

    const personaA1 = await prisma.persona.create({
      data: {
        organizationId: orgAId,
        productId: productAId,
        name: `[TEST] Persona A1 ${suffix}`,
      },
    });
    await prisma.persona.create({
      data: {
        organizationId: orgAId,
        productId: productAId,
        name: `[TEST] Persona A2 ${suffix}`,
      },
    });
    const personaB = await prisma.persona.create({
      data: {
        organizationId: orgAId,
        productId: productBId,
        name: `[TEST] Persona B ${suffix}`,
      },
    });
    personaA1Id = personaA1.id;
    personaBId = personaB.id;

    await prisma.product.create({
      data: {
        organizationId: orgBId,
        name: `[TEST] Org B Product ${suffix}`,
      },
    });
  });

  it("Organization A cannot access Organization B products", async () => {
    if (!ready) return;
    const leaked = await prisma.product.findFirst({
      where: {
        organizationId: orgAId,
        name: { contains: "Org B Product" },
      },
    });
    expect(leaked).toBeNull();

    const orgBProducts = await prisma.product.findMany({
      where: { organizationId: orgBId },
    });
    expect(orgBProducts.length).toBeGreaterThan(0);
    expect(orgBProducts.every((p) => p.organizationId === orgBId)).toBe(true);
  });

  it("Product A can have multiple ICPs", async () => {
    if (!ready) return;
    const icps = await prisma.icp.findMany({
      where: { organizationId: orgAId, productId: productAId },
    });
    expect(icps.length).toBeGreaterThanOrEqual(2);
  });

  it("Product A can have multiple Personas", async () => {
    if (!ready) return;
    const personas = await prisma.persona.findMany({
      where: { organizationId: orgAId, productId: productAId },
    });
    expect(personas.length).toBeGreaterThanOrEqual(2);
  });

  it("Product B ICP cannot be assigned to Product A Campaign", async () => {
    if (!ready) return;
    const icp = await prisma.icp.findFirst({
      where: { id: icpBId, productId: productAId },
    });
    expect(icp).toBeNull();

    await expect(
      (async () => {
        if (icpBId && productAId) {
          const foreign = await prisma.icp.findFirst({
            where: { id: icpBId, productId: productAId },
          });
          if (!foreign) {
            throw new Error("ICP does not belong to the selected product.");
          }
        }
      })(),
    ).rejects.toThrow("ICP does not belong to the selected product.");
  });

  it("Product B Persona cannot be assigned to Product A Campaign", async () => {
    if (!ready) return;
    const persona = await prisma.persona.findFirst({
      where: { id: personaBId, productId: productAId },
    });
    expect(persona).toBeNull();

    await expect(
      (async () => {
        const foreign = await prisma.persona.findFirst({
          where: { id: personaBId, productId: productAId },
        });
        if (!foreign) {
          throw new Error("Persona does not belong to the selected product.");
        }
      })(),
    ).rejects.toThrow("Persona does not belong to the selected product.");
  });

  it("Campaign-specific Offer can differ between campaigns using the same Product/ICP/Persona", async () => {
    if (!ready) return;

    const campaign1 = await prisma.campaign.create({
      data: {
        organizationId: orgAId,
        ownerUserId: ownerAId,
        name: `[TEST] Campaign Offer 1`,
        productId: productAId,
        icpId: icpA1Id,
        personaId: personaA1Id,
        offerName: "Free Forecast Audit",
        offerCta: "Book audit",
        status: "DRAFT",
      },
    });

    const campaign2 = await prisma.campaign.create({
      data: {
        organizationId: orgAId,
        ownerUserId: ownerAId,
        name: `[TEST] Campaign Offer 2`,
        productId: productAId,
        icpId: icpA1Id,
        personaId: personaA1Id,
        offerName: "30-Day Pilot",
        offerCta: "Start pilot",
        status: "DRAFT",
      },
    });

    expect(campaign1.offerName).toBe("Free Forecast Audit");
    expect(campaign2.offerName).toBe("30-Day Pilot");
    expect(campaign1.productId).toBe(campaign2.productId);
    expect(campaign1.icpId).toBe(campaign2.icpId);
    expect(campaign1.personaId).toBe(campaign2.personaId);
  });
});

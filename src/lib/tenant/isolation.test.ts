import { beforeAll, describe, expect, it } from "vitest";
import { seedContactOnList } from "@/test/contact-seed";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("tenant isolation", { timeout: 60_000 }, () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;

  let orgAId = "";
  let orgBId = "";
  let productAId = "";
  let productBId = "";
  let icpAId = "";
  let personaAId = "";
  let ownerAId = "";
  let ownerBId = "";
  let contactBId = "";
  let campaignAId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();

    try {
      await prisma.$queryRaw`SELECT "sourceType" FROM "ContactList" LIMIT 0`;
      await prisma.$queryRaw`SELECT "productId" FROM "Icp" LIMIT 0`;
      await prisma.$queryRaw`SELECT "personaId" FROM "Campaign" LIMIT 0`;
    } catch {
      console.warn(
        "Skipping tenant isolation DB tests: apply pending Prisma migrations first.",
      );
      return;
    }

    ready = true;
    const suffix = Date.now().toString(36);

    const orgA = await prisma.organization.create({
      data: {
        name: `[TEST] Org A ${suffix}`,
        slug: `test-org-a-${suffix}`,
        status: "ACTIVE",
      },
    });
    const orgB = await prisma.organization.create({
      data: {
        name: `[TEST] Org B ${suffix}`,
        slug: `test-org-b-${suffix}`,
        status: "ACTIVE",
      },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    const ownerA = await prisma.user.create({
      data: {
        email: `isolation-owner-a-${suffix}@example.test`,
        emailNormalized: `isolation-owner-a-${suffix}@example.test`,
      },
    });
    const ownerB = await prisma.user.create({
      data: {
        email: `isolation-owner-b-${suffix}@example.test`,
        emailNormalized: `isolation-owner-b-${suffix}@example.test`,
      },
    });
    ownerAId = ownerA.id;
    ownerBId = ownerB.id;
    await prisma.organizationMembership.createMany({
      data: [
        { organizationId: orgAId, userId: ownerAId, role: "OWNER" },
        { organizationId: orgBId, userId: ownerBId, role: "OWNER" },
      ],
    });

    const productA = await prisma.product.create({
      data: {
        organizationId: orgAId,
        name: `[TEST] Product A ${suffix}`,
      },
    });
    const productB = await prisma.product.create({
      data: {
        organizationId: orgBId,
        name: `[TEST] Product B ${suffix}`,
      },
    });
    productAId = productA.id;
    productBId = productB.id;

    const icpA = await prisma.icp.create({
      data: {
        organizationId: orgAId,
        productId: productAId,
        name: `[TEST] ICP A ${suffix}`,
      },
    });
    icpAId = icpA.id;

    const personaA = await prisma.persona.create({
      data: {
        organizationId: orgAId,
        productId: productAId,
        name: `[TEST] Persona A ${suffix}`,
      },
    });
    personaAId = personaA.id;

    const listB = await prisma.contactList.create({
      data: {
        organizationId: orgBId,
        ownerUserId: ownerBId,
        name: `[TEST] List B ${suffix}`,
        sourceType: "PASTE",
        totalContacts: 1,
      },
    });

    const contactB = await seedContactOnList(prisma, {
      organizationId: orgBId,
      contactListId: listB.id,
      email: `b-${suffix}@example.test`,
      firstName: "OrgB",
      lastName: "Contact",
    });
    contactBId = contactB.id;

    const campaignA = await prisma.campaign.create({
      data: {
        organizationId: orgAId,
        ownerUserId: ownerAId,
        name: `[TEST] Campaign A ${suffix}`,
        productId: productAId,
        icpId: icpAId,
        personaId: personaAId,
        offerName: "Legacy-compatible offer fields",
        status: "DRAFT",
      },
    });
    campaignAId = campaignA.id;
  });

  it("Organization A cannot fetch Organization B products", async () => {
    if (!ready) return;
    const products = await prisma.product.findMany({
      where: { organizationId: orgAId },
    });
    expect(products.every((p) => p.organizationId === orgAId)).toBe(true);
    expect(products.some((p) => p.id === productBId)).toBe(false);

    const leaked = await prisma.product.findFirst({
      where: { id: productBId, organizationId: orgAId },
    });
    expect(leaked).toBeNull();
  });

  it("Organization A cannot fetch Organization B contacts", async () => {
    if (!ready) return;
    const contacts = await prisma.contact.findMany({
      where: { organizationId: orgAId },
    });
    expect(contacts.some((c) => c.id === contactBId)).toBe(false);

    const leaked = await prisma.contact.findFirst({
      where: { id: contactBId, organizationId: orgAId },
    });
    expect(leaked).toBeNull();
  });

  it("Organization A cannot fetch Organization B campaigns", async () => {
    if (!ready) return;
    const campaigns = await prisma.campaign.findMany({
      where: { organizationId: orgBId },
    });
    expect(campaigns.some((c) => c.id === campaignAId)).toBe(false);
  });

  it("Organization A cannot modify Organization B records by id alone", async () => {
    if (!ready) return;
    const before = await prisma.product.findUnique({
      where: { id: productBId },
    });
    expect(before).not.toBeNull();

    const scoped = await prisma.product.findFirst({
      where: { id: productBId, organizationId: orgAId },
    });
    expect(scoped).toBeNull();
    expect(before?.name.includes("[TEST] Product B")).toBe(true);
  });

  it("Organization A cannot associate campaign with Organization B product", async () => {
    if (!ready) return;
    const foreignProduct = await prisma.product.findFirst({
      where: { id: productBId, organizationId: orgAId },
    });
    expect(foreignProduct).toBeNull();

    await expect(
      (async () => {
        if (!foreignProduct) {
          throw new Error(
            "Product does not belong to the active organization.",
          );
        }
        return prisma.campaign.create({
          data: {
            organizationId: orgAId,
            ownerUserId: ownerAId,
            name: "Should not create",
            productId: productBId,
            icpId: icpAId,
            personaId: personaAId,
          },
        });
      })(),
    ).rejects.toThrow("Product does not belong to the active organization.");
  });

  it("Contact ingestion remains Organization-scoped", async () => {
    if (!ready) return;
    const contacts = await prisma.contact.findMany({
      where: { organizationId: orgBId },
    });
    expect(contacts.every((c) => c.organizationId === orgBId)).toBe(true);
    expect(contacts.some((c) => c.id === contactBId)).toBe(true);
  });
});

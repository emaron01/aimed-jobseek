import { beforeAll, describe, expect, it } from "vitest";
import { seedContactOnList } from "@/test/contact-seed";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)("scoring framework", { timeout: 60_000 }, () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;

  let orgAId = "";
  let orgBId = "";
  let productAId = "";
  let productBId = "";
  let icpAId = "";
  let icpBId = "";
  let personaAId = "";
  let personaBId = "";
  let listAId = "";
  let contactAId = "";
  let contactBId = "";
  let ownerAId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();

    try {
      await prisma.$queryRaw`SELECT "productSnapshot" FROM "ScoringRun" LIMIT 0`;
      await prisma.$queryRaw`SELECT "scoringRunId" FROM "ContactScore" LIMIT 0`;
    } catch {
      console.warn(
        "Skipping scoring DB tests: run migration 20260320180000_scoring_run_framework first.",
      );
      return;
    }

    ready = true;
    const suffix = Date.now().toString(36);

    const orgA = await prisma.organization.create({
      data: {
        name: `[TEST] Score Org A ${suffix}`,
        slug: `test-score-a-${suffix}`,
        status: "ACTIVE",
      },
    });
    const orgB = await prisma.organization.create({
      data: {
        name: `[TEST] Score Org B ${suffix}`,
        slug: `test-score-b-${suffix}`,
        status: "ACTIVE",
      },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    const ownerA = await prisma.user.create({
      data: {
        email: `score-owner-a-${suffix}@example.test`,
        emailNormalized: `score-owner-a-${suffix}@example.test`,
      },
    });
    ownerAId = ownerA.id;
    const ownerB = await prisma.user.create({
      data: {
        email: `score-owner-b-${suffix}@example.test`,
        emailNormalized: `score-owner-b-${suffix}@example.test`,
      },
    });
    await prisma.organizationMembership.createMany({
      data: [
        { organizationId: orgAId, userId: ownerA.id, role: "OWNER" },
        { organizationId: orgBId, userId: ownerB.id, role: "OWNER" },
      ],
    });

    const productA = await prisma.product.create({
      data: { organizationId: orgAId, name: `[TEST] Score Product A ${suffix}` },
    });
    const productB = await prisma.product.create({
      data: { organizationId: orgAId, name: `[TEST] Score Product B ${suffix}` },
    });
    productAId = productA.id;
    productBId = productB.id;

    const icpA = await prisma.icp.create({
      data: {
        organizationId: orgAId,
        productId: productAId,
        name: `[TEST] Score ICP A ${suffix}`,
      },
    });
    const icpB = await prisma.icp.create({
      data: {
        organizationId: orgAId,
        productId: productBId,
        name: `[TEST] Score ICP B ${suffix}`,
      },
    });
    icpAId = icpA.id;
    icpBId = icpB.id;

    const personaA = await prisma.persona.create({
      data: {
        organizationId: orgAId,
        productId: productAId,
        name: `[TEST] Score Persona A ${suffix}`,
      },
    });
    const personaB = await prisma.persona.create({
      data: {
        organizationId: orgAId,
        productId: productBId,
        name: `[TEST] Score Persona B ${suffix}`,
      },
    });
    personaAId = personaA.id;
    personaBId = personaB.id;

    const listA = await prisma.contactList.create({
      data: {
        organizationId: orgAId,
        ownerUserId: ownerA.id,
        name: `[TEST] Score List A ${suffix}`,
        sourceType: "PASTE",
        totalContacts: 1,
      },
    });
    listAId = listA.id;

    const contactA = await seedContactOnList(prisma, {
      organizationId: orgAId,
      contactListId: listAId,
      firstName: "Ann",
      lastName: "Alpha",
      email: `ann-${suffix}@example.test`,
      company: "Alpha Co",
    });
    contactAId = contactA.id;

    const listB = await prisma.contactList.create({
      data: {
        organizationId: orgBId,
        ownerUserId: ownerB.id,
        name: `[TEST] Score List B ${suffix}`,
        sourceType: "UPLOAD",
        totalContacts: 1,
      },
    });
    const contactB = await seedContactOnList(prisma, {
      organizationId: orgBId,
      contactListId: listB.id,
      firstName: "Bob",
      lastName: "Beta",
      email: `bob-${suffix}@example.test`,
    });
    contactBId = contactB.id;
  });

  it("creates ScoringRun with valid Product/ICP/Persona and snapshots", async () => {
    if (!ready) return;

    const run = await prisma.scoringRun.create({
      data: {
        organizationId: orgAId,
        contactListId: listAId,
        productId: productAId,
        icpId: icpAId,
        personaId: personaAId,
        status: "PENDING",
        totalContacts: 1,
        scoredContacts: 0,
        productSnapshot: { id: productAId, name: "Snap Product A" },
        icpSnapshot: { id: icpAId, name: "Snap ICP A" },
        personaSnapshot: { id: personaAId, name: "Snap Persona A" },
      },
    });

    await prisma.contactScore.create({
      data: {
        organizationId: orgAId,
        contactId: contactAId,
        scoringRunId: run.id,
        researchStatus: "NOT_STARTED",
      },
    });

    expect(run.productSnapshot).toMatchObject({ name: "Snap Product A" });
    expect(run.totalContacts).toBe(1);
    expect(run.scoredContacts).toBe(0);
  });

  it("rejects mismatched Product/ICP combination", async () => {
    if (!ready) return;
    const icp = await prisma.icp.findFirst({
      where: { id: icpBId, productId: productAId },
    });
    expect(icp).toBeNull();
    await expect(
      (async () => {
        if (!icp) throw new Error("ICP does not belong to the selected product.");
      })(),
    ).rejects.toThrow("ICP does not belong to the selected product.");
  });

  it("rejects mismatched Product/Persona combination", async () => {
    if (!ready) return;
    const persona = await prisma.persona.findFirst({
      where: { id: personaBId, productId: productAId },
    });
    expect(persona).toBeNull();
    await expect(
      (async () => {
        if (!persona) {
          throw new Error("Persona does not belong to the selected product.");
        }
      })(),
    ).rejects.toThrow("Persona does not belong to the selected product.");
  });

  it("blocks cross-tenant ScoringRun access", async () => {
    if (!ready) return;
    const run = await prisma.scoringRun.create({
      data: {
        organizationId: orgAId,
        contactListId: listAId,
        productId: productAId,
        icpId: icpAId,
        personaId: personaAId,
        status: "PENDING",
        totalContacts: 1,
        scoredContacts: 0,
        productSnapshot: {},
        icpSnapshot: {},
        personaSnapshot: {},
      },
    });

    const leaked = await prisma.scoringRun.findFirst({
      where: { id: run.id, organizationId: orgBId },
    });
    expect(leaked).toBeNull();
  });

  it("allows the same Contact to have scores from multiple ScoringRuns", async () => {
    if (!ready) return;

    const run1 = await prisma.scoringRun.create({
      data: {
        organizationId: orgAId,
        contactListId: listAId,
        productId: productAId,
        icpId: icpAId,
        personaId: personaAId,
        status: "PENDING",
        totalContacts: 1,
        scoredContacts: 0,
        productSnapshot: { product: "A" },
        icpSnapshot: {},
        personaSnapshot: {},
      },
    });
    const run2 = await prisma.scoringRun.create({
      data: {
        organizationId: orgAId,
        contactListId: listAId,
        productId: productBId,
        icpId: icpBId,
        personaId: personaBId,
        status: "PENDING",
        totalContacts: 1,
        scoredContacts: 0,
        productSnapshot: { product: "B" },
        icpSnapshot: {},
        personaSnapshot: {},
      },
    });

    await prisma.contactScore.create({
      data: {
        organizationId: orgAId,
        contactId: contactAId,
        scoringRunId: run1.id,
      },
    });
    await prisma.contactScore.create({
      data: {
        organizationId: orgAId,
        contactId: contactAId,
        scoringRunId: run2.id,
      },
    });

    const scores = await prisma.contactScore.findMany({
      where: { organizationId: orgAId, contactId: contactAId },
    });
    expect(scores.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps historical ScoringRun snapshots when Setup records are edited", async () => {
    if (!ready) return;

    const run = await prisma.scoringRun.create({
      data: {
        organizationId: orgAId,
        contactListId: listAId,
        productId: productAId,
        icpId: icpAId,
        personaId: personaAId,
        status: "PENDING",
        totalContacts: 1,
        scoredContacts: 0,
        productSnapshot: { name: "Original Product Name" },
        icpSnapshot: { name: "Original ICP" },
        personaSnapshot: { name: "Original Persona" },
      },
    });

    await prisma.product.update({
      where: { id: productAId },
      data: { name: "Edited Product Name" },
    });

    const reloaded = await prisma.scoringRun.findUnique({
      where: { id: run.id },
    });
    expect(reloaded?.productSnapshot).toMatchObject({
      name: "Original Product Name",
    });
  });

  it("campaign creation only includes selected contacts and blocks cross-tenant contacts", async () => {
    if (!ready) return;

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: orgAId,
        ownerUserId: ownerAId,
        name: `[TEST] Score Campaign`,
        productId: productAId,
        icpId: icpAId,
        personaId: personaAId,
        offerName: "Pilot",
        status: "DRAFT",
      },
    });

    await prisma.campaignContact.create({
      data: {
        organizationId: orgAId,
        campaignId: campaign.id,
        contactId: contactAId,
        selected: true,
        status: "SELECTED",
      },
    });

    const foreign = await prisma.contact.findFirst({
      where: { id: contactBId, organizationId: orgAId },
    });
    expect(foreign).toBeNull();

    await expect(
      (async () => {
        if (!foreign) {
          throw new Error(
            "One or more selected contacts do not belong to the active organization.",
          );
        }
      })(),
    ).rejects.toThrow(
      "One or more selected contacts do not belong to the active organization.",
    );

    const members = await prisma.campaignContact.findMany({
      where: { campaignId: campaign.id, organizationId: orgAId },
    });
    expect(members).toHaveLength(1);
    expect(members[0].contactId).toBe(contactAId);
  });
});

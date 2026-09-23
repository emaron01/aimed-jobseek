import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TenantError } from "@/lib/tenant/errors";
import { seedContactOnList } from "@/test/contact-seed";

describe("campaign contact management seams", () => {
  it("routes campaign rows to detail and renders generation there only", () => {
    const listPage = readFileSync("src/app/(app)/campaigns/page.tsx", "utf8");
    const detailPage = readFileSync(
      "src/app/(app)/campaigns/[id]/page.tsx",
      "utf8",
    );
    const manager = readFileSync(
      "src/components/CampaignContactsManager.tsx",
      "utf8",
    );
    const actions = readFileSync(
      "src/app/actions/campaign-contacts.ts",
      "utf8",
    );

    expect(listPage).toContain("href={`/campaigns/${campaign.id}`}");
    expect(listPage).not.toContain("GenerateEmailDraftForm");
    expect(detailPage).not.toContain("GenerateEmailDraftForm");
    expect(detailPage).toContain("EmailDraftsStage");
    expect(detailPage).toContain("CampaignContactsManager");
    expect(detailPage).toContain("Compare drafts");
    expect(detailPage).toContain("{vocab.campaign.Singular} guidance");
    expect(detailPage).not.toContain(
      'mode={currentStage === "emails" ? "EMAILS" : "SEND"}',
    );
    expect(detailPage).toContain("Generate, edit, and send drafts");
    const draftsStage = readFileSync(
      "src/components/EmailDraftsStage.tsx",
      "utf8",
    );
    expect(draftsStage).toContain('data-testid="email-contacts-filter"');
    expect(draftsStage).toContain("Ready to send");
    expect(draftsStage).toContain('value="all"');
    expect(manager).toContain("Search existing {vocab.contact.plural}");
    expect(manager).toContain("Add from Scored Run");
    expect(manager).toContain(
      "Select an Existing {vocab.list.Singular} To Be Researched and Scored",
    );
    expect(manager).toContain("listIndexHref({ campaignId })");
    expect(manager).toContain("SECONDARY_BUTTON_CLASS");
    expect(manager).toContain("PRIMARY_BUTTON_CLASS");
    expect(manager).toContain("flex flex-col items-start gap-2");
    expect(manager).toContain("campaign-list-score-hint");
    expect(manager).toContain("campaign-contacts-status");
    expect(actions).toContain("addContactsToCampaignAction");
    expect(actions).toContain("addScoringRunContactsToCampaignAction");
    expect(actions).toContain("saveScoringRunAndReturnToCampaignAction");
    expect(actions).toContain('qualificationBuckets: ["GOOD"]');
    expect(actions).toContain("Promise<CampaignContactsActionResult>");
    const contactsLib = readFileSync("src/lib/campaign/contacts.ts", "utf8");
    expect(contactsLib).toContain("compatibleScoringRunWhere");
    expect(contactsLib).toContain("scoringRunPersonaWhere");
    expect(contactsLib).toContain("qualificationBuckets");
    expect(contactsLib).toContain("scoreLabelToBucket");
    expect(contactsLib).toContain("assertCanAttachCampaignContacts");
    expect(contactsLib).toContain("canEditCampaignTemplate");
    expect(contactsLib).not.toMatch(
      /personaId:\s*campaign\.personaId/,
    );
    // Multi-list campaigns: merge every compatible run; never pick one by score count.
    expect(contactsLib).toContain("getCampaignQualificationView");
    expect(contactsLib).toContain("selectedByContactId");
    expect(contactsLib).not.toMatch(
      /right\._count\.scores\s*-\s*left\._count\.scores/,
    );
    expect(contactsLib).toContain(
      "Only runs matching this campaign's product/ICP/persona config",
    );
    const campaignSummaries = readFileSync(
      "src/lib/contact/contacts-campaign-data.ts",
      "utf8",
    );
    expect(campaignSummaries).not.toMatch(
      /right\._count\.scores\s*-\s*left\._count\.scores/,
    );
    expect(campaignSummaries).toContain("selectedByContactId");
  });

  it("validates offer against product materials at save time without acknowledgment gates", () => {
    const form = readFileSync("src/components/CampaignOfferForm.tsx", "utf8");
    const action = readFileSync("src/app/actions/campaign-offer.ts", "utf8");
    const validation = readFileSync(
      "src/lib/campaign/offer-validation.ts",
      "utf8",
    );
    expect(form).not.toContain('name="acknowledgeOfferConflicts"');
    expect(form).not.toContain("Keep this offer anyway");
    expect(action).toContain("validateCampaignOffer");
    expect(action).not.toContain("offerConflictAcknowledgedHash");
    expect(action).not.toContain("offerConflictAcknowledgedAt");
    expect(action).not.toContain("requiresOfferAcknowledgment");
    expect(validation).toContain(
      'structuredOutputRequest("campaignOfferValidation")',
    );
    expect(validation).toContain("every factual assertion and commitment");
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "campaign contact assignment",
  { timeout: 60_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = Date.now().toString(36);
    let orgAId = "";
    let orgBId = "";
    let campaignId = "";
    let contactA1Id = "";
    let contactA2Id = "";
    let contactA3Id = "";
    let contactA4Id = "";
    let foreignContactId = "";
    let scoringRunId = "";
    let allPersonasRunId = "";
    let incompatibleRunId = "";
    const previousBypass = process.env.ALLOW_DEV_TENANT_BYPASS;
    const previousOrg = process.env.DEV_ORGANIZATION_ID;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "campaignId" FROM "CampaignContact" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping campaign contact DB tests: apply pending migrations first.",
        );
        return;
      }

      const orgA = await prisma.organization.create({
        data: {
          name: `[TEST] Campaign contacts A ${suffix}`,
          slug: `campaign-contacts-a-${suffix}`,
        },
      });
      const orgB = await prisma.organization.create({
        data: {
          name: `[TEST] Campaign contacts B ${suffix}`,
          slug: `campaign-contacts-b-${suffix}`,
        },
      });
      orgAId = orgA.id;
      orgBId = orgB.id;

      const owner = await prisma.user.create({
        data: {
          email: `campaign-contacts-owner-${suffix}@example.test`,
          emailNormalized: `campaign-contacts-owner-${suffix}@example.test`,
          name: "Campaign Contacts Owner",
        },
      });
      await prisma.organizationMembership.create({
        data: {
          organizationId: orgAId,
          userId: owner.id,
          role: "OWNER",
        },
      });

      const product = await prisma.product.create({
        data: { organizationId: orgAId, name: "Product A" },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: orgAId,
          productId: product.id,
          name: "ICP A",
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId: orgAId,
          productId: product.id,
          name: "Persona A",
        },
      });
      const list = await prisma.contactList.create({
        data: {
          organizationId: orgAId,
          ownerUserId: owner.id,
          name: "Scored list",
          totalContacts: 3,
        },
      });
      const [contactA1, contactA2, contactA3, contactA4] = await Promise.all([
        seedContactOnList(prisma, {
          organizationId: orgAId,
          contactListId: list.id,
          firstName: "Already",
          lastName: "Attached",
          email: `attached-${suffix}@example.test`,
        }),
        seedContactOnList(prisma, {
          organizationId: orgAId,
          contactListId: list.id,
          firstName: "Manual",
          lastName: "Candidate",
          email: `manual-${suffix}@example.test`,
        }),
        seedContactOnList(prisma, {
          organizationId: orgAId,
          contactListId: list.id,
          firstName: "Scored",
          lastName: "Candidate",
          email: `scored-${suffix}@example.test`,
        }),
        seedContactOnList(prisma, {
          organizationId: orgAId,
          contactListId: list.id,
          firstName: "All",
          lastName: "Personas",
          email: `all-personas-${suffix}@example.test`,
        }),
      ]);
      contactA1Id = contactA1.id;
      contactA2Id = contactA2.id;
      contactA3Id = contactA3.id;
      contactA4Id = contactA4.id;

      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgAId,
          ownerUserId: owner.id,
          name: "Campaign A",
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          offerName: "Audit",
          offerCta: "Book a call",
        },
      });
      campaignId = campaign.id;
      await prisma.campaignContact.create({
        data: {
          organizationId: orgAId,
          campaignId,
          contactId: contactA1Id,
          selected: true,
          status: "SELECTED",
        },
      });

      const scoringRun = await prisma.scoringRun.create({
        data: {
          organizationId: orgAId,
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          status: "COMPLETED",
          totalContacts: 2,
          scoredContacts: 2,
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: {},
          completedAt: new Date(),
        },
      });
      scoringRunId = scoringRun.id;
      await prisma.contactScore.createMany({
        data: [contactA2Id, contactA3Id].map((contactId) => ({
          organizationId: orgAId,
          scoringRunId,
          contactId,
          scoringStatus: "COMPLETED" as const,
          overallScore: 80,
          scoreLabel: "GOOD" as const,
        })),
      });

      const allPersonasRun = await prisma.scoringRun.create({
        data: {
          organizationId: orgAId,
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: null,
          status: "COMPLETED",
          totalContacts: 1,
          scoredContacts: 1,
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: {},
          completedAt: new Date(),
        },
      });
      allPersonasRunId = allPersonasRun.id;
      await prisma.contactScore.create({
        data: {
          organizationId: orgAId,
          scoringRunId: allPersonasRunId,
          contactId: contactA4Id,
          scoringStatus: "COMPLETED",
          overallScore: 82,
          scoreLabel: "GOOD",
        },
      });

      const otherProduct = await prisma.product.create({
        data: { organizationId: orgAId, name: "Other product" },
      });
      const otherIcp = await prisma.icp.create({
        data: {
          organizationId: orgAId,
          productId: otherProduct.id,
          name: "Other ICP",
        },
      });
      const otherPersona = await prisma.persona.create({
        data: {
          organizationId: orgAId,
          productId: otherProduct.id,
          name: "Other persona",
        },
      });
      incompatibleRunId = (
        await prisma.scoringRun.create({
          data: {
            organizationId: orgAId,
            contactListId: list.id,
            productId: otherProduct.id,
            icpId: otherIcp.id,
            personaId: otherPersona.id,
            status: "COMPLETED",
            productSnapshot: {},
            icpSnapshot: {},
            personaSnapshot: {},
          },
        })
      ).id;

      const foreignList = await prisma.contactList.create({
        data: {
          organizationId: orgBId,
          ownerUserId: owner.id,
          name: "Foreign list",
          totalContacts: 1,
        },
      });
      foreignContactId = (
        await seedContactOnList(prisma, {
          organizationId: orgBId,
          contactListId: foreignList.id,
          email: `foreign-${suffix}@example.test`,
        })
      ).id;

      process.env.ALLOW_DEV_TENANT_BYPASS = "true";
      process.env.DEV_ORGANIZATION_ID = orgAId;
      ready = true;
    }, 60_000);

    afterAll(async () => {
      if (previousBypass == null) {
        delete process.env.ALLOW_DEV_TENANT_BYPASS;
      } else {
        process.env.ALLOW_DEV_TENANT_BYPASS = previousBypass;
      }
      if (previousOrg == null) {
        delete process.env.DEV_ORGANIZATION_ID;
      } else {
        process.env.DEV_ORGANIZATION_ID = previousOrg;
      }
      if (orgAId) {
        await prisma.organization
          .delete({ where: { id: orgAId } })
          .catch(() => undefined);
      }
      if (orgBId) {
        await prisma.organization
          .delete({ where: { id: orgBId } })
          .catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    }, 60_000);

    it("searches only unattached contacts in the active organization", async () => {
      if (!ready) return;
      const { searchAvailableCampaignContacts } =
        await import("@/lib/campaign/contacts");
      const all = await searchAvailableCampaignContacts(campaignId);
      expect(all.map((contact) => contact.id)).toEqual(
        expect.arrayContaining([contactA2Id, contactA3Id]),
      );
      expect(all.map((contact) => contact.id)).not.toContain(contactA1Id);
      expect(all.map((contact) => contact.id)).not.toContain(foreignContactId);

      const searched = await searchAvailableCampaignContacts(
        campaignId,
        "Manual",
      );
      expect(searched.map((contact) => contact.id)).toEqual([contactA2Id]);
    });

    it("adds selected contacts as SELECTED and is duplicate-safe", async () => {
      if (!ready) return;
      const { addContactsToCampaign, getCampaignDetail } =
        await import("@/lib/campaign/contacts");
      expect(
        await addContactsToCampaign({
          campaignId,
          contactIds: [contactA2Id, contactA2Id],
        }),
      ).toBe(1);
      expect(
        await addContactsToCampaign({
          campaignId,
          contactIds: [contactA2Id],
        }),
      ).toBe(0);

      const detail = await getCampaignDetail(campaignId);
      const attached = detail.contacts.find(
        (row) => row.contact.id === contactA2Id,
      );
      expect(attached?.selected).toBe(true);
      expect(attached?.status).toBe("SELECTED");
    });

    it("bulk adds completed contacts from a compatible scoring run", async () => {
      if (!ready) return;
      const { addScoringRunContactsToCampaign, listCompatibleScoringRuns } =
        await import("@/lib/campaign/contacts");

      const runs = await listCompatibleScoringRuns(campaignId);
      expect(runs.map((run) => run.id)).toContain(scoringRunId);
      expect(runs.map((run) => run.id)).not.toContain(incompatibleRunId);
      expect(
        runs.find((run) => run.id === scoringRunId)?.completedScoreCount,
      ).toBe(2);

      // contact A2 was added manually; only A3 is newly inserted.
      expect(
        await addScoringRunContactsToCampaign({
          campaignId,
          scoringRunId,
        }),
      ).toBe(1);
      const row = await prisma.campaignContact.findFirst({
        where: { organizationId: orgAId, campaignId, contactId: contactA3Id },
      });
      expect(row?.selected).toBe(true);
      expect(row?.status).toBe("SELECTED");
    });

    it("lists an all-personas scoring run for a campaign that shares product and ICP", async () => {
      if (!ready) return;
      const { addScoringRunContactsToCampaign, listCompatibleScoringRuns } =
        await import("@/lib/campaign/contacts");

      const runs = await listCompatibleScoringRuns(campaignId);
      expect(runs.map((run) => run.id)).toContain(allPersonasRunId);
      expect(runs.map((run) => run.id)).toContain(scoringRunId);
      expect(runs.map((run) => run.id)).not.toContain(incompatibleRunId);

      expect(
        await addScoringRunContactsToCampaign({
          campaignId,
          scoringRunId: allPersonasRunId,
        }),
      ).toBe(1);
      const row = await prisma.campaignContact.findFirst({
        where: {
          organizationId: orgAId,
          campaignId,
          contactId: contactA4Id,
        },
      });
      expect(row?.selected).toBe(true);
      expect(row?.status).toBe("SELECTED");
    });

    it("rejects foreign contacts and incompatible scoring runs", async () => {
      if (!ready) return;
      const { addContactsToCampaign, addScoringRunContactsToCampaign } =
        await import("@/lib/campaign/contacts");
      await expect(
        addContactsToCampaign({
          campaignId,
          contactIds: [foreignContactId],
        }),
      ).rejects.toBeInstanceOf(TenantError);
      await expect(
        addScoringRunContactsToCampaign({
          campaignId,
          scoringRunId: incompatibleRunId,
        }),
      ).rejects.toBeInstanceOf(TenantError);
    });

    it("updates campaign email settings only in the active organization", async () => {
      if (!ready) return;
      const { updateCampaignEmailSettings } =
        await import("@/lib/campaign/settings");

      await updateCampaignEmailSettings({
        campaignId,
        emailLength: "SHORT",
        emailGuidance: "Emphasize the free trial",
      });
      const updated = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaignId },
      });
      expect(updated.emailLength).toBe("SHORT");
      expect(updated.emailGuidance).toBe("Emphasize the free trial");

      process.env.DEV_ORGANIZATION_ID = orgBId;
      try {
        await expect(
          updateCampaignEmailSettings({
            campaignId,
            emailLength: "LONG",
            emailGuidance: null,
          }),
        ).rejects.toBeInstanceOf(TenantError);
      } finally {
        process.env.DEV_ORGANIZATION_ID = orgAId;
      }
    });
  },
);

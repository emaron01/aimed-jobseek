/**
 * List archive/delete: FK inventory, block vs archive, no cascade through
 * campaign contacts that are still referenced.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedContactOnList } from "@/test/contact-seed";
import {
  decideListDelete,
  listArchiveConfirmBody,
  listDeleteConfirmBody,
} from "@/lib/tenant/list-delete";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("list archive/delete contracts", () => {
  it("schema ContactList FKs match the inventory in list-delete.ts", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const list = schema.match(/model ContactList \{[\s\S]*?\n\}/)?.[0] ?? "";
    const contact = schema.match(/model Contact \{[\s\S]*?\n\}/)?.[0] ?? "";
    const membership =
      schema.match(/model ContactListMembership \{[\s\S]*?\n\}/)?.[0] ?? "";
    const scoringRun = schema.match(/model ScoringRun \{[\s\S]*?\n\}/)?.[0] ?? "";
    const campaignContact =
      schema.match(/model CampaignContact \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(list).toContain("memberships");
    expect(list).toContain("scoringRuns");
    expect(list).toContain("archivedAt");
    expect(list).toContain("contactsArchivedByThis");
    expect(contact).not.toMatch(/contactListId\s+String/);
    expect(contact).toContain("memberships");
    expect(contact).toContain("archiveReason");
    expect(contact).toContain("archivedByListId");
    expect(schema).toContain("enum ContactArchiveReason");
    expect(schema).toContain("LIST_CASCADE");
    expect(schema).toContain("DIRECT");
    expect(membership).toMatch(/contactListId\s+String/);
    expect(membership).toMatch(/onDelete: Cascade/);
    expect(scoringRun).toMatch(/contactListId\s+String/);
    expect(scoringRun).toMatch(/onDelete: Cascade/);
    expect(campaignContact).toMatch(/contactId\s+String/);
    expect(campaignContact).toMatch(/onDelete: Cascade/);
    const src = readFileSync("src/lib/tenant/list-delete.ts", "utf8");
    expect(src).toContain("ContactListMembership");
    expect(src).not.toContain("Contact.contactListId");
    expect(src).toContain("ScoringRun.contactListId");
    expect(src).toContain("CampaignContact");
    expect(src).toContain("EmailDraft");
    expect(src).toContain("EmailSendRecord");
    expect(src).toContain("ContactScore");
    expect(src).toContain("TitleSuggestion");
    expect(src).toContain("QualificationBucketOverride");
    expect(src).toContain("cascadeArchiveContactsForList");
    expect(src).toContain("restoreCascadeArchivedContactsForList");
    expect(src).toContain("LIST_CASCADE");
  });

  it("delete confirmation names memberships, scoring runs, and campaigns", () => {
    const body = listDeleteConfirmBody({
      mode: "delete",
      impact: {
        contactCount: 4,
        scoringRunCount: 2,
        campaignCount: 1,
        activeCampaignCount: 0,
        draftCount: 0,
        sentCount: 0,
      },
      message: "",
    });
    expect(body).toContain("4 membership(s)");
    expect(body).toContain("2 scoring run(s)");
    expect(listArchiveConfirmBody()).toMatch(/reversible/i);
  });

  it("archive vs delete: scoring history archives; campaigns do not block", () => {
    expect(
      decideListDelete({
        contactCount: 3,
        scoringRunCount: 0,
        campaignCount: 1,
        activeCampaignCount: 1,
        draftCount: 0,
        sentCount: 0,
      }).mode,
    ).toBe("delete");
    expect(
      decideListDelete({
        contactCount: 3,
        scoringRunCount: 2,
        campaignCount: 0,
        activeCampaignCount: 0,
        draftCount: 0,
        sentCount: 0,
      }).mode,
    ).toBe("archive");
    expect(
      decideListDelete({
        contactCount: 2,
        scoringRunCount: 0,
        campaignCount: 0,
        activeCampaignCount: 0,
        draftCount: 0,
        sentCount: 0,
      }).mode,
    ).toBe("delete");
  });
});

describe.skipIf(!hasDatabase)(
  "List archive and delete lifecycle",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let orgA = "";
    let ownerId = "";
    const suffix = Date.now().toString(36);
    const previousBypass = process.env.ALLOW_DEV_TENANT_BYPASS;
    const previousOrg = process.env.DEV_ORGANIZATION_ID;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "archivedAt" FROM "ContactList" LIMIT 0`;
        await prisma.$queryRaw`SELECT "contactListId" FROM "ContactListMembership" LIMIT 0`;
        const org = await prisma.organization.create({
          data: {
            name: `[TEST] ListArch ${suffix}`,
            slug: `test-list-arch-${suffix}`,
          },
        });
        orgA = org.id;
        const owner = await prisma.user.create({
          data: {
            email: `list-archive-owner-${suffix}@example.test`,
            emailNormalized: `list-archive-owner-${suffix}@example.test`,
          },
        });
        ownerId = owner.id;
        await prisma.organizationMembership.create({
          data: { organizationId: orgA, userId: ownerId, role: "OWNER" },
        });
        process.env.ALLOW_DEV_TENANT_BYPASS = "true";
        process.env.DEV_ORGANIZATION_ID = orgA;
        ready = true;
      } catch (e) {
        console.warn("Skipping list archive DB tests — run db:test:migrate:", e);
      }
    });

    afterAll(async () => {
      if (previousBypass == null) delete process.env.ALLOW_DEV_TENANT_BYPASS;
      else process.env.ALLOW_DEV_TENANT_BYPASS = previousBypass;
      if (previousOrg == null) delete process.env.DEV_ORGANIZATION_ID;
      else process.env.DEV_ORGANIZATION_ID = previousOrg;
      if (orgA) {
        await prisma.organization.delete({ where: { id: orgA } }).catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    async function seedProduct() {
      const product = await prisma.product.create({
        data: { organizationId: orgA, name: `Product ${suffix}-${Math.random()}` },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `ICP ${suffix}`,
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId: orgA,
          productId: product.id,
          name: `Persona ${suffix}`,
        },
      });
      return { product, icp, persona };
    }

    it("archived list is hidden from campaign stage 5 and scoring", async () => {
      if (!ready) return;
      const { product, icp, persona } = await seedProduct();
      const list = await prisma.contactList.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Archived list ${suffix}`,
        },
      });
      const contact = await seedContactOnList(prisma, {
        organizationId: orgA,
        contactListId: list.id,
        firstName: "Hidden",
        lastName: "Row",
        email: `hidden-${suffix}@example.test`,
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Stage5 ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
        },
      });
      await prisma.persona.update({
        where: { id: persona.id },
        data: { campaignId: campaign.id },
      });
      const scoringRun = await prisma.scoringRun.create({
        data: {
          organizationId: orgA,
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          status: "COMPLETED",
          totalContacts: 1,
          scoredContacts: 1,
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: {},
        },
      });
      await prisma.contactScore.create({
        data: {
          organizationId: orgA,
          contactId: contact.id,
          scoringRunId: scoringRun.id,
          scoringStatus: "COMPLETED",
          overallScore: 80,
        },
      });
      const { searchAvailableCampaignContacts, listCompatibleScoringRuns } =
        await import("@/lib/campaign/contacts");
      expect(
        (await searchAvailableCampaignContacts(campaign.id)).some(
          (row) => row.id === contact.id,
        ),
      ).toBe(true);
      expect(
        (await listCompatibleScoringRuns(campaign.id)).some(
          (run) => run.contactList.name === list.name,
        ),
      ).toBe(true);

      const { archiveContactList } = await import("@/lib/tenant/list-delete");
      await archiveContactList(list.id);

      const { listContactLists } = await import("@/lib/tenant/data");
      expect(
        (await listContactLists()).some((row) => row.id === list.id),
      ).toBe(false);
      expect(
        (await listContactLists({ includeArchived: true })).some(
          (row) => row.id === list.id,
        ),
      ).toBe(true);

      expect(
        (await searchAvailableCampaignContacts(campaign.id)).some(
          (row) => row.id === contact.id,
        ),
      ).toBe(false);
      expect(await listCompatibleScoringRuns(campaign.id)).toEqual([]);

      const { createScoringRun } = await import("@/lib/tenant/data");
      await expect(
        createScoringRun({
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
        }),
      ).rejects.toThrow(/archived/i);

      // Not yet on the campaign — cascade-archives with the list.
      const cascaded = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id },
      });
      expect(cascaded.archivedAt).not.toBeNull();
      expect(cascaded.archiveReason).toBe("LIST_CASCADE");
      expect(cascaded.archivedByListId).toBe(list.id);
    });

    it("archives contacts only when every list is archived and no active campaign", async () => {
      if (!ready) return;
      const listA = await prisma.contactList.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Cascade A ${suffix}`,
        },
      });
      const listB = await prisma.contactList.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Cascade B ${suffix}`,
        },
      });
      const onlyA = await seedContactOnList(prisma, {
        organizationId: orgA,
        contactListId: listA.id,
        email: `only-a-${suffix}@example.test`,
      });
      const onBoth = await seedContactOnList(prisma, {
        organizationId: orgA,
        contactListId: listA.id,
        email: `both-${suffix}@example.test`,
      });
      await prisma.contactListMembership.create({
        data: {
          organizationId: orgA,
          contactListId: listB.id,
          contactId: onBoth.id,
        },
      });
      const { product, icp, persona } = await seedProduct();
      const campaignContact = await seedContactOnList(prisma, {
        organizationId: orgA,
        contactListId: listA.id,
        email: `camp-a-${suffix}@example.test`,
      });
      await prisma.campaign.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Keep active ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          contacts: {
            create: {
              organizationId: orgA,
              contactId: campaignContact.id,
            },
          },
        },
      });

      const { archiveContactList, unarchiveContactList } = await import(
        "@/lib/tenant/list-delete"
      );
      const archived = await archiveContactList(listA.id);
      expect(archived.cascadedContactCount).toBe(1);

      const onlyARow = await prisma.contact.findUniqueOrThrow({
        where: { id: onlyA.id },
      });
      expect(onlyARow.archivedAt).not.toBeNull();
      expect(onlyARow.archiveReason).toBe("LIST_CASCADE");
      expect(onlyARow.archivedByListId).toBe(listA.id);

      const bothRow = await prisma.contact.findUniqueOrThrow({
        where: { id: onBoth.id },
      });
      expect(bothRow.archivedAt).toBeNull();

      const campRow = await prisma.contact.findUniqueOrThrow({
        where: { id: campaignContact.id },
      });
      expect(campRow.archivedAt).toBeNull();

      // Direct-archived contact must not restore on list unarchive.
      await prisma.contact.update({
        where: { id: onBoth.id },
        data: {
          archivedAt: new Date(),
          archiveReason: "DIRECT",
          archivedByListId: null,
        },
      });

      const restored = await unarchiveContactList(listA.id);
      expect(restored.restoredContactCount).toBe(1);
      const onlyARestored = await prisma.contact.findUniqueOrThrow({
        where: { id: onlyA.id },
      });
      expect(onlyARestored.archivedAt).toBeNull();
      expect(onlyARestored.archiveReason).toBeNull();
      expect(onlyARestored.archivedByListId).toBeNull();

      const bothStillDirect = await prisma.contact.findUniqueOrThrow({
        where: { id: onBoth.id },
      });
      expect(bothStillDirect.archivedAt).not.toBeNull();
      expect(bothStillDirect.archiveReason).toBe("DIRECT");
    });

    it("a list with scoring history archives rather than hard-deletes", async () => {
      if (!ready) return;
      const { product, icp, persona } = await seedProduct();
      const list = await prisma.contactList.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Scored list ${suffix}`,
        },
      });
      const contact = await seedContactOnList(prisma, {
        organizationId: orgA,
        contactListId: list.id,
        email: `scored-list-${suffix}@example.test`,
      });
      await prisma.scoringRun.create({
        data: {
          organizationId: orgA,
          contactListId: list.id,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          status: "COMPLETED",
          productSnapshot: {},
          icpSnapshot: {},
          personaSnapshot: {},
        },
      });
      const { deleteOrArchiveContactList } = await import(
        "@/lib/tenant/list-delete"
      );
      const result = await deleteOrArchiveContactList(list.id);
      expect(result.mode).toBe("archived");
      const kept = await prisma.contactList.findUnique({ where: { id: list.id } });
      expect(kept?.archivedAt).not.toBeNull();
      const contactRow = await prisma.contact.findUnique({
        where: { id: contact.id },
      });
      expect(contactRow).not.toBeNull();
      expect(contactRow?.archivedAt).not.toBeNull();
      expect(contactRow?.archiveReason).toBe("LIST_CASCADE");
      expect(contactRow?.archivedByListId).toBe(list.id);
    });

    it("a list attached to an active campaign deletes; campaign contacts survive", async () => {
      if (!ready) return;
      const { product, icp, persona } = await seedProduct();
      const list = await prisma.contactList.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Active-campaign list ${suffix}`,
        },
      });
      const contact = await seedContactOnList(prisma, {
        organizationId: orgA,
        contactListId: list.id,
        email: `active-camp-${suffix}@example.test`,
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Active ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
        },
      });
      await prisma.campaignContact.create({
        data: {
          organizationId: orgA,
          campaignId: campaign.id,
          contactId: contact.id,
        },
      });
      const { deleteOrArchiveContactList } = await import(
        "@/lib/tenant/list-delete"
      );
      const deleted = await deleteOrArchiveContactList(list.id);
      expect(deleted.mode).toBe("deleted");
      expect(
        await prisma.contactList.findUnique({ where: { id: list.id } }),
      ).toBeNull();
      expect(
        await prisma.contactListMembership.count({
          where: { contactListId: list.id },
        }),
      ).toBe(0);
      expect(
        await prisma.contact.findUnique({ where: { id: contact.id } }),
      ).not.toBeNull();
      expect(
        await prisma.campaignContact.findFirst({
          where: { campaignId: campaign.id, contactId: contact.id },
        }),
      ).not.toBeNull();
    });

    it("hard-deleting a list keeps contacts; campaign drafts survive", async () => {
      if (!ready) return;
      const { product, icp, persona } = await seedProduct();
      const disposable = await prisma.contactList.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Disposable ${suffix}`,
        },
      });
      const disposableContact = await seedContactOnList(prisma, {
        organizationId: orgA,
        contactListId: disposable.id,
        email: `disposable-${suffix}@example.test`,
      });
      const referenced = await prisma.contactList.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Referenced ${suffix}`,
        },
      });
      const referencedContact = await seedContactOnList(prisma, {
        organizationId: orgA,
        contactListId: referenced.id,
        email: `referenced-${suffix}@example.test`,
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Keep ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
        },
      });
      const campaignContact = await prisma.campaignContact.create({
        data: {
          organizationId: orgA,
          campaignId: campaign.id,
          contactId: referencedContact.id,
        },
      });
      await prisma.emailDraft.create({
        data: {
          organizationId: orgA,
          campaignContactId: campaignContact.id,
          sequenceNumber: 1,
          subject: "Keep me",
          body: "Campaign draft must survive list delete",
          status: "DRAFT",
        },
      });

      const { deleteOrArchiveContactList } = await import(
        "@/lib/tenant/list-delete"
      );
      const deleted = await deleteOrArchiveContactList(disposable.id);
      expect(deleted.mode).toBe("deleted");
      expect(
        await prisma.contact.findUnique({ where: { id: disposableContact.id } }),
      ).not.toBeNull();
      expect(
        await prisma.contactListMembership.count({
          where: { contactId: disposableContact.id },
        }),
      ).toBe(0);

      const deletedRef = await deleteOrArchiveContactList(referenced.id);
      expect(deletedRef.mode).toBe("deleted");
      expect(
        await prisma.contact.findUnique({ where: { id: referencedContact.id } }),
      ).not.toBeNull();
      expect(
        await prisma.campaignContact.count({
          where: { campaignId: campaign.id, contactId: referencedContact.id },
        }),
      ).toBe(1);
      expect(
        await prisma.emailDraft.count({
          where: { campaignContactId: campaignContact.id },
        }),
      ).toBe(1);
    });

    it("deleting a Contact does not clear EmailSuppression for that address", async () => {
      if (!ready) return;
      const list = await prisma.contactList.create({
        data: {
          organizationId: orgA,
          ownerUserId: ownerId,
          name: `Supp contact ${suffix}`,
        },
      });
      const email = `supp-contact-${suffix}@example.test`;
      const contact = await seedContactOnList(prisma, {
        organizationId: orgA,
        contactListId: list.id,
        email,
      });
      const user = await prisma.user.create({
        data: {
          email: `supp-actor-${suffix}@example.test`,
          emailNormalized: `supp-actor-${suffix}@example.test`,
          name: "Supp Actor",
        },
      });
      const { normalizeSuppressionEmail } = await import(
        "@/lib/suppression/normalize"
      );
      const normalized = normalizeSuppressionEmail(email)!;
      await prisma.emailSuppression.create({
        data: {
          organizationId: orgA,
          normalizedEmail: normalized,
          reason: "DO_NOT_CONTACT",
          status: "ACTIVE",
          suppressedById: user.id,
        },
      });

      const { deleteOrArchiveContact } = await import(
        "@/lib/tenant/contact-delete"
      );
      const result = await deleteOrArchiveContact(contact.id);
      expect(result.mode).toBe("deleted");
      expect(
        await prisma.contact.findUnique({ where: { id: contact.id } }),
      ).toBeNull();
      const suppression = await prisma.emailSuppression.findUnique({
        where: {
          organizationId_normalizedEmail: {
            organizationId: orgA,
            normalizedEmail: normalized,
          },
        },
      });
      expect(suppression?.status).toBe("ACTIVE");
    });
  },
);

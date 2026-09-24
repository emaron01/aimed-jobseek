/**
 * Deliberate collapse proof: plus-tag aliases, title/company diffs, research
 * quality, dual-campaign send history, shared-campaign unique remap.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "contact collapse deliberate fixture",
  { timeout: 90_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    let orgId = "";
    const suffix = Date.now().toString(36);

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT "contactListId" FROM "ContactListMembership" LIMIT 0`;
        await prisma.$queryRaw`SELECT "winnerContactId" FROM "ContactMergeAudit" LIMIT 0`;
        const org = await prisma.organization.create({
          data: {
            name: `[TEST] CollapseProof ${suffix}`,
            slug: `test-collapse-proof-${suffix}`,
            status: "ACTIVE",
          },
        });
        orgId = org.id;
        ready = true;
      } catch (e) {
        console.warn(
          "Skipping deliberate collapse DB tests — run db:test:migrate:",
          e,
        );
      }
    });

    afterAll(async () => {
      if (orgId) {
        await prisma.organization
          .delete({ where: { id: orgId } })
          .catch(() => undefined);
      }
      if (prisma) await prisma.$disconnect();
    });

    it("merges plus-tag duplicates with research, campaigns, sends, and title history", async () => {
      if (!ready) return;

      const user = await prisma.user.create({
        data: {
          email: `collapse-sender-${suffix}@example.test`,
          emailNormalized: `collapse-sender-${suffix}@example.test`,
          name: "Collapse Sender",
        },
      });

      const product = await prisma.product.create({
        data: { organizationId: orgId, name: `Product ${suffix}` },
      });
      const icp = await prisma.icp.create({
        data: {
          organizationId: orgId,
          productId: product.id,
          name: `ICP ${suffix}`,
        },
      });
      const persona = await prisma.persona.create({
        data: {
          organizationId: orgId,
          productId: product.id,
          name: `Persona ${suffix}`,
        },
      });
      const offer = await prisma.offer.create({
        data: {
          organizationId: orgId,
          name: `Offer ${suffix}`,
        },
      });

      const list1 = await prisma.contactList.create({
        data: {
          organizationId: orgId,
          ownerUserId: user.id,
          name: `Proof L1 ${suffix}`,
          sourceType: "PASTE",
          totalContacts: 1,
        },
      });
      const list2 = await prisma.contactList.create({
        data: {
          organizationId: orgId,
          ownerUserId: user.id,
          name: `Proof L2 ${suffix}`,
          sourceType: "UPLOAD",
          totalContacts: 1,
        },
      });

      // Same person via plus-tag: alex@… and alex+news@… → alex@…
      const baseLocal = `alex-${suffix}`;
      const emailPlain = `${baseLocal}@example.test`;
      const emailPlus = `${baseLocal}+news@example.test`;

      const companyAlpha = await prisma.company.create({
        data: {
          organizationId: orgId,
          name: "Alpha Co",
          normalizedName: `alpha-co-${suffix}`,
        },
      });
      const companyBeta = await prisma.company.create({
        data: {
          organizationId: orgId,
          name: "Beta Co",
          normalizedName: `beta-co-${suffix}`,
        },
      });

      // null normalizedEmail so unique allows both pre-collapse rows.
      const older = await prisma.contact.create({
        data: {
          organizationId: orgId,
          ownerUserId: user.id,
          email: emailPlain,
          normalizedEmail: null,
          firstName: "Alex",
          lastName: "Rivera",
          title: "Director",
          company: "Alpha Co",
          companyId: companyAlpha.id,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          memberships: {
            create: {
              organizationId: orgId,
              contactListId: list1.id,
            },
          },
        },
      });
      const newer = await prisma.contact.create({
        data: {
          organizationId: orgId,
          ownerUserId: user.id,
          email: emailPlus,
          normalizedEmail: null,
          firstName: "Alex",
          lastName: "Rivera",
          title: "VP Sales",
          company: "Beta Co",
          companyId: companyBeta.id,
          createdAt: new Date("2024-06-01T00:00:00.000Z"),
          memberships: {
            create: {
              organizationId: orgId,
              contactListId: list2.id,
            },
          },
        },
      });

      // Weaker research on survivor; stronger on loser → apply must keep HIGH/COMPLETED.
      const weakResearch = await prisma.contactResearch.create({
        data: {
          organizationId: orgId,
          contactId: older.id,
          status: "PARTIAL",
          confidence: "LOW",
          roleSummary: "Thin signal",
        },
      });
      const strongResearch = await prisma.contactResearch.create({
        data: {
          organizationId: orgId,
          contactId: newer.id,
          status: "COMPLETED",
          confidence: "HIGH",
          roleSummary: "Owns pipeline and team",
        },
      });

      const campaignA = await prisma.campaign.create({
        data: {
          organizationId: orgId,
          ownerUserId: user.id,
          name: `Campaign A ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          offerId: offer.id,
          offerName: offer.name,
          status: "ACTIVE",
        },
      });
      const campaignB = await prisma.campaign.create({
        data: {
          organizationId: orgId,
          ownerUserId: user.id,
          name: `Campaign B ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          offerId: offer.id,
          offerName: offer.name,
          status: "ACTIVE",
        },
      });
      // Shared campaign: both contacts attached → remap must merge without unique violation.
      const campaignShared = await prisma.campaign.create({
        data: {
          organizationId: orgId,
          ownerUserId: user.id,
          name: `Campaign Shared ${suffix}`,
          productId: product.id,
          icpId: icp.id,
          personaId: persona.id,
          offerId: offer.id,
          offerName: offer.name,
          status: "ACTIVE",
        },
      });

      const ccA = await prisma.campaignContact.create({
        data: {
          organizationId: orgId,
          campaignId: campaignA.id,
          contactId: older.id,
          selected: true,
          status: "SELECTED",
        },
      });
      const ccB = await prisma.campaignContact.create({
        data: {
          organizationId: orgId,
          campaignId: campaignB.id,
          contactId: newer.id,
          selected: true,
          status: "SELECTED",
        },
      });
      const ccSharedOlder = await prisma.campaignContact.create({
        data: {
          organizationId: orgId,
          campaignId: campaignShared.id,
          contactId: older.id,
          selected: true,
          status: "SELECTED",
        },
      });
      const ccSharedNewer = await prisma.campaignContact.create({
        data: {
          organizationId: orgId,
          campaignId: campaignShared.id,
          contactId: newer.id,
          selected: true,
          status: "SELECTED",
        },
      });

      async function seedSend(
        campaignContactId: string,
        recipient: string,
        label: string,
      ) {
        const draft = await prisma.emailDraft.create({
          data: {
            organizationId: orgId,
            campaignContactId,
            sequenceNumber: 1,
            subject: `Hello ${label}`,
            body: `Body ${label}`,
            generatedBody: `Body ${label}`,
            status: "SENT",
            sentAt: new Date(),
            sentByUserId: user.id,
            sentMethod: "MANUAL_ASSERTION",
          },
        });
        return prisma.emailSendRecord.create({
          data: {
            organizationId: orgId,
            emailDraftId: draft.id,
            campaignContactId,
            recipient,
            subject: `Hello ${label}`,
            generatedBody: `Body ${label}`,
            finalBody: `Body ${label}`,
            sentByUserId: user.id,
            method: "DEEPLINK_INTENT",
          },
        });
      }

      const sendA = await seedSend(ccA.id, emailPlain, "A");
      const sendB = await seedSend(ccB.id, emailPlus, "B");
      const sendSharedOlder = await seedSend(
        ccSharedOlder.id,
        emailPlain,
        "SharedOlder",
      );
      const sendSharedNewer = await seedSend(
        ccSharedNewer.id,
        emailPlus,
        "SharedNewer",
      );

      const {
        previewContactCollapse,
        applyContactCollapse,
      } = await import("@/lib/contact/collapse");

      const preview = await previewContactCollapse(prisma, {
        organizationId: orgId,
      });

      console.log(
        "COLLAPSE_PREVIEW_OUTPUT\n",
        JSON.stringify(preview, null, 2),
      );

      expect(preview.duplicateGroupCount).toBe(1);
      expect(preview.contactsThatWouldMergeAway).toBe(1);
      const group = preview.groups[0]!;
      expect(group.normalizedEmail).toBe(emailPlain.toLowerCase());
      expect(group.winnerContactId).toBe(older.id);
      expect(group.loserContactIds).toEqual([newer.id]);
      expect(group.listIds.sort()).toEqual([list1.id, list2.id].sort());
      expect(group.proposedMerges).toHaveLength(1);
      expect(group.proposedMerges[0]?.loserSnapshot.title).toBe("VP Sales");
      expect(group.proposedMerges[0]?.loserSnapshot.company).toBe("Beta Co");
      const titleMerge = group.proposedMerges[0]?.fieldMerges.find(
        (m) => m.field === "title",
      );
      expect(titleMerge).toMatchObject({
        fromLoser: "VP Sales",
        intoWinner: "Director",
        kept: "loser",
      });
      const companyMerge = group.proposedMerges[0]?.fieldMerges.find(
        (m) => m.field === "company",
      );
      expect(companyMerge).toMatchObject({
        fromLoser: "Beta Co",
        intoWinner: "Alpha Co",
        kept: "loser",
      });

      const after = await applyContactCollapse(prisma, {
        organizationId: orgId,
      });
      expect(after.duplicateGroupCount).toBe(0);

      const survivor = await prisma.contact.findUnique({
        where: { id: older.id },
        include: {
          memberships: true,
          contactResearch: true,
          campaignContacts: {
            include: {
              emailDrafts: true,
              sendRecords: true,
            },
          },
        },
      });
      expect(survivor).not.toBeNull();
      expect(
        await prisma.contact.findUnique({ where: { id: newer.id } }),
      ).toBeNull();

      // Memberships on both lists.
      expect(survivor!.memberships).toHaveLength(2);
      expect(
        survivor!.memberships.map((m) => m.contactListId).sort(),
      ).toEqual([list1.id, list2.id].sort());

      // Incoming non-null wins + title history.
      expect(survivor!.title).toBe("VP Sales");
      expect(survivor!.previousTitle).toBe("Director");
      expect(survivor!.titleChangedAt).toBeInstanceOf(Date);
      expect(survivor!.company).toBe("Beta Co");
      expect(survivor!.companyId).toBe(companyBeta.id);
      expect(survivor!.normalizedEmail).toBe(emailPlain.toLowerCase());

      // Better research kept (COMPLETED/HIGH from loser).
      expect(survivor!.contactResearch).toHaveLength(1);
      expect(survivor!.contactResearch[0]?.id).toBe(strongResearch.id);
      expect(survivor!.contactResearch[0]?.status).toBe("COMPLETED");
      expect(survivor!.contactResearch[0]?.confidence).toBe("HIGH");
      expect(
        await prisma.contactResearch.findUnique({
          where: { id: weakResearch.id },
        }),
      ).toBeNull();

      // Campaign A + B still attached to survivor; shared campaign de-duped to one row.
      const campaignContactIds = survivor!.campaignContacts.map((cc) => cc.id);
      expect(
        survivor!.campaignContacts.map((cc) => cc.campaignId).sort(),
      ).toEqual([campaignA.id, campaignB.id, campaignShared.id].sort());
      expect(survivor!.campaignContacts).toHaveLength(3);

      const remappedB = await prisma.campaignContact.findUnique({
        where: { id: ccB.id },
      });
      expect(remappedB?.contactId).toBe(older.id);

      // Shared unique: one of the two shared CCs remains for winner.
      const sharedRemaining = await prisma.campaignContact.findMany({
        where: { organizationId: orgId, campaignId: campaignShared.id },
      });
      expect(sharedRemaining).toHaveLength(1);
      expect(sharedRemaining[0]?.contactId).toBe(older.id);

      // Send records intact and resolve through campaignContact → contact.
      const sendIds = [
        sendA.id,
        sendB.id,
        sendSharedOlder.id,
        sendSharedNewer.id,
      ];
      const sends = await prisma.emailSendRecord.findMany({
        where: { id: { in: sendIds } },
        include: {
          campaignContact: { select: { id: true, contactId: true } },
          emailDraft: { select: { id: true } },
        },
      });
      expect(sends).toHaveLength(4);
      for (const send of sends) {
        expect(send.emailDraft.id).toBeTruthy();
        expect(send.campaignContact.contactId).toBe(older.id);
        expect(campaignContactIds).toContain(send.campaignContactId);
      }

      const audit = await prisma.contactMergeAudit.findFirst({
        where: {
          organizationId: orgId,
          winnerContactId: older.id,
          loserContactId: newer.id,
        },
      });
      expect(audit).not.toBeNull();
      expect(audit!.normalizedEmail).toBe(emailPlain.toLowerCase());
      const payload = audit!.mergePayload as {
        loserSnapshot: {
          id: string;
          email: string;
          title: string;
          company: string;
        };
        fieldMerges: Array<{ field: string; kept: string }>;
      };
      expect(payload.loserSnapshot).toMatchObject({
        id: newer.id,
        email: emailPlus,
        title: "VP Sales",
        company: "Beta Co",
      });
      expect(
        payload.fieldMerges.some(
          (m) => m.field === "title" && m.kept === "loser",
        ),
      ).toBe(true);
      expect(
        payload.fieldMerges.some(
          (m) => m.field === "previousTitle" && m.kept === "loser",
        ),
      ).toBe(true);
      expect(
        payload.fieldMerges.some(
          (m) => m.field === "company" && m.kept === "loser",
        ),
      ).toBe(true);

      const postApplyState = {
        survivor: {
          id: survivor!.id,
          email: survivor!.email,
          normalizedEmail: survivor!.normalizedEmail,
          title: survivor!.title,
          previousTitle: survivor!.previousTitle,
          titleChangedAt: survivor!.titleChangedAt?.toISOString() ?? null,
          company: survivor!.company,
          companyId: survivor!.companyId,
          listIds: survivor!.memberships.map((m) => m.contactListId).sort(),
          research: survivor!.contactResearch.map((r) => ({
            id: r.id,
            status: r.status,
            confidence: r.confidence,
            roleSummary: r.roleSummary,
          })),
          campaignIds: survivor!.campaignContacts
            .map((cc) => cc.campaignId)
            .sort(),
        },
        loserDeleted: true,
        sendRecords: sends.map((s) => ({
          id: s.id,
          recipient: s.recipient,
          campaignContactId: s.campaignContactId,
          contactId: s.campaignContact.contactId,
          draftId: s.emailDraft.id,
        })),
        audit: {
          id: audit!.id,
          winnerContactId: audit!.winnerContactId,
          loserContactId: audit!.loserContactId,
          normalizedEmail: audit!.normalizedEmail,
          mergePayload: payload,
        },
        remainingDuplicateGroups: after.duplicateGroupCount,
      };

      console.log(
        "COLLAPSE_POST_APPLY_STATE\n",
        JSON.stringify(postApplyState, null, 2),
      );
    });
  },
);

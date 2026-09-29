/**
 * Account lifecycle B1 — shared full wipe (real Postgres + source seams).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("account wipe source seams", () => {
  it("wipe marks in-flight work FAILED before organization.delete", () => {
    const src = readFileSync(
      resolve("src/lib/account/wipe-organization.ts"),
      "utf8",
    );
    const failIdx = src.indexOf("markInFlightWorkFailedForWipe");
    const deleteIdx = src.indexOf("tx.organization.delete");
    expect(failIdx).toBeGreaterThan(0);
    expect(deleteIdx).toBeGreaterThan(failIdx);
    expect(src).toContain("ACCOUNT_WIPE_IN_FLIGHT_TERMINAL_REASON");
    expect(src).toContain("recordAnonymousAccountWipe");
    expect(src).not.toContain("PLATFORM_ORGANIZATION_DELETED");
  });

  it("orphan purge runs inside the same transaction as organization.delete", () => {
    const src = readFileSync(
      resolve("src/lib/account/wipe-organization.ts"),
      "utf8",
    );
    const txStart = src.indexOf("prisma.$transaction");
    const orgDelete = src.indexOf("tx.organization.delete", txStart);
    const purgeCall = src.indexOf(
      "purgeOrphanedTenantUsersAfterOrgDelete",
      txStart,
    );
    const txEnd = src.indexOf("{ timeout: 120_000 }", txStart);
    expect(txStart).toBeGreaterThan(0);
    expect(orgDelete).toBeGreaterThan(txStart);
    expect(purgeCall).toBeGreaterThan(orgDelete);
    expect(purgeCall).toBeLessThan(txEnd);
    expect(src).toMatch(
      /purgeOrphanedTenantUsersAfterOrgDelete\(\s*memberUserIds,\s*tx/,
    );
    // Must not call orphan purge after the transaction closes.
    const afterTx = src.slice(txEnd);
    expect(afterTx).not.toMatch(
      /purgeOrphanedTenantUsersAfterOrgDelete\s*\(/,
    );
  });

  it("anonymous wipe log shape has only at and reason", () => {
    const src = readFileSync(
      resolve("src/lib/account/wipe-organization.ts"),
      "utf8",
    );
    const typeMatch = src.match(
      /export type AnonymousWipeLogEntry = \{[^}]+\}/,
    );
    expect(typeMatch?.[0]).toMatch(/at: string/);
    expect(typeMatch?.[0]).toMatch(/reason: AccountWipeReason/);
    expect(typeMatch?.[0]).not.toMatch(/organizationId|email|userId|stripe/i);
  });

  it("Super Admin deleteOrganization wires wipe with reason admin and no identifying audit", () => {
    const src = readFileSync(resolve("src/lib/platform/orgs.ts"), "utf8");
    expect(src).toContain("wipeOrganizationAccount");
    expect(src).toContain('reason: "admin"');
    expect(src).not.toContain("PLATFORM_ORGANIZATION_DELETED");
    const action = readFileSync(
      resolve("src/app/actions/platform-orgs.ts"),
      "utf8",
    );
    expect(action).toContain("deleteOrganization");
    expect(action).toContain("requirePlatformSuperAdmin");
  });
});

describe.skipIf(!hasDatabase)(
  "wipeOrganizationAccount (Postgres)",
  { timeout: 120_000 },
  () => {
    let prisma: import("@prisma/client").PrismaClient;
    let ready = false;
    const suffix = `wipe_${Date.now().toString(36)}`;

    beforeAll(async () => {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1 FROM "Organization" LIMIT 0`;
        await prisma.$queryRaw`SELECT 1 FROM "auth_user" LIMIT 0`;
        await prisma.$queryRaw`SELECT "key" FROM "PlatformSetting" LIMIT 0`;
      } catch {
        console.warn(
          "Skipping wipe DB tests: apply pending migrations (npm run db:deploy).",
        );
        return;
      }
      ready = true;
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect();
    });

    async function createAuthUser(email: string, authId: string) {
      await prisma.authUser.create({
        data: {
          id: authId,
          name: "Wipe Test",
          email,
          emailVerified: true,
          firstName: "Wipe",
          lastName: "Test",
        },
      });
      await prisma.authAccount.create({
        data: {
          id: `acct_${authId}`,
          accountId: authId,
          providerId: "credential",
          issuer: "local:credential",
          userId: authId,
          password: "test-hash",
        },
      });
    }

    async function seedFullyUsedAccount(tag: string) {
      const email = `wipe-full-${tag}@example.test`;
      const authId = `auth_wipe_full_${tag}`;
      await createAuthUser(email, authId);

      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "Wipe",
        lastName: "Owner",
        companyName: `Wipe Full ${tag}`,
      });
      const orgId = provisioned.organization!.id;
      const userId = provisioned.user.id;

      const product = await prisma.product.create({
        data: {
          organizationId: orgId,
          name: `Personal Profile ${tag}`,
          profileJson: { headline: "seeker profile", tag },
        },
      });

      await prisma.profileStory.create({
        data: {
          organizationId: orgId,
          productId: product.id,
          situation: "S",
          task: "T",
          action: "A",
          result: "R",
          competencyLinks: [],
          consultationTurnId: `turn_seed_${tag}`,
        },
      });

      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgId,
          ownerUserId: userId,
          name: `App ${tag}`,
          productId: product.id,
        },
      });

      const company = await prisma.company.create({
        data: {
          organizationId: orgId,
          name: `Acme ${tag}`,
          normalizedName: `acme ${tag}`,
          normalizedDomain: `acme-${tag}.example.test`,
        },
      });

      await prisma.companyResearch.create({
        data: {
          organizationId: orgId,
          companyId: company.id,
          status: "COMPLETED",
          companySummary: "Acme summary",
        },
      });

      await prisma.jobRequirement.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          rawText: "Job posting text",
          scorecardJson: { items: [] },
          companyId: company.id,
          companyName: `Acme ${tag}`,
        },
      });

      const persona = await prisma.persona.create({
        data: {
          organizationId: orgId,
          productId: product.id,
          campaignId: campaign.id,
          name: `Hiring Manager ${tag}`,
        },
      });

      const contact = await prisma.contact.create({
        data: {
          organizationId: orgId,
          ownerUserId: userId,
          firstName: "Pat",
          lastName: "Contact",
          email: `pat-${tag}@acme.example.test`,
          normalizedEmail: `pat-${tag}@acme.example.test`,
          companyId: company.id,
        },
      });

      const stage = await prisma.interviewStage.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          sortOrder: 0,
          type: "HIRING_MANAGER",
          scheduledAt: new Date(),
          format: "VIDEO",
        },
      });
      await prisma.interviewStageInterviewer.create({
        data: {
          organizationId: orgId,
          stageId: stage.id,
          contactId: contact.id,
        },
      });
      await prisma.interviewStageGuide.create({
        data: {
          organizationId: orgId,
          stageId: stage.id,
          promptVersion: "test-v1",
          status: "READY",
          contentJson: { sections: [] },
        },
      });

      const session = await prisma.consultationSession.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          productId: product.id,
          promptVersion: "harper-v1",
        },
      });
      const turn = await prisma.consultationTurn.create({
        data: {
          organizationId: orgId,
          sessionId: session.id,
          sequence: 1,
          speaker: "SEEKER",
          body: "My answer",
          seekerAuthored: true,
        },
      });
      await prisma.consultationStatement.create({
        data: {
          organizationId: orgId,
          sessionId: session.id,
          turnId: turn.id,
          kind: "INTERVIEW_ANSWER",
          content: "Polished answer",
          groundingJson: {},
          promptVersion: "stmt-v1",
        },
      });

      await prisma.applicationSummary.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          promptVersion: "summary-v1",
          status: "READY",
          guidanceJson: { tips: ["be clear"] },
        },
      });

      await prisma.applicationAsset.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          type: "RESUME",
          groupKey: "RESUME",
          version: 1,
          contentJson: { bullets: ["led team"] },
          claimTraceJson: {},
          promptVersion: "asset-v1",
        },
      });
      await prisma.applicationAsset.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          type: "COVER_LETTER",
          groupKey: "COVER_LETTER",
          version: 1,
          contentJson: { paragraphs: ["hello"] },
          claimTraceJson: {},
          promptVersion: "asset-v1",
        },
      });
      await prisma.applicationAsset.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          type: "EMAIL",
          groupKey: `EMAIL:${persona.id}:${contact.id}:PROACTIVE`,
          version: 1,
          personaId: persona.id,
          contactId: contact.id,
          purpose: "PROACTIVE",
          contentJson: { body: "outreach" },
          claimTraceJson: {},
          promptVersion: "asset-v1",
        },
      });

      const pendingJob = await prisma.applicationJob.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          type: "RESUME",
          status: "PENDING",
        },
      });
      const runningJob = await prisma.applicationJob.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          type: "CONSULTATION",
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
      });
      const contactList = await prisma.contactList.create({
        data: {
          organizationId: orgId,
          ownerUserId: userId,
          name: `List ${tag}`,
        },
      });
      const pendingRun = await prisma.researchRun.create({
        data: {
          organizationId: orgId,
          contactListId: contactList.id,
          status: "PENDING",
          totalCompanies: 1,
        },
      });
      const runningRun = await prisma.researchRun.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          status: "IN_PROGRESS",
          totalCompanies: 1,
          startedAt: new Date(),
        },
      });

      await prisma.paidCallReceipt.create({
        data: {
          organizationId: orgId,
          operation: "HIRING_TEAM_IDENTIFY",
          subjectKey: campaign.id,
          inputHash: `hash_${tag}`,
          resultJson: { ok: true },
        },
      });

      await prisma.usageEvent.create({
        data: {
          organizationId: orgId,
          userId,
          category: "CONSULTATION",
          operation: "CONSULTATION",
          status: "SUCCESS",
        },
      });

      await prisma.voiceSample.create({
        data: {
          organizationId: orgId,
          userId,
          label: "sample",
          sampleText: "I write like this.",
        },
      });

      const ticket = await prisma.supportTicket.create({
        data: {
          organizationId: orgId,
          submittedByUserId: userId,
          subject: "Help please",
          description: "Something broke",
          sourcePath: "/support",
          organizationName: `Wipe Full ${tag}`,
          submittedByEmail: email,
          submittedByName: "Wipe Owner",
        },
      });
      await prisma.supportTicketNote.create({
        data: {
          supportTicketId: ticket.id,
          authorUserId: userId,
          body: "Looking into it",
        },
      });

      await prisma.transactionalEmailEvent.create({
        data: {
          organizationId: orgId,
          userId,
          templateKey: "WELCOME",
          recipientEmailNormalized: email,
          provider: "test",
          status: "SENT",
          sentAt: new Date(),
        },
      });

      await prisma.adminAuditEvent.create({
        data: {
          action: "USER_SIGNUP",
          actorUserId: userId,
          organizationId: orgId,
          metadata: { email, organizationName: `Wipe Full ${tag}` },
        },
      });

      return {
        orgId,
        userId,
        authId,
        email,
        pendingJobId: pendingJob.id,
        runningJobId: runningJob.id,
        pendingRunId: pendingRun.id,
        runningRunId: runningRun.id,
        ticketId: ticket.id,
        personaId: persona.id,
        campaignId: campaign.id,
      };
    }

    async function assertNoOrgRows(orgId: string) {
      const counts = await Promise.all([
        prisma.organization.count({ where: { id: orgId } }),
        prisma.product.count({ where: { organizationId: orgId } }),
        prisma.profileStory.count({ where: { organizationId: orgId } }),
        prisma.campaign.count({ where: { organizationId: orgId } }),
        prisma.jobRequirement.count({ where: { organizationId: orgId } }),
        prisma.company.count({ where: { organizationId: orgId } }),
        prisma.companyResearch.count({ where: { organizationId: orgId } }),
        prisma.persona.count({ where: { organizationId: orgId } }),
        prisma.contact.count({ where: { organizationId: orgId } }),
        prisma.interviewStage.count({ where: { organizationId: orgId } }),
        prisma.interviewStageGuide.count({ where: { organizationId: orgId } }),
        prisma.consultationSession.count({ where: { organizationId: orgId } }),
        prisma.consultationTurn.count({ where: { organizationId: orgId } }),
        prisma.consultationStatement.count({
          where: { organizationId: orgId },
        }),
        prisma.applicationSummary.count({ where: { organizationId: orgId } }),
        prisma.applicationAsset.count({ where: { organizationId: orgId } }),
        prisma.applicationJob.count({ where: { organizationId: orgId } }),
        prisma.researchRun.count({ where: { organizationId: orgId } }),
        prisma.paidCallReceipt.count({ where: { organizationId: orgId } }),
        prisma.usageEvent.count({ where: { organizationId: orgId } }),
        prisma.voiceSample.count({ where: { organizationId: orgId } }),
        prisma.organizationBillingProfile.count({
          where: { organizationId: orgId },
        }),
        prisma.organizationMembership.count({
          where: { organizationId: orgId },
        }),
      ]);
      expect(counts.every((c) => c === 0)).toBe(true);
    }

    it("full wipe removes org data, leftovers, solo auth; signup recreates empty org", async () => {
      if (!ready) return;
      const {
        wipeOrganizationAccount,
        readAnonymousAccountWipeLog,
      } = await import("@/lib/account/wipe-organization");

      const seeded = await seedFullyUsedAccount(`${suffix}_full`);
      const logBefore = await readAnonymousAccountWipeLog();

      const result = await wipeOrganizationAccount({
        organizationId: seeded.orgId,
        reason: "admin",
      });
      expect(result.alreadyWiped).toBe(false);
      expect(result.purgedUserIds).toContain(seeded.userId);

      await assertNoOrgRows(seeded.orgId);

      expect(
        await prisma.supportTicket.count({
          where: {
            OR: [
              { id: seeded.ticketId },
              { organizationId: seeded.orgId },
              { submittedByUserId: seeded.userId },
              { submittedByEmail: seeded.email },
            ],
          },
        }),
      ).toBe(0);
      expect(
        await prisma.supportTicketNote.count({
          where: { supportTicketId: seeded.ticketId },
        }),
      ).toBe(0);
      expect(
        await prisma.transactionalEmailEvent.count({
          where: {
            OR: [
              { organizationId: seeded.orgId },
              { userId: seeded.userId },
              { recipientEmailNormalized: seeded.email },
            ],
          },
        }),
      ).toBe(0);
      expect(
        await prisma.adminAuditEvent.count({
          where: {
            OR: [
              { organizationId: seeded.orgId },
              { actorUserId: seeded.userId },
              { targetUserId: seeded.userId },
            ],
          },
        }),
      ).toBe(0);

      expect(
        await prisma.user.findUnique({ where: { id: seeded.userId } }),
      ).toBeNull();
      expect(
        await prisma.authUser.findUnique({ where: { id: seeded.authId } }),
      ).toBeNull();
      expect(
        await prisma.authAccount.findFirst({
          where: { userId: seeded.authId },
        }),
      ).toBeNull();

      expect(
        await prisma.applicationJob.count({
          where: { organizationId: seeded.orgId },
        }),
      ).toBe(0);
      expect(
        await prisma.researchRun.count({
          where: { organizationId: seeded.orgId },
        }),
      ).toBe(0);

      const logAfter = await readAnonymousAccountWipeLog();
      expect(logAfter.length).toBe(logBefore.length + 1);
      const entry = logAfter[logAfter.length - 1]!;
      expect(entry.reason).toBe("admin");
      expect(typeof entry.at).toBe("string");
      expect(Number.isNaN(Date.parse(entry.at))).toBe(false);
      expect(Object.keys(entry).sort()).toEqual(["at", "reason"]);
      expect(JSON.stringify(entry)).not.toContain(seeded.orgId);
      expect(JSON.stringify(entry)).not.toContain(seeded.email);
      expect(JSON.stringify(entry)).not.toContain(seeded.userId);
      expect(JSON.stringify(entry)).not.toContain(seeded.authId);

      const newAuthId = `auth_wipe_re_${suffix}_full`;
      await createAuthUser(seeded.email, newAuthId);
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const again = await provisionIndividualWorkspace({
        authUserId: newAuthId,
        email: seeded.email,
        firstName: "Wipe",
        lastName: "Owner",
      });
      expect(again.created).toBe(true);
      expect(again.user.id).not.toBe(seeded.userId);
      expect(again.organization!.id).not.toBe(seeded.orgId);
      expect(
        await prisma.campaign.count({
          where: { organizationId: again.organization!.id },
        }),
      ).toBe(0);
      expect(
        await prisma.product.count({
          where: { organizationId: again.organization!.id },
        }),
      ).toBe(0);
    });

    it("orphan purge failure rolls back the whole wipe; retry completes fully", async () => {
      if (!ready) return;
      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );
      const tag = `${suffix}_rollback`;
      const email = `wipe-rollback-${tag}@example.test`;
      const authId = `auth_wipe_rollback_${tag}`;
      await createAuthUser(email, authId);
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "Roll",
        lastName: "Back",
        companyName: `Rollback ${tag}`,
      });
      const orgId = provisioned.organization!.id;
      const userId = provisioned.user.id;
      const product = await prisma.product.create({
        data: {
          organizationId: orgId,
          name: `Keep on rollback ${tag}`,
          profileJson: { tag },
        },
      });

      // Restrict FK blocks user.delete after org cascade — forces purge failure.
      const recon = await prisma.providerSpendReconciliation.create({
        data: {
          provider: "test",
          periodStart: new Date("2026-01-01T00:00:00.000Z"),
          periodEnd: new Date("2026-01-31T00:00:00.000Z"),
          providerReportedUsd: 1,
          estimatedUsd: 1,
          notes: `wipe-rollback-${tag}`,
          createdByUserId: userId,
        },
      });

      await expect(
        wipeOrganizationAccount({ organizationId: orgId, reason: "admin" }),
      ).rejects.toThrow();

      expect(await prisma.organization.findUnique({ where: { id: orgId } })).toBeTruthy();
      expect(await prisma.product.findUnique({ where: { id: product.id } })).toBeTruthy();
      expect(await prisma.user.findUnique({ where: { id: userId } })).toBeTruthy();
      expect(await prisma.authUser.findUnique({ where: { id: authId } })).toBeTruthy();
      expect(
        await prisma.organizationMembership.count({
          where: { organizationId: orgId, userId },
        }),
      ).toBe(1);

      await prisma.providerSpendReconciliation.delete({
        where: { id: recon.id },
      });

      const retry = await wipeOrganizationAccount({
        organizationId: orgId,
        reason: "admin",
      });
      expect(retry.alreadyWiped).toBe(false);
      expect(retry.purgedUserIds).toContain(userId);
      expect(await prisma.organization.findUnique({ where: { id: orgId } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
      expect(await prisma.authUser.findUnique({ where: { id: authId } })).toBeNull();
      expect(
        await prisma.authAccount.findFirst({ where: { userId: authId } }),
      ).toBeNull();
    });

    it("marks pending and in-progress jobs/runs FAILED before org delete; nothing re-created", async () => {
      if (!ready) return;
      const {
        markInFlightWorkFailedForWipe,
        wipeOrganizationAccount,
        ACCOUNT_WIPE_IN_FLIGHT_TERMINAL_REASON,
      } = await import("@/lib/account/wipe-organization");

      const tag = `${suffix}_inflight`;
      const email = `wipe-inflight-${tag}@example.test`;
      const authId = `auth_wipe_inflight_${tag}`;
      await createAuthUser(email, authId);
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "In",
        lastName: "Flight",
      });
      const orgId = provisioned.organization!.id;
      const product = await prisma.product.create({
        data: { organizationId: orgId, name: `P ${tag}` },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId: orgId,
          ownerUserId: provisioned.user.id,
          name: `C ${tag}`,
          productId: product.id,
        },
      });
      const pendingJob = await prisma.applicationJob.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          type: "RESUME",
          status: "PENDING",
        },
      });
      const runningJob = await prisma.applicationJob.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          type: "CONSULTATION",
          status: "IN_PROGRESS",
        },
      });
      const contactList = await prisma.contactList.create({
        data: {
          organizationId: orgId,
          ownerUserId: provisioned.user.id,
          name: `List ${tag}`,
        },
      });
      const pendingRun = await prisma.researchRun.create({
        data: {
          organizationId: orgId,
          contactListId: contactList.id,
          status: "PENDING",
        },
      });
      const runningRun = await prisma.researchRun.create({
        data: {
          organizationId: orgId,
          campaignId: campaign.id,
          status: "IN_PROGRESS",
        },
      });

      await markInFlightWorkFailedForWipe(orgId);
      expect(await prisma.organization.findUnique({ where: { id: orgId } })).toBeTruthy();
      const jobs = await prisma.applicationJob.findMany({
        where: { id: { in: [pendingJob.id, runningJob.id] } },
      });
      expect(jobs).toHaveLength(2);
      expect(
        jobs.every(
          (j) =>
            j.status === "FAILED" &&
            j.error === ACCOUNT_WIPE_IN_FLIGHT_TERMINAL_REASON,
        ),
      ).toBe(true);
      const runs = await prisma.researchRun.findMany({
        where: { id: { in: [pendingRun.id, runningRun.id] } },
      });
      expect(runs).toHaveLength(2);
      expect(
        runs.every(
          (r) =>
            r.status === "FAILED" &&
            r.lastError === ACCOUNT_WIPE_IN_FLIGHT_TERMINAL_REASON,
        ),
      ).toBe(true);

      await wipeOrganizationAccount({ organizationId: orgId, reason: "admin" });
      expect(await prisma.organization.findUnique({ where: { id: orgId } })).toBeNull();
      expect(
        await prisma.applicationJob.count({ where: { organizationId: orgId } }),
      ).toBe(0);
      expect(
        await prisma.researchRun.count({ where: { organizationId: orgId } }),
      ).toBe(0);
      expect(
        await prisma.applicationJob.findUnique({ where: { id: pendingJob.id } }),
      ).toBeNull();
    });

    it("wiping one org leaves a shared user and other org intact", async () => {
      if (!ready) return;
      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );
      const email = `wipe-two-${suffix}@example.test`;
      const authId = `auth_wipe_two_${suffix}`;
      await createAuthUser(email, authId);

      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const first = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "Two",
        lastName: "Org",
        companyName: `Org A ${suffix}`,
      });
      const orgA = first.organization!.id;
      const userId = first.user.id;

      const orgB = await prisma.organization.create({
        data: {
          name: `[TEST] Org B ${suffix}`,
          slug: `test-wipe-b-${suffix}`,
          status: "ACTIVE",
        },
      });
      await prisma.organizationMembership.create({
        data: {
          organizationId: orgB.id,
          userId,
          role: "MEMBER",
        },
      });
      await prisma.product.create({
        data: {
          organizationId: orgB.id,
          name: `Keep me ${suffix}`,
        },
      });

      await wipeOrganizationAccount({
        organizationId: orgA,
        reason: "admin",
      });

      expect(await prisma.organization.findUnique({ where: { id: orgA } })).toBeNull();
      expect(await prisma.organization.findUnique({ where: { id: orgB.id } })).toBeTruthy();
      expect(await prisma.user.findUnique({ where: { id: userId } })).toBeTruthy();
      expect(await prisma.authUser.findUnique({ where: { id: authId } })).toBeTruthy();
      expect(
        await prisma.organizationMembership.count({
          where: { userId, organizationId: orgB.id },
        }),
      ).toBe(1);
      expect(
        await prisma.product.count({ where: { organizationId: orgB.id } }),
      ).toBe(1);
    });

    it("wipe is idempotent when run twice", async () => {
      if (!ready) return;
      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );
      const tag = `${suffix}_idem`;
      const email = `wipe-idem-${tag}@example.test`;
      const authId = `auth_wipe_idem_${tag}`;
      await createAuthUser(email, authId);
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "Idem",
        lastName: "Wipe",
      });
      const orgId = provisioned.organization!.id;

      const first = await wipeOrganizationAccount({
        organizationId: orgId,
        reason: "self_serve",
      });
      expect(first.alreadyWiped).toBe(false);

      const second = await wipeOrganizationAccount({
        organizationId: orgId,
        reason: "self_serve",
      });
      expect(second.alreadyWiped).toBe(true);
      expect(second.purgedUserIds).toEqual([]);
    });

    it("refuses wipe when Stripe subscription id exists and Stripe is not configured", async () => {
      if (!ready) return;
      const { wipeOrganizationAccount } = await import(
        "@/lib/account/wipe-organization"
      );
      const tag = `${suffix}_stripe`;
      const email = `wipe-stripe-${tag}@example.test`;
      const authId = `auth_wipe_stripe_${tag}`;
      await createAuthUser(email, authId);
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "Stripe",
        lastName: "Gate",
      });
      const orgId = provisioned.organization!.id;
      await prisma.organizationBillingProfile.update({
        where: { organizationId: orgId },
        data: {
          stripeSubscriptionId: `sub_test_${tag}`,
          stripeCustomerId: `cus_test_${tag}`,
          billingStatus: "ACTIVE",
          planCode: "STANDARD",
        },
      });

      const priorKey = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;
      try {
        await expect(
          wipeOrganizationAccount({
            organizationId: orgId,
            reason: "admin",
          }),
        ).rejects.toThrow(/STRIPE_SECRET_KEY is not configured/);
      } finally {
        if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
        else process.env.STRIPE_SECRET_KEY = priorKey;
      }

      expect(await prisma.organization.findUnique({ where: { id: orgId } })).toBeTruthy();
      expect(
        await prisma.user.findUnique({ where: { id: provisioned.user.id } }),
      ).toBeTruthy();
      expect(
        await prisma.organizationBillingProfile.findUnique({
          where: { organizationId: orgId },
        }),
      ).toMatchObject({ stripeSubscriptionId: `sub_test_${tag}` });
    });

    it("deleteOrganization runs shared wipe and writes no identifying audit", async () => {
      if (!ready) return;
      const { deleteOrganization } = await import("@/lib/platform/orgs");
      const tag = `${suffix}_admin`;
      const email = `wipe-admin-${tag}@example.test`;
      const authId = `auth_wipe_admin_${tag}`;
      await createAuthUser(email, authId);
      const { provisionIndividualWorkspace } = await import(
        "@/lib/auth/provision"
      );
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "Admin",
        lastName: "Delete",
        companyName: `Admin Wipe ${tag}`,
      });
      const orgId = provisioned.organization!.id;
      const orgName = provisioned.organization!.name;

      const actor = await prisma.user.create({
        data: {
          email: `actor-${tag}@example.test`,
          emailNormalized: `actor-${tag}@example.test`,
          platformRole: "SUPER_ADMIN",
          name: "Actor",
        },
      });

      await deleteOrganization({
        organizationId: orgId,
        actorUserId: actor.id,
      });

      expect(await prisma.organization.findUnique({ where: { id: orgId } })).toBeNull();
      const audits = await prisma.adminAuditEvent.findMany({
        where: {
          OR: [
            { action: "PLATFORM_ORGANIZATION_DELETED" },
            { organizationId: orgId },
          ],
        },
      });
      expect(audits).toHaveLength(0);
      const actorAudits = await prisma.adminAuditEvent.findMany({
        where: { actorUserId: actor.id },
      });
      for (const row of actorAudits) {
        expect(JSON.stringify(row.metadata ?? {})).not.toContain(orgName);
        expect(JSON.stringify(row.metadata ?? {})).not.toContain(orgId);
      }
    });
  },
);

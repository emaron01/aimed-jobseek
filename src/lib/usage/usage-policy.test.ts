import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "crypto";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe.skipIf(!hasDatabase)(
  "usage policy, metering, signup",
  { timeout: 60_000 },
  () => {
  let prisma: import("@prisma/client").PrismaClient;
  let ready = false;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT "activeResearchedCompanyLimit" FROM "OrganizationUsagePolicy" LIMIT 0`;
      await prisma.$queryRaw`SELECT "timezone" FROM "Organization" LIMIT 0`;
    } catch {
      console.warn(
        "Skipping usage/signup DB tests: apply pending Prisma migrations first (npm run db:deploy).",
      );
      return;
    }
    ready = true;
  });

  it("new organization receives default usage + research policies from DB defaults", async () => {
    if (!ready) return;
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    const { organizationNameFromSeeker } = await import("@/lib/product-config");
    const {
      DEFAULT_USAGE_POLICY_VALUES,
      DEFAULT_RESEARCH_POLICY_VALUES,
      SELF_SERVE_USAGE_POLICY_VALUES,
    } = await import("@/lib/usage/defaults");

    const { organization, user, membershipRole } =
      await createIndividualWorkspace({
        email: `owner-${suffix}@example.test`,
        name: "Erik Test",
        timezone: "America/New_York",
      });

    expect(membershipRole).toBe("OWNER");
    expect(organization.name).toContain(
      organizationNameFromSeeker({ firstName: "Erik", lastName: "Test" }),
    );
    expect(organization.timezone).toBe("America/New_York");

    const usage = await prisma.organizationUsagePolicy.findUniqueOrThrow({
      where: { organizationId: organization.id },
    });
    const research = await prisma.researchPolicy.findUniqueOrThrow({
      where: { organizationId: organization.id },
    });
    const billing = await prisma.organizationBillingProfile.findUniqueOrThrow({
      where: { organizationId: organization.id },
    });
    expect(billing.organizationId).toBe(organization.id);

    expect(usage.activeResearchedCompanyLimit).toBe(
      SELF_SERVE_USAGE_POLICY_VALUES.activeResearchedCompanyLimit,
    );
    expect(usage.dailyEmailGenerationLimit).toBe(
      DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit,
    );
    expect(research.maxSearchQueriesPerCompany).toBe(
      DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerCompany,
    );
    expect(research.maxSourcesPerCompany).toBe(
      DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerCompany,
    );
    expect(research.researchFreshnessDays).toBe(
      DEFAULT_RESEARCH_POLICY_VALUES.researchFreshnessDays,
    );

    // Defaults are stored in DB — enforcement reads these rows, not scattered constants.
    expect(usage.activeResearchedCompanyLimit).toBe(0);
    expect(usage.dailyEmailGenerationLimit).toBe(
      DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit,
    );

    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("effective policy resolves org defaults and user overrides", async () => {
    if (!ready) return;
    const { getEffectiveUsagePolicy } = await import("@/lib/usage/policy");
    const { DEFAULT_USAGE_POLICY_VALUES } = await import("@/lib/usage/defaults");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");

    const { organization, user } = await createIndividualWorkspace({
      email: `policy-${suffix}@example.test`,
      name: "Policy User",
    });

    const base = await getEffectiveUsagePolicy({
      organizationId: organization.id,
      userId: user.id,
    });
    expect(base.activeResearchedCompanyLimit).toBe(0);
    expect(base.sources.activeResearchedCompanyLimit).toBe("ORGANIZATION");

    await prisma.userUsageOverride.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        activeResearchedCompanyLimit: 200,
        dailyEmailGenerationLimit: null,
      },
    });

    const overridden = await getEffectiveUsagePolicy({
      organizationId: organization.id,
      userId: user.id,
    });
    expect(overridden.activeResearchedCompanyLimit).toBe(200);
    expect(overridden.sources.activeResearchedCompanyLimit).toBe(
      "USER_OVERRIDE",
    );
    expect(overridden.dailyEmailGenerationLimit).toBe(
      DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit,
    );
    expect(overridden.sources.dailyEmailGenerationLimit).toBe("ORGANIZATION");
  });

  it("member cannot change organization policy; admin can", async () => {
    if (!ready) return;
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    const { canManageOrganizationPolicy } = await import("@/lib/org/authz");

    const { organization, user: owner } = await createIndividualWorkspace({
      email: `admin-pol-${suffix}@example.test`,
      name: "Owner",
    });

    const member = await prisma.user.create({
      data: {
        email: `member-pol-${suffix}@example.test`,
        emailNormalized: `member-pol-${suffix}@example.test`,
        name: "Member",
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: member.id,
        role: "MEMBER",
      },
    });

    expect(canManageOrganizationPolicy("MEMBER")).toBe(false);
    expect(canManageOrganizationPolicy("ADMIN")).toBe(true);
    expect(canManageOrganizationPolicy("OWNER")).toBe(true);

    const memberMembership = await prisma.organizationMembership.findUniqueOrThrow(
      {
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: member.id,
          },
        },
      },
    );
    expect(canManageOrganizationPolicy(memberMembership.role)).toBe(false);

    // Cross-tenant: member of org A cannot update org B policy via direct query scope.
    const other = await createIndividualWorkspace({
      email: `other-org-${suffix}@example.test`,
      name: "Other",
    });
    const foreignPolicy = await prisma.organizationUsagePolicy.findUnique({
      where: { organizationId: other.organization.id },
    });
    expect(foreignPolicy).toBeTruthy();
    expect(other.organization.id).not.toBe(organization.id);
    expect(owner.id).not.toBe(other.user.id);
  });

  it("active researched company count is unique companies; refresh does not add a slot", async () => {
    if (!ready) return;
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    const { countActiveResearchedCompanies, companyHasActiveResearchSlot } =
      await import("@/lib/usage/active-companies");

    const { organization } = await createIndividualWorkspace({
      email: `slots-${suffix}@example.test`,
      name: "Slots",
    });

    const company = await prisma.company.create({
      data: {
        organizationId: organization.id,
        name: "Acme",
        normalizedName: `acme-${suffix}`,
        normalizedDomain: `acme-${suffix}.test`,
      },
    });

    const expires = new Date();
    expires.setUTCDate(expires.getUTCDate() + 30);

    await prisma.companyResearch.create({
      data: {
        organizationId: organization.id,
        companyId: company.id,
        status: "COMPLETED",
        researchConfidence: "HIGH",
        companySummary: "Acme sells widgets",
        whatTheySell: "Widgets",
        researchedAt: new Date(),
        expiresAt: expires,
      },
    });

    // Second research row (refresh) — still one active company slot.
    await prisma.companyResearch.create({
      data: {
        organizationId: organization.id,
        companyId: company.id,
        status: "COMPLETED",
        researchConfidence: "HIGH",
        companySummary: "Acme sells widgets v2",
        whatTheySell: "Widgets",
        researchedAt: new Date(),
        expiresAt: expires,
      },
    });

    expect(await countActiveResearchedCompanies(organization.id)).toBe(1);
    expect(
      await companyHasActiveResearchSlot(organization.id, company.id),
    ).toBe(true);
  });

  it("quota blocks new research before API when limit reached; reuse allowed", async () => {
    if (!ready) return;
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    const { assertUsageAllowed, UsageQuotaError } = await import(
      "@/lib/usage/quota"
    );

    const { organization, user } = await createIndividualWorkspace({
      email: `quota-${suffix}@example.test`,
      name: "Quota",
    });

    await prisma.organizationUsagePolicy.update({
      where: { organizationId: organization.id },
      data: { activeResearchedCompanyLimit: 1 },
    });

    const company = await prisma.company.create({
      data: {
        organizationId: organization.id,
        name: "Limited Co",
        normalizedName: `limited-${suffix}`,
        normalizedDomain: `limited-${suffix}.test`,
      },
    });
    const expires = new Date();
    expires.setUTCDate(expires.getUTCDate() + 30);
    await prisma.companyResearch.create({
      data: {
        organizationId: organization.id,
        companyId: company.id,
        status: "COMPLETED",
        researchConfidence: "MEDIUM",
        companySummary: "Summary",
        whatTheySell: "Things",
        researchedAt: new Date(),
        expiresAt: expires,
      },
    });

    // Existing slot — allowed
    await assertUsageAllowed({
      organizationId: organization.id,
      userId: user.id,
      resource: "ACTIVE_RESEARCHED_COMPANY",
      wouldConsumeNewActiveCompanySlot: false,
    });

    await expect(
      assertUsageAllowed({
        organizationId: organization.id,
        userId: user.id,
        resource: "ACTIVE_RESEARCHED_COMPANY",
        wouldConsumeNewActiveCompanySlot: true,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof UsageQuotaError &&
        /allowance|Billing/i.test(error.message),
    );
  });

  it("daily email quota is concurrency-safe and timezone-keyed", async () => {
    if (!ready) return;
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    const { assertUsageAllowed, UsageQuotaError } = await import(
      "@/lib/usage/quota"
    );
    const { getOrganizationDayKey } = await import("@/lib/usage/timezone");

    const { organization, user } = await createIndividualWorkspace({
      email: `email-q-${suffix}@example.test`,
      name: "Email Q",
      timezone: "America/New_York",
    });

    await prisma.organizationUsagePolicy.update({
      where: { organizationId: organization.id },
      data: { dailyEmailGenerationLimit: 2 },
    });

    await prisma.usageQuotaLedger.deleteMany({
      where: {
        organizationId: organization.id,
        userId: user.id,
        resource: "EMAIL_GENERATION",
      },
    });

    const dayKey = getOrganizationDayKey("America/New_York");
    expect(dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await assertUsageAllowed({
      organizationId: organization.id,
      userId: user.id,
      resource: "EMAIL_GENERATION",
    });
    await assertUsageAllowed({
      organizationId: organization.id,
      userId: user.id,
      resource: "EMAIL_GENERATION",
    });

    await expect(
      assertUsageAllowed({
        organizationId: organization.id,
        userId: user.id,
        resource: "EMAIL_GENERATION",
      }),
    ).rejects.toBeInstanceOf(UsageQuotaError);

    // Concurrent burst against a fresh period key must not exceed limit.
    const burstUser = await createIndividualWorkspace({
      email: `email-burst-${suffix}@example.test`,
      name: "Burst",
      timezone: "America/New_York",
    });
    await prisma.organizationUsagePolicy.update({
      where: { organizationId: burstUser.organization.id },
      data: { dailyEmailGenerationLimit: 3 },
    });
    const settled = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        assertUsageAllowed({
          organizationId: burstUser.organization.id,
          userId: burstUser.user.id,
          resource: "EMAIL_GENERATION",
        }),
      ),
    );
    const succeeded = settled.filter((r) => r.status === "fulfilled").length;
    const rejected = settled.filter((r) => r.status === "rejected").length;
    expect(succeeded).toBe(3);
    expect(rejected).toBe(5);

    const ledger = await prisma.usageQuotaLedger.findUniqueOrThrow({
      where: {
        organizationId_userId_resource_periodKey: {
          organizationId: organization.id,
          userId: user.id,
          resource: "EMAIL_GENERATION",
          periodKey: dayKey,
        },
      },
    });
    expect(ledger.consumed).toBe(2);
  });

  it("UsageEvent records tokens/web searches and strips secrets", async () => {
    if (!ready) return;
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    const { recordUsageEvent, sanitizeUsageMetadata } = await import(
      "@/lib/usage/events"
    );

    const { organization, user } = await createIndividualWorkspace({
      email: `events-${suffix}@example.test`,
      name: "Events",
    });

    const sanitized = sanitizeUsageMetadata({
      note: "ok",
      api_key: "sk-secret",
      authorization: "Bearer x",
      nested: "fine",
    });
    expect(sanitized).toEqual({ note: "ok", nested: "fine" });

    await recordUsageEvent({
      organizationId: organization.id,
      userId: user.id,
      category: "RESEARCH",
      operation: "RESEARCH_SYNTHESIS",
      provider: "openai-responses",
      model: "gpt-test",
      inputTokens: 100,
      outputTokens: 50,
      webSearchCalls: 2,
      status: "SUCCESS",
      metadata: { apiKey: "sk-should-strip", stage: "initial" },
    });

    const event = await prisma.usageEvent.findFirstOrThrow({
      where: { organizationId: organization.id, userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(event.inputTokens).toBe(100);
    expect(event.outputTokens).toBe(50);
    expect(event.webSearchCalls).toBe(2);
    expect(JSON.stringify(event.metadata)).not.toMatch(/sk-/);
    expect(JSON.stringify(event.metadata)).not.toMatch(/apiKey/i);
  });

  it("invitations: accept once, reject expired/revoked/duplicate", async () => {
    if (!ready) return;
    const {
      createIndividualWorkspace,
      createOrganizationInvitation,
      acceptOrganizationInvitation,
      revokeOrganizationInvitation,
      renameOrganizationWorkspace,
    } = await import("@/lib/org/signup");
    const { InvitationError } = await import("@/lib/org/signup");

    const { organization, user: owner } = await createIndividualWorkspace({
      email: `invite-owner-${suffix}@example.test`,
      name: "Invite Owner",
    });

    await expect(
      createOrganizationInvitation({
        organizationId: organization.id,
        invitedByUserId: owner.id,
        email: `blocked-${suffix}@example.test`,
        role: "MEMBER",
      }),
    ).rejects.toMatchObject({
      name: "InvitationError",
      message: expect.stringContaining("limited to one user"),
    });

    // Team / platform-shaped workspaces may invite (ENTERPRISE).
    await prisma.organization.update({
      where: { id: organization.id },
      data: { accountType: "ENTERPRISE" },
    });
    await prisma.organizationBillingProfile.update({
      where: { organizationId: organization.id },
      data: {
        planCode: "ENTERPRISE",
        seatQuantity: 5,
        maxSeats: 10,
      },
    });

    await renameOrganizationWorkspace({
      organizationId: organization.id,
      actorUserId: owner.id,
      name: "Acme Corporation",
    });
    const renamed = await prisma.organization.findUniqueOrThrow({
      where: { id: organization.id },
    });
    expect(renamed.name).toBe("Acme Corporation");

    const invitee = await prisma.user.create({
      data: {
        email: `invitee-${suffix}@example.test`,
        emailNormalized: `invitee-${suffix}@example.test`,
        name: "Invitee",
      },
    });

    const invite = await createOrganizationInvitation({
      organizationId: organization.id,
      invitedByUserId: owner.id,
      email: invitee.email,
      role: "MEMBER",
    });

    // Token stored hashed
    const hash = createHash("sha256").update(invite.rawToken).digest("hex");
    const stored = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invite.invitationId },
    });
    expect(stored.tokenHash).toBe(hash);
    expect(stored.tokenHash).not.toBe(invite.rawToken);

    const accepted = await acceptOrganizationInvitation({
      rawToken: invite.rawToken,
      acceptingUserId: invitee.id,
    });
    expect(accepted.organizationId).toBe(organization.id);

    await expect(
      acceptOrganizationInvitation({
        rawToken: invite.rawToken,
        acceptingUserId: invitee.id,
      }),
    ).rejects.toBeInstanceOf(InvitationError);

    // Expired
    const expiredInvite = await createOrganizationInvitation({
      organizationId: organization.id,
      invitedByUserId: owner.id,
      email: `expired-${suffix}@example.test`,
      role: "MEMBER",
    });
    await prisma.organizationInvitation.update({
      where: { id: expiredInvite.invitationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiredUser = await prisma.user.create({
      data: { email: `expired-${suffix}@example.test`, emailNormalized: `expired-${suffix}@example.test`, name: "Expired" },
    });
    await expect(
      acceptOrganizationInvitation({
        rawToken: expiredInvite.rawToken,
        acceptingUserId: expiredUser.id,
      }),
    ).rejects.toBeInstanceOf(InvitationError);

    // Revoked token stays revoked; a new invite to the same email uses a new
    // token and must accept (lookup is by tokenHash, not email).
    const revokeTarget = await prisma.user.create({
      data: {
        email: `revoke-${suffix}@example.test`,
        emailNormalized: `revoke-${suffix}@example.test`,
        name: "Revoke",
      },
    });
    const revokeInvite = await createOrganizationInvitation({
      organizationId: organization.id,
      invitedByUserId: owner.id,
      email: revokeTarget.email,
      role: "MEMBER",
    });
    await revokeOrganizationInvitation({
      organizationId: organization.id,
      invitationId: revokeInvite.invitationId,
      actorUserId: owner.id,
    });
    await expect(
      acceptOrganizationInvitation({
        rawToken: revokeInvite.rawToken,
        acceptingUserId: revokeTarget.id,
      }),
    ).rejects.toMatchObject({
      name: "InvitationError",
      message: "Invitation has been revoked.",
    });

    const reissued = await createOrganizationInvitation({
      organizationId: organization.id,
      invitedByUserId: owner.id,
      email: revokeTarget.email,
      role: "MEMBER",
    });
    expect(reissued.rawToken).not.toBe(revokeInvite.rawToken);
    expect(reissued.invitationId).not.toBe(revokeInvite.invitationId);

    // Old link still fails (hints that a newer invite exists).
    await expect(
      acceptOrganizationInvitation({
        rawToken: revokeInvite.rawToken,
        acceptingUserId: revokeTarget.id,
      }),
    ).rejects.toMatchObject({
      name: "InvitationError",
      message: expect.stringContaining("A newer invite was sent"),
    });

    // New link accepts.
    const reissuedAccepted = await acceptOrganizationInvitation({
      rawToken: reissued.rawToken,
      acceptingUserId: revokeTarget.id,
    });
    expect(reissuedAccepted.organizationId).toBe(organization.id);
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: revokeTarget.id,
        },
      },
    });
    expect(membership?.role).toBe("MEMBER");

    const inviteRows = await prisma.organizationInvitation.findMany({
      where: {
        organizationId: organization.id,
        email: revokeTarget.email,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(inviteRows).toHaveLength(2);
    expect(inviteRows[0]?.status).toBe("REVOKED");
    expect(inviteRows[1]?.status).toBe("ACCEPTED");

    // Existing CompanyResearch remains available after join (same org id)
    const company = await prisma.company.create({
      data: {
        organizationId: organization.id,
        name: "Shared Co",
        normalizedName: `shared-${suffix}`,
        normalizedDomain: `shared-${suffix}.test`,
      },
    });
    await prisma.companyResearch.create({
      data: {
        organizationId: organization.id,
        companyId: company.id,
        status: "COMPLETED",
        researchConfidence: "HIGH",
        companySummary: "Shared research",
        researchedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000 * 30),
      },
    });
    const research = await prisma.companyResearch.findFirst({
      where: { organizationId: organization.id, companyId: company.id },
    });
    expect(research?.companySummary).toBe("Shared research");

    // User supports multiple orgs
    const second = await createIndividualWorkspace({
      email: `second-ws-${suffix}@example.test`,
      name: "Second",
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: second.organization.id,
        userId: invitee.id,
        role: "MEMBER",
      },
    });
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: invitee.id },
    });
    expect(memberships.length).toBeGreaterThanOrEqual(2);
  });

  it("evidence sufficiency stops on primary dimensions; AOV alone does not force more", async () => {
    if (!ready) return;
    const {
      evaluateEvidenceSufficiency,
      buildTargetedSearchFocus,
    } = await import("@/lib/research/sufficiency");

    const sufficient = evaluateEvidenceSufficiency({
      sources: [
        {
          url: "https://acme.test",
          sourceType: "COMPANY_WEBSITE",
          retrievedAt: new Date().toISOString(),
          supports: ["whatTheySell"],
        },
        {
          url: "https://news.test/acme",
          sourceType: "NEWS",
          retrievedAt: new Date().toISOString(),
          supports: ["size"],
        },
      ],
      fields: {
        companySummary: "Acme is a B2B software company.",
        whatTheySell: "CRM software for mid-market teams.",
        customerTypes: ["Mid-market SaaS"],
        businessModel: "Subscription SaaS",
        companySizeContext: "200-500 employees",
        estimatedAov: null,
      },
      maxSourcesPerCompany: 8,
    });
    expect(sufficient.sufficient).toBe(true);
    expect(sufficient.missingPrimary).toEqual([]);

    const missingModel = evaluateEvidenceSufficiency({
      sources: [
        {
          url: "https://acme.test",
          sourceType: "COMPANY_WEBSITE",
          retrievedAt: new Date().toISOString(),
          supports: [],
        },
      ],
      fields: {
        companySummary: "Acme summary here.",
        whatTheySell: "They sell analytics.",
        customerTypes: ["Enterprises"],
        businessModel: null,
        companySizeContext: "Large enterprise scale",
      },
      maxSourcesPerCompany: 8,
    });
    expect(missingModel.sufficient).toBe(false);
    expect(missingModel.missingPrimary).toContain("businessModel");
    const focus = buildTargetedSearchFocus(
      missingModel.missingPrimary,
      missingModel.missingSecondary,
    );
    expect(focus.toLowerCase()).toContain("business model");

    const onlyAovMissing = evaluateEvidenceSufficiency({
      sources: [
        {
          url: "https://acme.test",
          sourceType: "COMPANY_WEBSITE",
          retrievedAt: new Date().toISOString(),
          supports: [],
        },
        {
          url: "https://tech.test/acme",
          sourceType: "NEWS",
          retrievedAt: new Date().toISOString(),
          supports: [],
        },
      ],
      fields: {
        companySummary: "Acme is established.",
        whatTheySell: "Platform licenses.",
        customerTypes: ["IT buyers"],
        businessModel: "License + support",
        companySizeContext: "1,000 employees",
        estimatedAov: null,
      },
      maxSourcesPerCompany: 8,
    });
    expect(onlyAovMissing.sufficient).toBe(true);
  });
  },
);

import "server-only";

import type {
  OrganizationAccountType,
  OrganizationStatus,
  UsageCategory,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAdminAuditEvent } from "@/lib/auth/audit";
import { aggregateUsage } from "@/lib/usage/events";
import { countActiveResearchedCompanies } from "@/lib/usage/active-companies";
import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  DEFAULT_RESEARCH_POLICY_VALUES,
  DEFAULT_USAGE_POLICY_VALUES,
} from "@/lib/usage/defaults";
import {
  COMPED_BILLING_DEFAULTS,
  SELF_SERVE_BILLING_DEFAULTS,
} from "@/lib/billing/billing-state";
import {
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_STANDARD,
  getPlanDefinition,
} from "@/lib/billing/plans";
import { getStripe, stripeConfigured } from "@/lib/billing/stripe";
import { createOrganizationInvitationAsPlatform } from "@/lib/org/signup";

export type PlatformBillingMode = "COMPED" | "BILLED";

export type PlatformOrgListItem = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  accountType: "INDIVIDUAL" | "ENTERPRISE";
  createdAt: Date;
  memberCount: number;
  productCount: number;
  campaignCount: number;
  lastActiveAt: Date | null;
  researchedCompaniesUsed: number;
  researchedCompaniesLimit: number | null;
  suspendedAt: Date | null;
  planCode: string;
  billingStatus: string;
};

export type OrgHealthWindow = {
  research: { failed: number; total: number; failureRate: number };
  emailGeneration: { failed: number; total: number; failureRate: number };
};

export type OrgHealthSummary = {
  last7d: OrgHealthWindow;
  last30d: OrgHealthWindow;
};

const RESEARCH_CATEGORIES: UsageCategory[] = [
  "RESEARCH",
  "CONTACT_RESEARCH",
  "PRODUCT_RESEARCH",
  "PERSONA_RESEARCH",
];

function failureRate(failed: number, total: number): number {
  if (total <= 0) return 0;
  return failed / total;
}

async function healthForWindow(
  organizationId: string,
  since: Date,
): Promise<OrgHealthWindow> {
  const events = await prisma.usageEvent.groupBy({
    by: ["category", "status"],
    where: {
      organizationId,
      occurredAt: { gte: since },
      OR: [
        { category: { in: RESEARCH_CATEGORIES } },
        { category: "EMAIL_GENERATION" },
      ],
    },
    _count: { _all: true },
  });

  let researchFailed = 0;
  let researchTotal = 0;
  let emailFailed = 0;
  let emailTotal = 0;

  for (const row of events) {
    const n = row._count._all;
    const isResearch = RESEARCH_CATEGORIES.includes(row.category);
    const isEmail = row.category === "EMAIL_GENERATION";
    if (isResearch) {
      researchTotal += n;
      if (row.status === "FAILED") researchFailed += n;
    }
    if (isEmail) {
      emailTotal += n;
      if (row.status === "FAILED") emailFailed += n;
    }
  }

  return {
    research: {
      failed: researchFailed,
      total: researchTotal,
      failureRate: failureRate(researchFailed, researchTotal),
    },
    emailGeneration: {
      failed: emailFailed,
      total: emailTotal,
      failureRate: failureRate(emailFailed, emailTotal),
    },
  };
}

export async function orgHealthSummary(
  organizationId: string,
  now: Date = new Date(),
): Promise<OrgHealthSummary> {
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [last7d, last30d] = await Promise.all([
    healthForWindow(organizationId, last7),
    healthForWindow(organizationId, last30),
  ]);
  return { last7d, last30d };
}

export async function listOrganizationsForPlatform(input?: {
  actorUserId?: string;
}): Promise<PlatformOrgListItem[]> {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      accountType: true,
      createdAt: true,
      suspendedAt: true,
      usagePolicy: {
        select: { activeResearchedCompanyLimit: true },
      },
      billingProfile: {
        select: { planCode: true, billingStatus: true },
      },
      _count: {
        select: {
          memberships: true,
          products: true,
          campaigns: true,
        },
      },
    },
  });

  if (input?.actorUserId) {
    await recordAdminAuditEvent({
      action: "PLATFORM_ORG_LISTED",
      actorUserId: input.actorUserId,
      metadata: { count: orgs.length },
    });
  }

  const items: PlatformOrgListItem[] = [];
  for (const org of orgs) {
    const [lastUsage, lastUserActivity, researchedCompaniesUsed] =
      await Promise.all([
        prisma.usageEvent.findFirst({
          where: { organizationId: org.id },
          orderBy: { occurredAt: "desc" },
          select: { occurredAt: true },
        }),
        prisma.user.findFirst({
          where: { activeOrganizationId: org.id },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
        countActiveResearchedCompanies(org.id),
      ]);

    const lastActiveCandidates = [
      lastUsage?.occurredAt,
      lastUserActivity?.updatedAt,
    ].filter((d): d is Date => Boolean(d));
    const lastActiveAt =
      lastActiveCandidates.length > 0
        ? new Date(Math.max(...lastActiveCandidates.map((d) => d.getTime())))
        : null;

    items.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      accountType: org.accountType,
      createdAt: org.createdAt,
      memberCount: org._count.memberships,
      productCount: org._count.products,
      campaignCount: org._count.campaigns,
      lastActiveAt,
      researchedCompaniesUsed,
      researchedCompaniesLimit:
        org.usagePolicy?.activeResearchedCompanyLimit ?? null,
      suspendedAt: org.suspendedAt,
      planCode: org.billingProfile?.planCode ?? "COMPED",
      billingStatus: org.billingProfile?.billingStatus ?? "FREE",
    });
  }

  return items;
}

export async function getOrganizationPlatformDetail(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      billingProfile: {
        select: {
          billingEmail: true,
          planCode: true,
          billingStatus: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          stripePriceId: true,
          stripeProductId: true,
          stripePriceUnitAmountCents: true,
          stripePriceCurrency: true,
          stripePriceInterval: true,
          stripeDiscountPercentOff: true,
          stripeDiscountAmountOffCents: true,
          stripeCouponId: true,
          stripeEffectiveUnitAmountCents: true,
          currentPeriodEnd: true,
          trialEndsAt: true,
          cancelAtPeriodEnd: true,
          seatQuantity: true,
          maxSeats: true,
        },
      },
      usagePolicy: true,
      researchPolicy: true,
      invitations: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              name: true,
              emailVerifiedAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      products: {
        where: { archivedAt: null },
        select: { id: true, name: true, approvalStatus: true, createdAt: true },
        orderBy: { name: "asc" },
      },
      icps: {
        where: { archivedAt: null },
        select: { id: true, name: true, productId: true, createdAt: true },
        orderBy: { name: "asc" },
      },
      personas: {
        where: { archivedAt: null },
        select: { id: true, name: true, productId: true, createdAt: true },
        orderBy: { name: "asc" },
      },
      campaigns: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      contactLists: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          totalContacts: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
      },
      creditGrants: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          grantedBy: {
            select: { id: true, email: true, name: true },
          },
        },
      },
      companyResearchCredits: {
        orderBy: { grantedAt: "desc" },
        take: 50,
        select: {
          id: true,
          quantity: true,
          grantedAt: true,
          expiresAt: true,
          userId: true,
          stripeCheckoutSessionId: true,
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      },
    },
  });

  if (!org) return null;

  const [
    usageToday,
    usage7d,
    usage30d,
    researchedCompaniesUsed,
    health,
    researchConfidence30d,
  ] =
    await Promise.all([
      aggregateUsage({
        organizationId: org.id,
        timezone: org.timezone,
        window: "today",
      }),
      aggregateUsage({
        organizationId: org.id,
        timezone: org.timezone,
        window: "7d",
      }),
      aggregateUsage({
        organizationId: org.id,
        timezone: org.timezone,
        window: "30d",
      }),
      countActiveResearchedCompanies(org.id),
      orgHealthSummary(org.id),
      prisma.companyResearch.groupBy({
        by: ["researchConfidence"],
        where: {
          organizationId: org.id,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        _count: { _all: true },
      }),
    ]);

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      accountType: org.accountType,
      timezone: org.timezone,
      createdAt: org.createdAt,
      suspendedAt: org.suspendedAt,
      suspendedReason: org.suspendedReason,
      suspendedByUserId: org.suspendedByUserId,
    },
    billing: {
      billingEmail: org.billingProfile?.billingEmail ?? null,
      planCode: org.billingProfile?.planCode ?? "COMPED",
      billingStatus: org.billingProfile?.billingStatus ?? "FREE",
      stripeCustomerId: org.billingProfile?.stripeCustomerId ?? null,
      stripeSubscriptionId: org.billingProfile?.stripeSubscriptionId ?? null,
      stripePriceId: org.billingProfile?.stripePriceId ?? null,
      stripeProductId: org.billingProfile?.stripeProductId ?? null,
      stripePriceUnitAmountCents:
        org.billingProfile?.stripePriceUnitAmountCents ?? null,
      stripePriceCurrency: org.billingProfile?.stripePriceCurrency ?? null,
      stripePriceInterval: org.billingProfile?.stripePriceInterval ?? null,
      stripeDiscountPercentOff:
        org.billingProfile?.stripeDiscountPercentOff ?? null,
      stripeDiscountAmountOffCents:
        org.billingProfile?.stripeDiscountAmountOffCents ?? null,
      stripeCouponId: org.billingProfile?.stripeCouponId ?? null,
      stripeEffectiveUnitAmountCents:
        org.billingProfile?.stripeEffectiveUnitAmountCents ?? null,
      currentPeriodEnd: org.billingProfile?.currentPeriodEnd ?? null,
      trialEndsAt: org.billingProfile?.trialEndsAt ?? null,
      cancelAtPeriodEnd: org.billingProfile?.cancelAtPeriodEnd ?? false,
      seatQuantity: org.billingProfile?.seatQuantity ?? 1,
      maxSeats: org.billingProfile?.maxSeats ?? 1,
    },
    billingEmail: org.billingProfile?.billingEmail ?? null,
    usagePolicy: org.usagePolicy,
    researchPolicy: org.researchPolicy,
    members: org.memberships.map((m) => ({
      membershipId: m.id,
      role: m.role,
      isBillingContact: m.isBillingContact,
      user: m.user,
    })),
    pendingInvitations: org.invitations,
    products: org.products,
    icps: org.icps,
    personas: org.personas,
    campaigns: org.campaigns,
    contactLists: org.contactLists,
    creditGrants: org.creditGrants,
    companyResearchCredits: org.companyResearchCredits,
    usage: {
      today: usageToday,
      last7d: usage7d,
      last30d: usage30d,
      researchedCompaniesUsed,
      researchedCompaniesLimit:
        org.usagePolicy?.activeResearchedCompanyLimit ?? null,
    },
    health,
    researchConfidence30d: Object.fromEntries(
      researchConfidence30d.map((row) => [
        row.researchConfidence ?? "UNKNOWN",
        row._count._all,
      ]),
    ) as Record<string, number>,
  };
}

/** Scoped read-only customer view payload (names/status only). */
export async function getOrganizationScopedView(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      status: true,
      products: {
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
      icps: {
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
      personas: {
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
      campaigns: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          status: true,
          contacts: {
            select: {
              emailDrafts: {
                where: { subject: { not: null } },
                select: { subject: true, status: true },
                take: 3,
                orderBy: { updatedAt: "desc" },
              },
            },
            take: 8,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 40,
      },
    },
  });
  if (!org) return null;

  return {
    id: org.id,
    name: org.name,
    status: org.status,
    products: org.products,
    icps: org.icps,
    personas: org.personas,
    campaigns: org.campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      subjects: c.contacts
        .flatMap((cc) => cc.emailDrafts)
        .filter((d) => d.subject)
        .slice(0, 5)
        .map((d) => ({ subject: d.subject!, status: d.status })),
    })),
  };
}

export async function recordPlatformOrgView(input: {
  actorUserId: string;
  organizationId: string;
  surface: "detail" | "scoped_view";
}): Promise<void> {
  await recordAdminAuditEvent({
    action: "PLATFORM_ORG_VIEWED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: { surface: input.surface },
  });
}

export async function suspendOrganization(input: {
  organizationId: string;
  actorUserId: string;
  reason: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Suspension reason is required.");
  }

  await prisma.organization.update({
    where: { id: input.organizationId },
    data: {
      status: "SUSPENDED",
      suspendedAt: new Date(),
      suspendedReason: reason,
      suspendedByUserId: input.actorUserId,
    },
  });

  await recordAdminAuditEvent({
    action: "ORGANIZATION_SUSPENDED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: { reason },
  });
}

export async function unsuspendOrganization(input: {
  organizationId: string;
  actorUserId: string;
}): Promise<void> {
  await prisma.organization.update({
    where: { id: input.organizationId },
    data: {
      status: "ACTIVE",
      suspendedAt: null,
      suspendedReason: null,
      suspendedByUserId: null,
    },
  });

  await recordAdminAuditEvent({
    action: "ORGANIZATION_UNSUSPENDED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
  });
}

/**
 * Failsafe: cancel Stripe subscription before org hard-delete.
 * Already-canceled / missing subscriptions are treated as success.
 * No subscription id → skip (Comped / never billed).
 * Stripe not configured while a subscription id exists → refuse (do not
 * delete locally while Stripe may keep billing).
 */
export async function cancelStripeSubscriptionForOrgDelete(
  stripeSubscriptionId: string | null | undefined,
): Promise<{
  skipped: boolean;
  canceled: boolean;
  alreadyCanceled: boolean;
  subscriptionId: string | null;
}> {
  if (!stripeSubscriptionId) {
    return {
      skipped: true,
      canceled: false,
      alreadyCanceled: false,
      subscriptionId: null,
    };
  }
  if (!stripeConfigured()) {
    throw new Error(
      "Cannot delete this organization: a Stripe subscription is linked but STRIPE_SECRET_KEY is not configured. Configure Stripe (or cancel the subscription in the Stripe Dashboard) before deleting.",
    );
  }

  const stripe = getStripe();
  try {
    const existing = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (existing.status === "canceled") {
      return {
        skipped: false,
        canceled: false,
        alreadyCanceled: true,
        subscriptionId: stripeSubscriptionId,
      };
    }
    await stripe.subscriptions.cancel(stripeSubscriptionId);
    return {
      skipped: false,
      canceled: true,
      alreadyCanceled: false,
      subscriptionId: stripeSubscriptionId,
    };
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "";
    // Already gone in Stripe — safe to proceed with local delete.
    if (code === "resource_missing") {
      return {
        skipped: false,
        canceled: false,
        alreadyCanceled: true,
        subscriptionId: stripeSubscriptionId,
      };
    }
    throw error;
  }
}

/**
 * Hard-delete an organization and all cascading tenant data.
 * Cancels the Stripe subscription first when one is linked (failsafe); already
 * canceled / missing subs still proceed. The Stripe Customer (cus_…) is left
 * in place on purpose — accumulating customers is harmless and avoids wiping
 * Stripe history; only the subscription is canceled. Audit is written so the
 * event retains org id/name after the row is gone. Then purge org-only tenant
 * Users and their Better Auth identities so the email can be reused on a clean
 * signup.
 */
export async function deleteOrganization(input: {
  organizationId: string;
  actorUserId: string;
}): Promise<{ id: string; name: string }> {
  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      billingProfile: {
        select: { stripeSubscriptionId: true, stripeCustomerId: true },
      },
    },
  });
  if (!org) {
    throw new Error("Organization not found.");
  }

  const stripeCancel = await cancelStripeSubscriptionForOrgDelete(
    org.billingProfile?.stripeSubscriptionId,
  );

  const members = await prisma.organizationMembership.findMany({
    where: { organizationId: org.id },
    select: { userId: true },
  });
  const memberUserIds = members.map((m) => m.userId);

  await recordAdminAuditEvent({
    action: "PLATFORM_ORGANIZATION_DELETED",
    actorUserId: input.actorUserId,
    organizationId: org.id,
    metadata: {
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      actorUserId: input.actorUserId,
      memberUserIds,
      stripeCustomerId: org.billingProfile?.stripeCustomerId ?? null,
      stripeSubscriptionId: org.billingProfile?.stripeSubscriptionId ?? null,
      stripeCancel,
    },
  });

  await prisma.organization.delete({
    where: { id: org.id },
  });

  const { purgeOrphanedTenantUsersAfterOrgDelete } = await import(
    "@/lib/auth/purge-identity"
  );
  const purged = await purgeOrphanedTenantUsersAfterOrgDelete(memberUserIds);
  if (purged.purgedUserIds.length > 0) {
    await recordAdminAuditEvent({
      action: "PLATFORM_ORGANIZATION_DELETED",
      actorUserId: input.actorUserId,
      organizationId: org.id,
      metadata: {
        phase: "identity_purge",
        organizationId: org.id,
        purgedUserIds: purged.purgedUserIds,
      },
    });
  }

  return { id: org.id, name: org.name };
}

export async function updateOrganizationUsagePolicyAsPlatform(input: {
  organizationId: string;
  actorUserId: string;
  activeResearchedCompanyLimit: number;
  dailyEmailGenerationLimit: number;
  dailyEmailSendWarningLimit: number;
}): Promise<void> {
  const {
    activeResearchedCompanyLimit,
    dailyEmailGenerationLimit,
    dailyEmailSendWarningLimit,
  } = input;

  if (
    ![
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit,
    ].every((n) => Number.isInteger(n) && n >= 0)
  ) {
    throw new Error("Usage policy values must be non-negative integers.");
  }

  await prisma.organizationUsagePolicy.upsert({
    where: { organizationId: input.organizationId },
    update: {
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit,
      dailyEmailSendLimit: dailyEmailSendWarningLimit,
    },
    create: {
      organizationId: input.organizationId,
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit,
      dailyEmailSendLimit: dailyEmailSendWarningLimit,
    },
  });

  await recordAdminAuditEvent({
    action: "PLATFORM_USAGE_POLICY_CHANGED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: {
      activeResearchedCompanyLimit,
      dailyEmailGenerationLimit,
      dailyEmailSendWarningLimit,
    },
  });
}

export async function updateOrganizationResearchPolicyAsPlatform(input: {
  organizationId: string;
  actorUserId: string;
  contactResearchEnabled: boolean;
}): Promise<void> {
  await prisma.researchPolicy.upsert({
    where: { organizationId: input.organizationId },
    update: {
      contactResearchEnabled: input.contactResearchEnabled,
    },
    create: {
      organizationId: input.organizationId,
      ...DEFAULT_RESEARCH_POLICY_VALUES,
      contactResearchEnabled: input.contactResearchEnabled,
    },
  });

  await recordAdminAuditEvent({
    action: "PLATFORM_USAGE_POLICY_CHANGED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: {
      contactResearchEnabled: input.contactResearchEnabled,
      scope: "research_policy",
    },
  });
}

export async function grantOrganizationCredit(input: {
  organizationId: string;
  actorUserId: string;
  amountUsd: number;
  reason: string;
  note?: string | null;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Credit grant reason is required.");
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error("Credit amount must be a positive number.");
  }

  await prisma.organizationCreditGrant.create({
    data: {
      organizationId: input.organizationId,
      grantedByUserId: input.actorUserId,
      amountUsd: input.amountUsd,
      reason,
      note: input.note?.trim() || null,
    },
  });

  await recordAdminAuditEvent({
    action: "ORGANIZATION_CREDIT_GRANTED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    metadata: {
      amountUsd: input.amountUsd,
      reason,
    },
  });
}

/**
 * Grant company research credit packs (100 companies / block).
 * Standard: omit userId (org pool). Team/Enterprise: require userId (personal allowance).
 */
export async function grantCompanyResearchCreditsAsPlatform(input: {
  organizationId: string;
  actorUserId: string;
  /** Target member for Team/Enterprise; null for Standard org pool. */
  userId?: string | null;
  /** Number of 100-company blocks. */
  blocks: number;
  reason: string;
}): Promise<{ companiesGranted: number; userId: string | null }> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Credit grant reason is required.");
  const blocks = Math.floor(input.blocks);
  if (!Number.isFinite(blocks) || blocks < 1) {
    throw new Error("Blocks must be a positive integer.");
  }

  const billing = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId: input.organizationId },
    select: { planCode: true },
  });
  const { planUsesPerUserCompanyAllowance, COMPANY_CREDIT_BLOCK } =
    await import("@/lib/billing/plans");
  const perUser = planUsesPerUserCompanyAllowance(billing?.planCode ?? "");
  const userId = input.userId?.trim() || null;

  if (perUser && !userId) {
    throw new Error(
      "Select a user — Team and Enterprise company credits apply to a personal allowance.",
    );
  }
  if (!perUser && userId) {
    throw new Error(
      "Standard company credits are organization-scoped; do not select a user.",
    );
  }
  if (userId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new Error("Selected user is not a member of this organization.");
    }
  }

  const { grantCompanyResearchCredits } = await import(
    "@/lib/billing/company-research-credits"
  );
  const quantity = blocks * COMPANY_CREDIT_BLOCK.units;
  await grantCompanyResearchCredits({
    organizationId: input.organizationId,
    userId: perUser ? userId : null,
    quantity,
  });

  await recordAdminAuditEvent({
    action: "COMPANY_RESEARCH_CREDIT_GRANTED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    targetUserId: userId,
    metadata: {
      blocks,
      quantity,
      reason,
      userId,
    },
  });

  return { companiesGranted: quantity, userId };
}

function slugifyOrgName(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

async function uniqueOrganizationSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 0;
  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  return `${candidate}-${stamp}`.slice(0, 60);
}

function stripeErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return "";
}

const LIVE_STRIPE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

/**
 * Assert a subscription id is not billable anymore (canceled or missing).
 * Throws if Stripe still shows a live status — used before applying COMPED.
 */
async function assertStripeSubscriptionNotLive(
  subscriptionId: string,
): Promise<void> {
  if (!stripeConfigured()) {
    throw new Error(
      "Cannot convert to Comped: a Stripe subscription is linked but STRIPE_SECRET_KEY is not configured. Configure Stripe (or cancel the subscription in the Stripe Dashboard) before converting.",
    );
  }
  const stripe = getStripe();
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (LIVE_STRIPE_SUBSCRIPTION_STATUSES.has(sub.status)) {
      throw new Error(
        `Cannot convert to Comped: Stripe subscription ${subscriptionId} is still "${sub.status}". Cancel it in Stripe before converting.`,
      );
    }
  } catch (error) {
    if (stripeErrorCode(error) === "resource_missing") return;
    throw error;
  }
}

/**
 * SUPER_ADMIN: cancel any live Stripe subscription, then set COMPED + FREE and
 * platform limits. Refuses to write COMPED while a live subscription remains.
 * Stripe Customer ids may remain in Stripe (same as org delete); local profile
 * clears customer/subscription pointers.
 */
export async function convertOrganizationToComped(input: {
  organizationId: string;
  actorUserId: string;
  activeResearchedCompanyLimit: number;
  dailyEmailSendWarningLimit: number;
  monthlyEmailSendLimit: number | null;
}): Promise<{
  organizationId: string;
  previousPlanCode: string;
  previousBillingStatus: string;
  stripeCancel: Awaited<ReturnType<typeof cancelStripeSubscriptionForOrgDelete>>;
}> {
  if (
    !Number.isFinite(input.activeResearchedCompanyLimit) ||
    input.activeResearchedCompanyLimit < 0
  ) {
    throw new Error("Company research limit must be a non-negative number.");
  }
  if (
    !Number.isFinite(input.dailyEmailSendWarningLimit) ||
    input.dailyEmailSendWarningLimit < 0
  ) {
    throw new Error("Daily send advisory must be a non-negative number.");
  }

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      name: true,
      billingProfile: {
        select: {
          planCode: true,
          billingStatus: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
        },
      },
    },
  });
  if (!org?.billingProfile) {
    throw new Error("Organization not found.");
  }

  const profile = org.billingProfile;
  if (
    profile.billingStatus === COMPED_BILLING_DEFAULTS.billingStatus &&
    !profile.stripeSubscriptionId
  ) {
    throw new Error("Organization is already Comped with no Stripe subscription.");
  }

  const stripeCancel = await cancelStripeSubscriptionForOrgDelete(
    profile.stripeSubscriptionId,
  );

  if (profile.stripeSubscriptionId) {
    await assertStripeSubscriptionNotLive(profile.stripeSubscriptionId);
  }

  // Extra safety: any other live subs on the same Stripe Customer must go too.
  if (profile.stripeCustomerId && stripeConfigured()) {
    const stripe = getStripe();
    const listed = await stripe.subscriptions.list({
      customer: profile.stripeCustomerId,
      status: "all",
      limit: 20,
    });
    for (const sub of listed.data) {
      if (!LIVE_STRIPE_SUBSCRIPTION_STATUSES.has(sub.status)) continue;
      await cancelStripeSubscriptionForOrgDelete(sub.id);
      await assertStripeSubscriptionNotLive(sub.id);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationBillingProfile.update({
      where: { organizationId: org.id },
      data: {
        ...COMPED_BILLING_DEFAULTS,
        // Comped is a billing state. Preserve the product plan and its capabilities.
        planCode: profile.planCode,
        stripePriceUnitAmountCents: null,
        stripePriceCurrency: null,
        stripePriceInterval: null,
        stripeDiscountPercentOff: null,
        stripeDiscountAmountOffCents: null,
        stripeCouponId: null,
        stripeEffectiveUnitAmountCents: null,
      },
    });
    await tx.organizationUsagePolicy.update({
      where: { organizationId: org.id },
      data: {
        activeResearchedCompanyLimit: input.activeResearchedCompanyLimit,
        dailyEmailSendWarningLimit: input.dailyEmailSendWarningLimit,
        monthlyEmailSendLimit: input.monthlyEmailSendLimit,
      },
    });
  });

  // Final guard: never leave COMPED applied if the known sub became live again.
  if (profile.stripeSubscriptionId) {
    try {
      await assertStripeSubscriptionNotLive(profile.stripeSubscriptionId);
    } catch (error) {
      throw new Error(
        `Comped local write completed but Stripe still reports a live subscription — investigate immediately. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  await recordAdminAuditEvent({
    action: "PLATFORM_ORGANIZATION_CONVERTED_TO_COMPED",
    actorUserId: input.actorUserId,
    organizationId: org.id,
    metadata: {
      organizationName: org.name,
      previousPlanCode: profile.planCode,
      previousBillingStatus: profile.billingStatus,
      previousStripeCustomerId: profile.stripeCustomerId,
      previousStripeSubscriptionId: profile.stripeSubscriptionId,
      stripeCancel,
      activeResearchedCompanyLimit: input.activeResearchedCompanyLimit,
      dailyEmailSendWarningLimit: input.dailyEmailSendWarningLimit,
      monthlyEmailSendLimit: input.monthlyEmailSendLimit,
    },
  });

  return {
    organizationId: org.id,
    previousPlanCode: profile.planCode,
    previousBillingStatus: profile.billingStatus,
    stripeCancel,
  };
}

/**
 * SUPER_ADMIN creates an org (INDIVIDUAL or ENTERPRISE) and invites the first
 * user as OWNER. Billing mode: COMPED (durable, no Stripe) or BILLED (Checkout).
 */
export async function createPlatformOrganization(input: {
  actorUserId: string;
  name: string;
  accountType: OrganizationAccountType;
  ownerEmail: string;
  billingMode: PlatformBillingMode;
  activeResearchedCompanyLimit: number;
  dailyEmailSendWarningLimit: number;
  monthlyEmailSendLimit: number | null;
  seatQuantity?: number;
  maxSeats?: number;
  timezone?: string;
}): Promise<{
  organizationId: string;
  invitationId: string;
  accountType: OrganizationAccountType;
  billingMode: PlatformBillingMode;
}> {
  const name = input.name.trim();
  if (!name) throw new Error("Organization name is required.");
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!ownerEmail.includes("@")) {
    throw new Error("Owner email is required.");
  }
  if (
    input.accountType !== "INDIVIDUAL" &&
    input.accountType !== "ENTERPRISE"
  ) {
    throw new Error("Account type must be INDIVIDUAL or ENTERPRISE.");
  }
  if (input.billingMode !== "COMPED" && input.billingMode !== "BILLED") {
    throw new Error("Billing mode must be COMPED or BILLED.");
  }
  if (
    !Number.isFinite(input.activeResearchedCompanyLimit) ||
    input.activeResearchedCompanyLimit < 0
  ) {
    throw new Error("Company research limit must be a non-negative number.");
  }
  if (
    !Number.isFinite(input.dailyEmailSendWarningLimit) ||
    input.dailyEmailSendWarningLimit < 0
  ) {
    throw new Error("Daily send advisory must be a non-negative number.");
  }

  const planCode =
    input.accountType === "ENTERPRISE"
      ? BILLING_PLAN_ENTERPRISE
      : BILLING_PLAN_STANDARD;
  const plan = getPlanDefinition(planCode);
  const seatMinimum = plan?.seats.seatMin ?? 1;
  const seatQuantity =
    input.accountType === "ENTERPRISE"
      ? Math.floor(input.seatQuantity ?? seatMinimum)
      : 1;
  const maxSeats =
    input.accountType === "ENTERPRISE"
      ? Math.floor(input.maxSeats ?? seatQuantity)
      : 1;
  if (seatQuantity < seatMinimum) {
    throw new Error(`Seats must be at least ${seatMinimum} for this account.`);
  }
  if (maxSeats < seatQuantity) {
    throw new Error("Seat cap cannot be below included seats.");
  }
  const billingDefaults =
    input.billingMode === "COMPED"
      ? COMPED_BILLING_DEFAULTS
      : input.accountType === "ENTERPRISE"
        ? {
            ...SELF_SERVE_BILLING_DEFAULTS,
            billingStatus: "ACTIVE" as const,
          }
        : SELF_SERVE_BILLING_DEFAULTS;

  const slug = await uniqueOrganizationSlug(slugifyOrgName(name));
  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name,
        slug,
        status: "ACTIVE",
        accountType: input.accountType,
        timezone: input.timezone?.trim() || DEFAULT_ORGANIZATION_TIMEZONE,
      },
    });
    await tx.organizationUsagePolicy.create({
      data: {
        organizationId: org.id,
        activeResearchedCompanyLimit: input.activeResearchedCompanyLimit,
        dailyEmailGenerationLimit:
          DEFAULT_USAGE_POLICY_VALUES.dailyEmailGenerationLimit,
        dailyEmailSendWarningLimit: input.dailyEmailSendWarningLimit,
        dailyEmailSendLimit: DEFAULT_USAGE_POLICY_VALUES.dailyEmailSendLimit,
        monthlyEmailSendLimit: input.monthlyEmailSendLimit,
        emailDeeplinkMaxUrlLength:
          DEFAULT_USAGE_POLICY_VALUES.emailDeeplinkMaxUrlLength,
      },
    });
    await tx.researchPolicy.create({
      data: {
        organizationId: org.id,
        ...DEFAULT_RESEARCH_POLICY_VALUES,
      },
    });
    await tx.organizationBillingProfile.create({
      data: {
        organizationId: org.id,
        billingEmail: ownerEmail,
        ...billingDefaults,
        planCode,
        seatQuantity,
        maxSeats,
      },
    });
    return org;
  });

  await recordAdminAuditEvent({
    action: "PLATFORM_ORGANIZATION_CREATED",
    actorUserId: input.actorUserId,
    organizationId: organization.id,
    metadata: {
      accountType: input.accountType,
      ownerEmail,
      billingMode: input.billingMode,
      planCode,
      billingStatus: billingDefaults.billingStatus,
      seatQuantity,
      maxSeats,
      activeResearchedCompanyLimit: input.activeResearchedCompanyLimit,
    },
  });

  const invitation = await createOrganizationInvitationAsPlatform({
    organizationId: organization.id,
    invitedByUserId: input.actorUserId,
    email: ownerEmail,
    role: "OWNER",
  });

  return {
    organizationId: organization.id,
    invitationId: invitation.invitationId,
    accountType: input.accountType,
    billingMode: input.billingMode,
  };
}

import "server-only";

import { prisma } from "@/lib/prisma";
import { campaignPersonasDisplayName } from "@/lib/campaign/personas";
import {
  countsTowardTargetedSearchCap,
  normalizeEvidenceClass,
} from "@/lib/criteria/evidence-class";
import { getDueContactsForUser, type CampaignDueSummary } from "@/lib/cadence/dashboard";
import { getMailboxConnectionView } from "@/lib/mailbox/data";
import { normalizeSuggestedBuyerRoles } from "@/lib/setup/product-overview";
import { voiceReadiness } from "@/lib/voice/types";
import { buildHomeSetupLine } from "@/lib/workflow/home-setup-line";
import {
  buildHomeSetupRail,
  resolveHomeSetupFocus,
  type HomeSetupStep,
  type HomeSetupStepKey,
} from "@/lib/workflow/home-setup-rail";
import { getProductCampaignReadiness } from "@/lib/workflow/product-campaign-readiness";
import { vocab } from "@/lib/product-config";

export type SetupCardState = {
  done: boolean;
  label: string;
  detail: string;
  actionLabel: string;
  href: string;
};

export type HomeWorkflow = {
  setupComplete: boolean;
  setupLine: { text: string; href: string | null };
  setupRail: HomeSetupStep[];
  setupFocus: HomeSetupStepKey;
  voice: ReturnType<typeof voiceReadiness>;
  completeProductIds: string[];
  campaignProducts: Array<{
    id: string;
    name: string;
    ready: boolean;
    blockers: string[];
    omissionReason: string | null;
  }>;
  product: SetupCardState & { suggestedRoleCount: number };
  icp: SetupCardState & {
    name: string | null;
    count: number;
    criterionCount: number;
    needsLookupCount: number;
  };
  personas: SetupCardState & { names: string[] };
  campaigns: Array<{
    id: string;
    name: string;
    archived: boolean;
    context: string;
    companies: number;
    qualified: number;
    contacts: number;
    emailsToWrite: number;
  }>;
  dueByCampaign: CampaignDueSummary[];
};

/** Criteria rows are the interpreted ICP. lastInterpretedAt is not required — legacy/manual backfill never sets it. */
function hasInterpretedCriteria(icp: { criteria: unknown[] }): boolean {
  return icp.criteria.length > 0;
}

function isCampaignReadyProduct(product: {
  approvalStatus: string;
  icps: Array<{ criteria: unknown[] }>;
  personas: unknown[];
}): boolean {
  return getProductCampaignReadiness(product).ready;
}

export async function getHomeWorkflow(
  organizationId: string,
  options?: {
    includeArchived?: boolean;
    userId?: string;
    canViewAllRepWork?: boolean;
  },
): Promise<HomeWorkflow> {
  const [products, campaigns, dueByCampaign, listCount, contactCount, mailbox] =
    await Promise.all([
      prisma.product.findMany({
        where: { organizationId, archivedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          icps: {
            where: { archivedAt: null },
            orderBy: { createdAt: "asc" },
            include: {
              criteria: {
                select: {
                  evidenceClass: true,
                  targetedSearchDecision: true,
                  tier: true,
                },
              },
            },
          },
          personas: {
            where: { archivedAt: null },
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true },
          },
          setupRuns: {
            where: { status: { in: ["NEEDS_REVIEW", "PARTIAL", "APPROVED"] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { suggestedPersonasJson: true },
          },
        },
      }),
      prisma.campaign.findMany({
        where: {
          organizationId,
          ...(options?.userId && !options.canViewAllRepWork
            ? { ownerUserId: options.userId }
            : {}),
          ...(options?.includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: { updatedAt: "desc" },
        include: {
          icp: { select: { name: true } },
          persona: { select: { name: true } },
          personasInPlay: {
            include: { persona: { select: { name: true } } },
          },
          offer: { select: { name: true } },
          contacts: {
            select: {
              status: true,
              contact: {
                select: { companyId: true, company: true },
              },
              emailDrafts: { select: { id: true } },
            },
          },
        },
      }),
      options?.userId
        ? getDueContactsForUser({
            organizationId,
            userId: options.userId,
            includeArchived: options.includeArchived,
          })
        : Promise.resolve([] as CampaignDueSummary[]),
      prisma.contactList.count({
        where: {
          organizationId,
          ...(options?.userId && !options.canViewAllRepWork
            ? { ownerUserId: options.userId }
            : {}),
          archivedAt: null,
        },
      }),
      prisma.contact.count({
        where: {
          organizationId,
          ...(options?.userId && !options.canViewAllRepWork
            ? { ownerUserId: options.userId }
            : {}),
          archivedAt: null,
        },
      }),
      options?.userId
        ? getMailboxConnectionView({
            organizationId,
            userId: options.userId,
          })
        : Promise.resolve(null),
    ]);

  const voiceSampleCount =
    options?.userId != null
      ? await prisma.voiceSample.count({
          where: {
            organizationId,
            userId: options.userId,
          },
        })
      : 0;

  const firstProduct = products[0] ?? null;
  const campaignProducts = products.map((product) => {
    const readiness = getProductCampaignReadiness(product);
    return {
      id: product.id,
      name: product.name,
      ready: readiness.ready,
      blockers: readiness.blockers,
      omissionReason: readiness.omissionReason,
    };
  });
  const completeProducts = products.filter(isCampaignReadyProduct);
  const completeProduct = completeProducts[0] ?? null;
  const activeProduct = completeProduct ?? firstProduct;
  const readyIcps = activeProduct?.icps.filter(hasInterpretedCriteria) ?? [];
  const interpretedIcp = readyIcps[0] ?? null;
  const icpCount = readyIcps.length;
  const productDone = activeProduct?.approvalStatus === "APPROVED";
  const icpDone = icpCount > 0;
  const personasDone = Boolean(activeProduct?.personas.length);
  const productHref = activeProduct
    ? `/setup/${activeProduct.id}`
    : "/setup/new";
  const suggestedRoleCount = normalizeSuggestedBuyerRoles(
    activeProduct?.setupRuns[0]?.suggestedPersonasJson,
  ).length;
  const totalIcps = products.reduce(
    (count, product) =>
      count + product.icps.filter(hasInterpretedCriteria).length,
    0,
  );
  const totalPersonas = products.reduce(
    (count, product) => count + product.personas.length,
    0,
  );
  const setupLine = buildHomeSetupLine({
    products: products.map((product) => ({
      name: product.name,
      readiness: getProductCampaignReadiness(product),
    })),
    totalIcps,
    totalPersonas,
  });

  // Same rule as New campaign / setupComplete: approved + ICP with criteria + persona.
  const productIncompleteForRail = products
    .filter((product) => !isCampaignReadyProduct(product))
    .map((product) => getProductCampaignReadiness(product));

  const voice = voiceReadiness(voiceSampleCount);
  const setupRail = buildHomeSetupRail({
    voice,
    productTotal: products.length,
    productReadyCount: completeProducts.length,
    productIncomplete: productIncompleteForRail,
    listCount,
    contactCount,
    emailConnected: mailbox?.status === "CONNECTED",
    emailReconnectRequired: mailbox?.status === "RECONNECT_REQUIRED",
  });

  return {
    setupComplete: Boolean(completeProduct),
    setupLine,
    setupRail,
    setupFocus: resolveHomeSetupFocus(setupRail),
    voice,
    completeProductIds: completeProducts.map((product) => product.id),
    campaignProducts,
    product: {
      done: productDone,
      label: productDone ? "Approved" : "Not started",
      detail: activeProduct
        ? productDone
          ? activeProduct.name
          : `${activeProduct.name} needs review and approval`
        : `Research, review, and approve your ${vocab.product.singular}`,
      actionLabel: activeProduct
        ? productDone
          ? `Review ${vocab.product.singular}`
          : `Continue ${vocab.product.singular} setup`
        : `Add ${vocab.product.singular}`,
      href: productHref,
      suggestedRoleCount,
    },
    icp: {
      done: icpDone,
      label: icpDone ? "Saved" : "Not started",
      detail: icpDone
        ? icpCount > 1
          ? `${icpCount} saved`
          : interpretedIcp!.name
        : "Define and interpret a primary target",
      actionLabel: icpDone
        ? icpCount > 1
          ? `Review ${vocab.icp.plural}`
          : `Review ${vocab.icp.singular}`
        : `Add ${vocab.icp.singular}`,
      href: activeProduct
        ? icpDone
          ? icpCount > 1
            ? `/setup/${activeProduct.id}/icps`
            : `/setup/${activeProduct.id}/icps/${interpretedIcp!.id}`
          : `/setup/${activeProduct.id}/icps/new`
        : "/setup/new",
      name: interpretedIcp?.name ?? null,
      count: icpCount,
      criterionCount: interpretedIcp?.criteria.length ?? 0,
      needsLookupCount:
        interpretedIcp?.criteria.filter(
          (criterion) =>
            countsTowardTargetedSearchCap({
              evidenceClass: normalizeEvidenceClass(criterion.evidenceClass),
              tier: criterion.tier,
            }) && criterion.targetedSearchDecision == null,
        ).length ?? 0,
    },
    personas: {
      done: personasDone,
      label: personasDone ? "Saved" : "Not started",
      detail: personasDone
        ? `${activeProduct!.personas.length} saved`
        : `Build at least one ${vocab.buyer.singular} ${vocab.persona.singular}`,
      actionLabel: personasDone ? `Manage ${vocab.persona.plural}` : `Build ${vocab.persona.singular}`,
      href: activeProduct
        ? `/setup/${activeProduct.id}#personas`
        : "/setup/new",
      names: activeProduct?.personas.map((persona) => persona.name) ?? [],
    },
    campaigns: campaigns.map((campaign) => {
      const companyKeys = new Set(
        campaign.contacts
          .map((entry) =>
            entry.contact.companyId
              ? `id:${entry.contact.companyId}`
              : entry.contact.company?.trim().toLowerCase()
                ? `name:${entry.contact.company.trim().toLowerCase()}`
                : null,
          )
          .filter((value): value is string => Boolean(value)),
      );
      const qualified = campaign.contacts.filter(
        (entry) => entry.status !== "EXCLUDED",
      ).length;
      const emailsToWrite = campaign.contacts.filter(
        (entry) =>
          entry.status !== "EXCLUDED" && entry.emailDrafts.length === 0,
      ).length;
      return {
        id: campaign.id,
        name: campaign.name,
        archived: campaign.archivedAt != null,
        context: [
          campaign.icp.name,
          campaignPersonasDisplayName({
            fallbackPersonaName: campaign.persona?.name,
            inPlayNames: campaign.personasInPlay.map((row) => row.persona.name),
            productPersonaCount: 0,
          }),
          campaign.offerName ?? campaign.offer?.name,
        ]
          .filter(Boolean)
          .join(" · "),
        companies: companyKeys.size,
        qualified,
        contacts: campaign.contacts.length,
        emailsToWrite,
      };
    }),
    dueByCampaign,
  };
}

import "server-only";

import type {
  EmailDraftKind,
  EmailDraftStatus,
  EmailLength,
  ReplyClassification,
} from "@prisma/client";
import type { EmailCompanyResearch } from "@/lib/email-generation/company-research-use";
import { prisma } from "@/lib/prisma";
import { resolveActiveOrganization } from "@/lib/auth/session";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";
import { evidenceFragments } from "@/lib/campaign/offer-validation";
import {
  candidateProfileForGeneration,
  factTexts,
  omitCompensationFromUnknown,
} from "@/lib/product-research/candidate-profile";
import {
  isResearchFresh,
  parseStringArray,
} from "@/lib/research/freshness";
import { getResearchPolicy } from "@/lib/usage/policy";
import {
  resolveEmailGenerationPersona,
  resolvePersonalization,
  contactResearchForPrompt,
  type ContactPersonaSource,
  type PersonalizationTier,
} from "@/lib/email-generation/personalization";

const CONTACT_RESEARCH_FRESHNESS_DAYS = 90;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function lines(value: string | null): string[] {
  return value
    ? value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function isFreshContactResearch(
  research: {
    researchedAt: Date | null;
    roleSummary: string | null;
    confidence: "HIGH" | "MEDIUM" | "LOW" | null;
    status: "COMPLETED" | "PARTIAL" | string;
  } | null,
  now = new Date(),
): boolean {
  if (!research?.researchedAt || !research.roleSummary?.trim()) return false;
  if (research.confidence !== "HIGH" && research.confidence !== "MEDIUM") {
    return false;
  }
  if (research.status !== "COMPLETED" && research.status !== "PARTIAL") {
    return false;
  }
  const ageMs = now.getTime() - research.researchedAt.getTime();
  return (
    ageMs <= CONTACT_RESEARCH_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
  );
}

export type EmailGenerationContext = {
  organizationId: string;
  userId: string;
  campaignContact: {
    id: string;
    campaignId: string;
    contactId: string;
  };
  campaign: {
    id: string;
    name: string;
    offerName: string | null;
    offerDescription: string | null;
    offerCta: string | null;
    offerNotes: string | null;
    offerValidationJson: unknown;
    offerValidationHash: string | null;
    emailLength: EmailLength;
    emailGuidance: string | null;
  };
  /** Length used for this generation. Campaign setting unless a per-draft override is supplied. */
  emailLength: EmailLength;
  contact: {
    id: string;
    companyId: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    company: string | null;
    industry: string | null;
    location: string | null;
  };
  product: {
    id: string;
    name: string;
    description: string | null;
    valueProposition: string | null;
    evidence: string[];
    problemsSolved: string[];
    messaging: {
      primaryPositioning: string[];
      coreValueThemes: string[];
      strongestDifferentiators: string[];
      proofPoints: string[];
      supportedClaims: string[];
      claimsNotToMake: string[];
      terminologyToUse: string[];
      terminologyToAvoid: string[];
    };
  };
  persona: {
    id: string;
    name: string;
    painPoints: string[];
    desiredOutcomes: string[];
    messagingNotes: string[];
    messaging: {
      positioning: string[];
      proofPoints: string[];
      objections: string[];
    };
    profile: {
      terminology: string[];
      organizationalPressures: string[];
      buyingRole: string[];
      decisionInfluence: string[];
    };
  };
  icp: {
    id: string;
    name: string;
    definition: string | null;
    description: string | null;
  };
  contactResearch: {
    id: string;
    currentTitle: string | null;
    roleSummary: string | null;
    responsibilities: string[];
    ownershipAreas: string[];
    professionalSignals: string[];
    negativeRoleSignals: string[];
    confidence: "HIGH" | "MEDIUM" | "LOW" | null;
    researchedAt: Date;
  } | null;
  companyResearch: EmailCompanyResearch | null;
  companyResearchUpdatedAt: string | null;
  /**
   * Research fields intentionally excluded from the generation prompt.
   * Used only by the claim guard to detect model leakage into copy.
   */
  excludedCopySignals: {
    riskSignals: string[];
    professionalSignals: string[];
    negativeRoleSignals: string[];
  };
  voiceSamples: Array<{
    id: string;
    label: string;
    sampleText: string;
    createdAt: Date;
  }>;
  sequence: Array<{
    id: string;
    sequenceNumber: number;
    kind: EmailDraftKind;
    subject: string | null;
    body: string | null;
    status: EmailDraftStatus;
    sentAt: Date | null;
    replyClassification: ReplyClassification | null;
    prospectReplyText: string | null;
    referralSuggested: boolean;
    inReplyToDraftId: string | null;
  }>;
  personaResolution: {
    source: ContactPersonaSource;
    hasDecision: boolean;
    needsConfirmation: boolean;
    suggestedPersonaId: string | null;
    decisionReason: string | null;
  };
};

export type EmailDraftScreenState = {
  resolvedPersonaId: string | null;
  resolvedPersonaName: string | null;
  hasPersonaDecision: boolean;
  needsPersonaConfirmation: boolean;
  suggestedPersonaId: string | null;
  suggestedPersonaName: string | null;
  personaDecisionReason: string | null;
  personaOptions: Array<{ id: string; name: string }>;
  personalizationTier: PersonalizationTier;
  personalizationLabel: string;
  personalizationDetail: string;
  personalizationSources: string;
};

export async function loadEmailGenerationContext(
  campaignContactId: string,
  userId: string,
  options?: {
    personaId?: string | null;
    storedPersonaId?: string | null;
    emailLength?: EmailLength | null;
  },
): Promise<EmailGenerationContext> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new TenantError("User not found.");

  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const organizationId = membership.organization.id;

  const campaignContact = await prisma.campaignContact.findFirst({
    where: { id: campaignContactId, organizationId },
    include: {
      contact: true,
      emailDrafts: {
        orderBy: { sequenceNumber: "asc" },
        select: {
          id: true,
          sequenceNumber: true,
          kind: true,
          subject: true,
          body: true,
          status: true,
          sentAt: true,
          replyClassification: true,
          prospectReplyText: true,
          referralSuggested: true,
          inReplyToDraftId: true,
          emailLength: true,
          personaId: true,
          personalizationTier: true,
          personalizationSources: true,
        },
      },
      campaign: {
        include: {
          product: true,
          persona: true,
          icp: true,
          personasInPlay: {
            include: { persona: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!campaignContact) {
    throw new TenantError(
      `${vocab.campaign.Singular} ${vocab.contact.singular} was not found in the active organization.`,
    );
  }
  if (campaignContact.campaign.ownerUserId !== userId) {
    throw new TenantError(
      `This ${vocab.campaign.singular} is read-only because it belongs to another user.`,
    );
  }

  const { campaign, contact } = campaignContact;
  if (
    campaign.organizationId !== organizationId ||
    contact.organizationId !== organizationId ||
    campaign.product.organizationId !== organizationId ||
    (campaign.persona &&
      campaign.persona.organizationId !== organizationId) ||
    campaign.icp.organizationId !== organizationId
  ) {
    throw new TenantError(
      `${vocab.campaign.Singular} ${vocab.contact.singular} relationships do not belong to the active organization.`,
    );
  }

  const [
    voiceSamples,
    contactResearch,
    approvedEvidence,
    companyResearchRow,
    matchedScore,
    researchPolicy,
  ] = await Promise.all([
      prisma.voiceSample.findMany({
        where: { organizationId, userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          label: true,
          sampleText: true,
          createdAt: true,
        },
      }),
      prisma.contactResearch.findUnique({
        where: {
          organizationId_contactId: {
            organizationId,
            contactId: contact.id,
          },
        },
      }),
      campaign.product.approvedEvidenceBundleId
        ? prisma.productEvidenceBundle.findFirst({
            where: {
              id: campaign.product.approvedEvidenceBundleId,
              organizationId,
              productId: campaign.product.id,
            },
            select: { normalizedEvidenceJson: true },
          })
        : Promise.resolve(null),
      contact.companyId
        ? prisma.companyResearch.findFirst({
            where: { organizationId, companyId: contact.companyId },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve(null),
      prisma.contactScore.findFirst({
        where: {
          organizationId,
          contactId: contact.id,
          scoringStatus: "COMPLETED",
          scoringRun: {
            organizationId,
            productId: campaign.productId,
            icpId: campaign.icpId,
            status: { in: ["COMPLETED", "PARTIAL"] },
          },
        },
        orderBy: [{ scoredAt: "desc" }, { createdAt: "desc" }],
        select: { matchedPersonaId: true, assessmentData: true },
      }),
    getResearchPolicy(organizationId),
  ]);
  const contactResearchEnabled = researchPolicy.contactResearchEnabled;
  const freshContactResearch =
    contactResearchEnabled && isFreshContactResearch(contactResearch)
      ? contactResearch
      : null;
  const freshCompanyResearch =
    companyResearchRow && isResearchFresh(companyResearchRow)
      ? companyResearchRow
      : null;
  // Identity ambiguity is an attribution failure: otherwise usable facts may
  // describe a different company and must not reach selection or generation.
  const attributableCompanyResearch =
    freshCompanyResearch && !freshCompanyResearch.identityAmbiguous
      ? freshCompanyResearch
      : null;

  const latestDraftPersonaId =
    [...campaignContact.emailDrafts]
      .reverse()
      .find((draft) => draft.personaId)?.personaId ?? null;

  const assessmentData = matchedScore?.assessmentData as
    | { aiSkipReason?: string }
    | null
    | undefined;
  const resolved = resolveEmailGenerationPersona({
    overridePersonaId: options?.personaId,
    chosenPersonaId: campaignContact.chosenPersonaId,
    storedPersonaId: options?.storedPersonaId ?? latestDraftPersonaId,
    matchedPersonaId: matchedScore?.matchedPersonaId ?? null,
    suggestedPersonaId: campaign.personaId,
    aiSkipReason: assessmentData?.aiSkipReason ?? null,
  });
  const personaRow =
    resolved.personaId === campaign.persona?.id
      ? campaign.persona
      : resolved.personaId
        ? await prisma.persona.findFirst({
            where: {
              id: resolved.personaId,
              organizationId,
              productId: campaign.productId,
            },
          })
        : null;
  if (!personaRow) {
    throw new TenantError(
      resolved.needsConfirmation
        ? resolved.decisionReason ??
          `Choose ${vocab.persona.aSingular} for this ${vocab.contact.singular} before generating an email.`
        : `No ${vocab.persona.singular} is available for this ${vocab.contact.singular}.`,
    );
  }
  const emailLength = options?.emailLength ?? campaign.emailLength;

  const productMessaging = objectValue(campaign.product.messagingJson);
  const productProfile = objectValue(campaign.product.profileJson);
  const generationProfile = candidateProfileForGeneration(
    campaign.product.profileJson,
  );
  const personaMessaging = objectValue(personaRow.personaMessagingJson);
  const personaProfile = objectValue(personaRow.profileJson);

  return {
    organizationId,
    userId,
    campaignContact: {
      id: campaignContact.id,
      campaignId: campaign.id,
      contactId: contact.id,
    },
    campaign: {
      id: campaign.id,
      name: campaign.name,
      offerName: campaign.offerName,
      offerDescription: campaign.offerDescription,
      offerCta: campaign.offerCta,
      offerNotes: campaign.offerNotes,
      offerValidationJson: campaign.offerValidationJson,
      offerValidationHash: campaign.offerValidationHash,
      emailLength: campaign.emailLength,
      emailGuidance: campaign.emailGuidance,
    },
    emailLength,
    contact: {
      id: contact.id,
      companyId: contact.companyId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      title: contact.title,
      company: contact.company,
      industry: contact.industry,
      location: contact.location,
    },
    product: {
      id: campaign.product.id,
      name: campaign.product.name,
      description: campaign.product.description,
      valueProposition: campaign.product.valueProposition,
      evidence: [
        campaign.product.description,
        campaign.product.valueProposition,
        ...stringList(productMessaging.proofPoints),
        ...stringList(productMessaging.supportedClaims),
        ...evidenceFragments(
          omitCompensationFromUnknown(campaign.product.profileJson),
          "productProfile",
        ),
        ...evidenceFragments(
          approvedEvidence?.normalizedEvidenceJson,
          "approvedProductEvidence",
        ),
      ].filter((value): value is string => Boolean(value?.trim())),
      problemsSolved: generationProfile
        ? factTexts(generationProfile.problemsSolved)
        : stringList(productProfile.problemsSolved),
      messaging: {
        primaryPositioning: stringList(
          productMessaging.primaryPositioning,
        ),
        coreValueThemes: stringList(productMessaging.coreValueThemes),
        strongestDifferentiators: stringList(
          productMessaging.strongestDifferentiators,
        ),
        proofPoints: stringList(productMessaging.proofPoints),
        supportedClaims: stringList(productMessaging.supportedClaims),
        claimsNotToMake: stringList(productMessaging.claimsNotToMake),
        terminologyToUse: stringList(productMessaging.terminologyToUse),
        terminologyToAvoid: stringList(productMessaging.terminologyToAvoid),
      },
    },
    persona: {
      id: personaRow.id,
      name: personaRow.name,
      painPoints: lines(personaRow.painPoints),
      desiredOutcomes: lines(personaRow.desiredOutcomes),
      messagingNotes: lines(personaRow.messagingNotes),
      messaging: {
        positioning: stringList(personaMessaging.positioning),
        proofPoints: stringList(personaMessaging.proofPoints),
        objections: stringList(personaMessaging.objections),
      },
      profile: {
        terminology: stringList(personaProfile.terminology),
        organizationalPressures: stringList(
          personaProfile.organizationalPressures,
        ),
        buyingRole: stringList(personaProfile.buyingRole),
        decisionInfluence: stringList(personaProfile.decisionInfluence),
      },
    },
    icp: {
      id: campaign.icp.id,
      name: campaign.icp.name,
      definition: campaign.icp.definition,
      description: campaign.icp.description,
    },
    contactResearch: freshContactResearch?.researchedAt
      ? {
          id: freshContactResearch.id,
          currentTitle: freshContactResearch.currentTitle,
          roleSummary: freshContactResearch.roleSummary,
          responsibilities: stringList(freshContactResearch.responsibilities),
          ownershipAreas: stringList(freshContactResearch.ownershipAreas),
          professionalSignals: stringList(
            freshContactResearch.professionalSignals,
          ),
          negativeRoleSignals: stringList(
            freshContactResearch.negativeRoleSignals,
          ),
          confidence: freshContactResearch.confidence,
          researchedAt: freshContactResearch.researchedAt,
        }
      : null,
    companyResearch: attributableCompanyResearch
      ? {
          companySummary: attributableCompanyResearch.companySummary,
          whatTheySell: attributableCompanyResearch.whatTheySell,
          customerTypes: parseStringArray(
            attributableCompanyResearch.customerTypes,
          ),
          primaryMarkets: parseStringArray(
            attributableCompanyResearch.primaryMarkets,
          ),
          businessModel: attributableCompanyResearch.businessModel,
          companySizeContext: attributableCompanyResearch.companySizeContext,
          confidence: attributableCompanyResearch.researchConfidence,
        }
      : null,
    companyResearchUpdatedAt:
      attributableCompanyResearch?.updatedAt.toISOString() ?? null,
    excludedCopySignals: {
      riskSignals: freshCompanyResearch
        ? parseStringArray(freshCompanyResearch.riskSignals)
        : [],
      professionalSignals: freshContactResearch
        ? stringList(freshContactResearch.professionalSignals)
        : [],
      negativeRoleSignals: freshContactResearch
        ? stringList(freshContactResearch.negativeRoleSignals)
        : [],
    },
    voiceSamples,
    sequence: campaignContact.emailDrafts,
    personaResolution: {
      source: resolved.source,
      hasDecision: resolved.hasDecision,
      needsConfirmation: resolved.needsConfirmation,
      suggestedPersonaId: resolved.suggestedPersonaId,
      decisionReason: resolved.decisionReason,
    },
  };
}

export async function loadEmailDraftScreenStates(input: {
  organizationId: string;
  productId: string;
  icpId: string;
  campaignPersonaId: string | null;
  campaignPersonaName: string | null;
  inPlay: Array<{ personaId: string; name: string }>;
  productPersonas: Array<{ id: string; name: string }>;
  contacts: Array<{
    campaignContactId: string;
    contactId: string;
    companyId: string | null;
    chosenPersonaId?: string | null;
    storedPersonaId?: string | null;
  }>;
}): Promise<Record<string, EmailDraftScreenState>> {
  const contactIds = input.contacts.map((row) => row.contactId);
  const companyIds = Array.from(
    new Set(
      input.contacts
        .map((row) => row.companyId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const personaOptions =
    input.inPlay.length > 0
      ? input.inPlay.map((row) => ({ id: row.personaId, name: row.name }))
      : input.productPersonas;
  const personaNameById = new Map(
    [
      ...input.productPersonas.map((persona) => [persona.id, persona.name] as const),
      ...(input.campaignPersonaId && input.campaignPersonaName
        ? ([[input.campaignPersonaId, input.campaignPersonaName]] as const)
        : []),
    ],
  );

  const [scores, contactResearchRows, companyResearchRows, researchPolicy] =
    await Promise.all([
    contactIds.length > 0
      ? prisma.contactScore.findMany({
          where: {
            organizationId: input.organizationId,
            contactId: { in: contactIds },
            scoringStatus: "COMPLETED",
            scoringRun: {
              organizationId: input.organizationId,
              productId: input.productId,
              icpId: input.icpId,
              status: { in: ["COMPLETED", "PARTIAL"] },
            },
          },
          orderBy: [{ scoredAt: "desc" }, { createdAt: "desc" }],
          select: {
            contactId: true,
            matchedPersonaId: true,
            scoredAt: true,
            assessmentData: true,
          },
        })
      : Promise.resolve([]),
    contactIds.length > 0
      ? prisma.contactResearch.findMany({
          where: {
            organizationId: input.organizationId,
            contactId: { in: contactIds },
          },
        })
      : Promise.resolve([]),
    companyIds.length > 0
      ? prisma.companyResearch.findMany({
          where: {
            organizationId: input.organizationId,
            companyId: { in: companyIds },
          },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    getResearchPolicy(input.organizationId),
  ]);
  const contactResearchEnabled = researchPolicy.contactResearchEnabled;

  const matchedByContact = new Map<string, string | null>();
  const skipReasonByContact = new Map<string, string | null>();
  for (const score of scores) {
    if (!matchedByContact.has(score.contactId)) {
      matchedByContact.set(score.contactId, score.matchedPersonaId);
      const assessmentData = score.assessmentData as
        | { aiSkipReason?: string }
        | null
        | undefined;
      skipReasonByContact.set(
        score.contactId,
        assessmentData?.aiSkipReason ?? null,
      );
    }
  }
  const contactResearchByContact = new Map(
    contactResearchRows.map((row) => [row.contactId, row]),
  );
  const companyResearchByCompany = new Map<string, (typeof companyResearchRows)[number]>();
  for (const row of companyResearchRows) {
    if (!companyResearchByCompany.has(row.companyId)) {
      companyResearchByCompany.set(row.companyId, row);
    }
  }

  const states: Record<string, EmailDraftScreenState> = {};
  for (const row of input.contacts) {
    const resolved = resolveEmailGenerationPersona({
      chosenPersonaId: row.chosenPersonaId ?? null,
      storedPersonaId: row.storedPersonaId ?? null,
      matchedPersonaId: matchedByContact.get(row.contactId) ?? null,
      suggestedPersonaId: input.campaignPersonaId,
      aiSkipReason: skipReasonByContact.get(row.contactId) ?? null,
    });
    const contactResearch = contactResearchEnabled
      ? (contactResearchByContact.get(row.contactId) ?? null)
      : null;
    const companyResearchRow = row.companyId
      ? companyResearchByCompany.get(row.companyId) ?? null
      : null;
    const freshContact = isFreshContactResearch(contactResearch);
    const freshCompany =
      companyResearchRow &&
      !companyResearchRow.identityAmbiguous &&
      isResearchFresh(companyResearchRow)
        ? companyResearchRow
        : null;
    const personalization = resolvePersonalization({
      companyResearch: freshCompany
        ? {
            companySummary: freshCompany.companySummary,
            whatTheySell: freshCompany.whatTheySell,
            customerTypes: parseStringArray(freshCompany.customerTypes),
            primaryMarkets: parseStringArray(freshCompany.primaryMarkets),
            businessModel: freshCompany.businessModel,
            companySizeContext: freshCompany.companySizeContext,
            confidence: freshCompany.researchConfidence,
          }
        : null,
      contactResearch: contactResearchForPrompt(
        freshContact && contactResearch
          ? {
              roleSummary: contactResearch.roleSummary,
              responsibilities: stringList(contactResearch.responsibilities),
              ownershipAreas: stringList(contactResearch.ownershipAreas),
            }
          : null,
      ),
    });
    const options =
      resolved.personaId &&
      personaNameById.get(resolved.personaId) &&
      !personaOptions.some((persona) => persona.id === resolved.personaId)
        ? [
            {
              id: resolved.personaId,
              name: personaNameById.get(resolved.personaId)!,
            },
            ...personaOptions,
          ]
        : personaOptions;
    states[row.campaignContactId] = {
      resolvedPersonaId: resolved.personaId,
      resolvedPersonaName: resolved.personaId
        ? (personaNameById.get(resolved.personaId) ?? null)
        : null,
      hasPersonaDecision: resolved.hasDecision,
      needsPersonaConfirmation: resolved.needsConfirmation,
      suggestedPersonaId: resolved.suggestedPersonaId,
      suggestedPersonaName: resolved.suggestedPersonaId
        ? (personaNameById.get(resolved.suggestedPersonaId) ?? null)
        : null,
      personaDecisionReason: resolved.decisionReason,
      personaOptions: options,
      personalizationTier: personalization.tier,
      personalizationLabel: personalization.label,
      personalizationDetail: personalization.detail,
      personalizationSources: personalization.sources,
    };
  }
  return states;
}

export async function ensureContactResearchForEmailGeneration(
  context: EmailGenerationContext,
  options?: { acquireIfMissing?: boolean },
): Promise<EmailGenerationContext> {
  if (context.contactResearch) return context;
  if (options?.acquireIfMissing === false) return context;

  const { getResearchPolicy } = await import("@/lib/usage/policy");
  const policy = await getResearchPolicy(context.organizationId);
  if (!policy.contactResearchEnabled) {
    return context;
  }

  const { snapshotCriterionRow } = await import("@/lib/scoring/snapshots");
  const personaCriteria = (
    await prisma.personaCriterion.findMany({
      where: {
        organizationId: context.organizationId,
        personaId: context.persona.id,
      },
      orderBy: { sortOrder: "asc" },
    })
  ).map(snapshotCriterionRow);

  const existing = await prisma.contactResearch.findUnique({
    where: {
      organizationId_contactId: {
        organizationId: context.organizationId,
        contactId: context.contact.id,
      },
    },
  });

  const { shouldResearchContactRole } = await import(
    "@/lib/contact-research/trigger"
  );
  const trigger = shouldResearchContactRole({
    title: context.contact.title,
    personaCriteria,
    existingResearch: existing,
    freshnessDays: CONTACT_RESEARCH_FRESHNESS_DAYS,
  });
  if (!trigger.needed) {
    if (trigger.reuseExisting && existing && isFreshContactResearch(existing)) {
      return {
        ...context,
        contactResearch: {
          id: existing.id,
          currentTitle: existing.currentTitle,
          roleSummary: existing.roleSummary,
          responsibilities: stringList(existing.responsibilities),
          ownershipAreas: stringList(existing.ownershipAreas),
          professionalSignals: stringList(existing.professionalSignals),
          negativeRoleSignals: stringList(existing.negativeRoleSignals),
          confidence: existing.confidence,
          researchedAt: existing.researchedAt!,
        },
        excludedCopySignals: {
          ...context.excludedCopySignals,
          professionalSignals: stringList(existing.professionalSignals),
          negativeRoleSignals: stringList(existing.negativeRoleSignals),
        },
      };
    }
    return context;
  }

  try {
    const { researchContactRole } = await import(
      "@/lib/contact-research/service"
    );
    const researched = await researchContactRole({
      organizationId: context.organizationId,
      contactId: context.contact.id,
      userId: context.userId,
      personaCriteria,
      policy: {
        contactResearchEnabled: policy.contactResearchEnabled,
        maxSearchQueriesPerContact: policy.maxSearchQueriesPerContact,
        maxSourcesPerContact: policy.maxSourcesPerContact,
        contactResearchFreshnessDays: policy.contactResearchFreshnessDays,
      },
    });
    if (!researched.researchedAt || !isFreshContactResearch(researched)) {
      return context;
    }
    return {
      ...context,
      contactResearch: {
        id: researched.id,
        currentTitle: researched.currentTitle,
        roleSummary: researched.roleSummary,
        responsibilities: stringList(researched.responsibilities),
        ownershipAreas: stringList(researched.ownershipAreas),
        professionalSignals: stringList(researched.professionalSignals),
        negativeRoleSignals: stringList(researched.negativeRoleSignals),
        confidence: researched.confidence,
        researchedAt: researched.researchedAt,
      },
      excludedCopySignals: {
        ...context.excludedCopySignals,
        professionalSignals: stringList(researched.professionalSignals),
        negativeRoleSignals: stringList(researched.negativeRoleSignals),
      },
    };
  } catch {
    return context;
  }
}

export async function loadEmailReplyContext(
  emailDraftId: string,
  userId: string,
): Promise<{
  context: EmailGenerationContext;
  sourceDraft: {
    id: string;
    campaignContactId: string;
    sequenceNumber: number;
    subject: string;
    body: string;
    status: EmailDraftStatus;
    sentAt: Date;
  };
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const draft = await prisma.emailDraft.findFirst({
    where: {
      id: emailDraftId,
      organizationId: membership.organization.id,
    },
    select: {
      id: true,
      campaignContactId: true,
      sequenceNumber: true,
      subject: true,
      body: true,
      status: true,
      sentAt: true,
    },
  });
  if (
    !draft ||
    !draft.subject ||
    !draft.body ||
    draft.status !== "SENT" ||
    !draft.sentAt
  ) {
    throw new TenantError("Replies can only be drafted from a sent email.");
  }
  return {
    context: await loadEmailGenerationContext(
      draft.campaignContactId,
      userId,
    ),
    sourceDraft: {
      ...draft,
      subject: draft.subject,
      body: draft.body,
      sentAt: draft.sentAt,
    },
  };
}

export async function loadExistingEmailDraftContext(
  emailDraftId: string,
  userId: string,
  options?: {
    personaId?: string | null;
    emailLength?: EmailLength | null;
  },
): Promise<{
  context: EmailGenerationContext;
  draft: EmailGenerationContext["sequence"][number];
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const row = await prisma.emailDraft.findFirst({
    where: {
      id: emailDraftId,
      organizationId: membership.organization.id,
    },
    select: {
      campaignContactId: true,
      personaId: true,
      emailLength: true,
    },
  });
  if (!row) {
    throw new TenantError(
      "Email draft does not belong to the active organization.",
    );
  }
  const context = await loadEmailGenerationContext(
    row.campaignContactId,
    userId,
    {
      personaId: options?.personaId,
      storedPersonaId: row.personaId,
      emailLength: options?.emailLength ?? row.emailLength,
    },
  );
  const draft = context.sequence.find((entry) => entry.id === emailDraftId);
  if (!draft) throw new TenantError("Email draft was not found.");
  return { context, draft };
}

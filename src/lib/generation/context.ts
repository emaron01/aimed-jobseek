import "server-only";

import { resolveActiveOrganization } from "@/lib/auth/session";
import { profileEvidenceItems } from "@/lib/consultation/assess";
import { prisma } from "@/lib/prisma";
import { parseCandidateProfileSafe, type CandidateProfile } from "@/lib/product-research/candidate-profile";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";
import { vocab } from "@/lib/product-config";

export type GenerationSource = {
  id: string;
  text: string;
  category:
    | "PROFILE_FACT"
    | "APPROVED_STATEMENT"
    | "APPROVED_STORY"
    | "JOB_REQUIREMENT"
    | "COMPANY_RESEARCH"
    | "ASSESSMENT"
    | "PERSONA";
  url: string | null;
};

type ResearchSource = {
  url?: unknown;
  title?: unknown;
  supports?: unknown;
};

function researchSources(value: unknown): ResearchSource[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is ResearchSource =>
          Boolean(item && typeof item === "object"),
      )
    : [];
}

function addSource(
  sources: GenerationSource[],
  source: GenerationSource,
): void {
  if (source.text.trim()) sources.push({ ...source, text: source.text.trim() });
}

export type ApplicationGenerationContext = {
  organizationId: string;
  userId: string;
  campaign: {
    id: string;
    name: string;
    ownerUserId: string;
    applicationGuidance: string | null;
  };
  profile: CandidateProfile | null;
  requirement: {
    id: string;
    title: string | null;
    companyName: string | null;
    location: string | null;
    workArrangement: string | null;
    seniority: string | null;
    reportingLine: string | null;
    compensationRange: string | null;
    responsibilities: string[];
    requiredItems: string[];
    preferredItems: string[];
    scorecard: unknown;
    rawText: string;
  } | null;
  companyResearch: {
    id: string;
    companySummary: string | null;
    whatTheySell: string | null;
    customerTypes: string[];
    primaryMarkets: string[];
    businessModel: string | null;
    companySizeContext: string | null;
    hiringSignals: string[];
    riskSignals: string[];
    researchSources: unknown;
    updatedAt: Date;
  } | null;
  persona: {
    id: string;
    name: string;
    suggestionKey: string | null;
    likelyTitles: string[];
    profileJson: unknown;
  } | null;
  hiringManagerPersonaId: string | null;
  hiringManagerContactName: string | null;
  assessments: Array<{
    targetKey: string;
    kind: string;
    text: string;
    strength: string;
    strategy: string | null;
    explanation: string | null;
    strategyText: string | null;
  }>;
  approvedStatements: Array<{
    id: string;
    kind: string;
    content: string;
    turnId: string;
  }>;
  stories: Array<{
    id: string;
    situation: string;
    task: string;
    action: string;
    result: string;
    verbatimAnswer: string | null;
    interviewAnswer: string | null;
    resumeBullet: string | null;
    interviewAnswerApprovedAt: Date | null;
    resumeBulletApprovedAt: Date | null;
  }>;
  voiceSamples: Array<{
    id: string;
    label: string;
    sampleText: string;
    createdAt: Date;
  }>;
  sources: GenerationSource[];
};

export type ReadyApplicationGenerationContext = Omit<
  ApplicationGenerationContext,
  "profile" | "requirement"
> & {
  profile: CandidateProfile;
  requirement: NonNullable<ApplicationGenerationContext["requirement"]>;
};

/**
 * Shared generation context for every application asset. It deliberately does
 * not require a contact; email adds its recipient-specific context separately.
 */
export async function loadApplicationGenerationContext(
  campaignId: string,
  userId: string,
  options?: { personaId?: string | null; allowProductPersona?: boolean },
): Promise<ApplicationGenerationContext> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new TenantError("User not found.");
  const membership = await resolveActiveOrganization(user);
  if (!membership) {
    throw new TenantError("No active organization membership was found.");
  }
  const organizationId = membership.organization.id;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: {
      product: {
        include: {
          personas: {
            where: { archivedAt: null },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      jobRequirement: {
        include: {
          company: {
            include: {
              research: { orderBy: { updatedAt: "desc" }, take: 1 },
            },
          },
        },
      },
      hiringTeamRoles: {
        where: { archivedAt: null },
        orderBy: { createdAt: "asc" },
      },
      contacts: {
        include: { contact: true },
        orderBy: { createdAt: "asc" },
      },
      consultationSession: {
        include: {
          assessments: { orderBy: { targetKey: "asc" } },
          statements: {
            where: { status: "APPROVED" },
            orderBy: { approvedAt: "asc" },
          },
        },
      },
    },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  if (campaign.ownerUserId !== userId) {
    throw new TenantError(
      `This ${vocab.campaign.singular} is read-only because it belongs to another user.`,
    );
  }
  const parsedProfile = parseCandidateProfileSafe(campaign.product.profileJson);
  const personaId = options?.personaId?.trim() || null;
  const persona = personaId
    ? campaign.hiringTeamRoles.find((role) => role.id === personaId) ??
      (options?.allowProductPersona
        ? campaign.product.personas.find((role) => role.id === personaId) ?? null
        : null)
    : null;
  if (personaId && !persona) {
    throw new TenantError(
      `The selected ${vocab.persona.singular} does not belong to this ${vocab.campaign.singular}.`,
    );
  }
  const hiringManager =
    campaign.hiringTeamRoles.find(
      (role) => role.suggestionKey === "hiring_manager",
    ) ?? null;
  const hiringManagerContact = hiringManager
    ? campaign.contacts.find(
        (row) => row.chosenPersonaId === hiringManager.id,
      )?.contact ?? null
    : null;
  const stories = await prisma.profileStory.findMany({
    where: {
      organizationId,
      productId: campaign.productId,
    },
    orderBy: { createdAt: "asc" },
  });
  const voiceSamples = await prisma.voiceSample.findMany({
    where: { organizationId, userId, active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, sampleText: true, createdAt: true },
  });
  const requirement = campaign.jobRequirement;
  const research = requirement?.company?.research[0] ?? null;
  const sources: GenerationSource[] = [];
  if (parsedProfile.ok) {
    for (const item of profileEvidenceItems(parsedProfile.profile)) {
      if (item.kind === "FACT") {
        addSource(sources, {
          id: `profile:${item.id}`,
          text: item.text,
          category: "PROFILE_FACT",
          url: null,
        });
      }
    }
  }
  for (const statement of campaign.consultationSession?.statements ?? []) {
    addSource(sources, {
      id: `statement:${statement.id}`,
      text: statement.content,
      category: "APPROVED_STATEMENT",
      url: null,
    });
  }
  for (const story of stories) {
    const approved = [
      story.verbatimAnswer,
      story.interviewAnswerApprovedAt ? story.interviewAnswer : null,
      story.resumeBulletApprovedAt ? story.resumeBullet : null,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ");
    addSource(sources, {
      id: `story:${story.id}`,
      text: approved,
      category: "APPROVED_STORY",
      url: null,
    });
  }
  if (requirement) {
    addSource(sources, {
      id: "job:posting",
      text: requirement.rawText,
      category: "JOB_REQUIREMENT",
      url: requirement.postingUrl,
    });
  }
  for (const assessment of campaign.consultationSession?.assessments ?? []) {
    addSource(sources, {
      id: `assessment:${assessment.targetKey}`,
      text: [assessment.text, assessment.explanation, assessment.strategyText]
        .filter(Boolean)
        .join(". "),
      category: "ASSESSMENT",
      url: null,
    });
  }
  if (research) {
    addSource(sources, {
      id: `research:${research.id}:summary`,
      text: [
        research.companySummary,
        research.whatTheySell,
        research.businessModel,
        research.companySizeContext,
        ...parseStringArray(research.customerTypes),
        ...parseStringArray(research.primaryMarkets),
        ...parseStringArray(research.hiringSignals),
        ...parseStringArray(research.riskSignals),
      ]
        .filter(Boolean)
        .join(". "),
      category: "COMPANY_RESEARCH",
      url: null,
    });
    for (const [index, source] of researchSources(
      research.researchSources,
    ).entries()) {
      addSource(sources, {
        id: `research:${research.id}:source:${index}`,
        text: Array.isArray(source.supports)
          ? source.supports.filter((item): item is string => typeof item === "string").join(". ")
          : typeof source.title === "string"
            ? source.title
            : "",
        category: "COMPANY_RESEARCH",
        url: typeof source.url === "string" ? source.url : null,
      });
    }
  }
  if (persona) {
    addSource(sources, {
      id: `persona:${persona.id}`,
      text: [
        persona.name,
        persona.whyThisPersonaMatters,
        JSON.stringify(persona.profileJson ?? {}),
      ]
        .filter(Boolean)
        .join(". "),
      category: "PERSONA",
      url: null,
    });
  }
  return {
    organizationId,
    userId,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      ownerUserId: campaign.ownerUserId,
      applicationGuidance: campaign.emailGuidance,
    },
    profile: parsedProfile.ok ? parsedProfile.profile : null,
    requirement: requirement
      ? {
          id: requirement.id,
          title: requirement.title,
          companyName: requirement.companyName,
          location: requirement.location,
          workArrangement: requirement.workArrangement,
          seniority: requirement.seniority,
          reportingLine: requirement.reportingLine,
          compensationRange: requirement.compensationRange,
          responsibilities: parseStringArray(requirement.responsibilities),
          requiredItems: parseStringArray(requirement.requiredItems),
          preferredItems: parseStringArray(requirement.preferredItems),
          scorecard: requirement.scorecardJson,
          rawText: requirement.rawText,
        }
      : null,
    companyResearch: research
      ? {
          id: research.id,
          companySummary: research.companySummary,
          whatTheySell: research.whatTheySell,
          customerTypes: parseStringArray(research.customerTypes),
          primaryMarkets: parseStringArray(research.primaryMarkets),
          businessModel: research.businessModel,
          companySizeContext: research.companySizeContext,
          hiringSignals: parseStringArray(research.hiringSignals),
          riskSignals: parseStringArray(research.riskSignals),
          researchSources: research.researchSources,
          updatedAt: research.updatedAt,
        }
      : null,
    persona: persona
      ? {
          id: persona.id,
          name: persona.name,
          suggestionKey: persona.suggestionKey,
          likelyTitles: parseStringArray(persona.targetTitles),
          profileJson: persona.profileJson,
        }
      : null,
    hiringManagerPersonaId: hiringManager?.id ?? null,
    hiringManagerContactName: hiringManagerContact
      ? [hiringManagerContact.firstName, hiringManagerContact.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || null
      : null,
    assessments: (campaign.consultationSession?.assessments ?? []).map(
      (assessment) => ({
        targetKey: assessment.targetKey,
        kind: assessment.kind,
        text: assessment.text,
        strength: assessment.strength,
        strategy: assessment.strategy,
        explanation: assessment.explanation,
        strategyText: assessment.strategyText,
      }),
    ),
    approvedStatements: (campaign.consultationSession?.statements ?? []).map(
      (statement) => ({
        id: statement.id,
        kind: statement.kind,
        content: statement.content,
        turnId: statement.turnId,
      }),
    ),
    stories: stories.map((story) => ({
      id: story.id,
      situation: story.situation,
      task: story.task,
      action: story.action,
      result: story.result,
      verbatimAnswer: story.verbatimAnswer,
      interviewAnswer: story.interviewAnswer,
      resumeBullet: story.resumeBullet,
      interviewAnswerApprovedAt: story.interviewAnswerApprovedAt,
      resumeBulletApprovedAt: story.resumeBulletApprovedAt,
    })),
    voiceSamples,
    sources,
  };
}

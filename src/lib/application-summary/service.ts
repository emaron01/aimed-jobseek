import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { generateApplicationSummaryGuidance } from "@/lib/application-summary/ai";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
  applicationSummaryGuidanceSchema,
  type ApplicationSummaryGuidance,
} from "@/lib/application-summary/contract";
import {
  bannedPhraseHits,
  mentionsInternalSystemState,
  validateGroundedStatement,
} from "@/lib/consultation/output-quality";
import { profileEvidenceItems } from "@/lib/consultation/assess";
import { prisma } from "@/lib/prisma";
import { consultationConfig, vocab } from "@/lib/product-config";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";
import { usableEmployerResearch } from "@/lib/job-requirement/identity-verification";

export type SummarySource = {
  id: string;
  text: string;
  category: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function personaNarrative(profileJson: unknown) {
  const profile = record(profileJson);
  const narrative = record(profile?.narrative);
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.flatMap((item) => {
          const row = record(item);
          return typeof row?.text === "string" && row.text.trim()
            ? [row.text.trim()]
            : [];
        })
      : [];
  const one = (value: unknown): string | null => {
    const row = record(value);
    return typeof row?.text === "string" && row.text.trim()
      ? row.text.trim()
      : null;
  };
  return {
    involvement: profile?.involvement === "INDIRECT" ? "INDIRECT" : "DIRECT",
    overview: one(narrative?.overview),
    concerns: strings(narrative?.concerns),
    talkingPoints: strings(narrative?.talkingPoints),
    impact: one(narrative?.impact),
  } as const;
}

function appendSource(
  sources: SummarySource[],
  id: string,
  text: string | null | undefined,
  category: string,
) {
  const cleaned = text?.trim();
  if (cleaned) sources.push({ id, text: cleaned, category });
}

async function loadSummaryData(organizationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: {
      product: true,
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
      consultationSession: {
        include: {
          assessments: { orderBy: { targetKey: "asc" } },
          statements: {
            where: { status: "APPROVED" },
            orderBy: { approvedAt: "asc" },
          },
          turns: {
            where: { speaker: "SEEKER", skipped: false },
            select: { id: true },
          },
        },
      },
      applicationSummary: true,
      interviewStages: {
        include: { guide: { select: { id: true, status: true, updatedAt: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!campaign) throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  if (!campaign.jobRequirement) {
    throw new TenantError(`This ${vocab.campaign.singular} has no job requirement.`);
  }
  const turnIds = campaign.consultationSession?.turns.map((turn) => turn.id) ?? [];
  const stories =
    turnIds.length > 0
      ? await prisma.profileStory.findMany({
          where: {
            organizationId,
            consultationTurnId: { in: turnIds },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
  const research = usableEmployerResearch(
    campaign.jobRequirement,
    campaign.jobRequirement.company?.research[0] ?? null,
  );
  const roles = campaign.hiringTeamRoles.map((role) => ({
    id: role.id,
    name: role.name,
    likelyTitles: parseStringArray(role.targetTitles),
    reason: role.whyThisPersonaMatters,
    updatedAt: role.updatedAt,
    ...personaNarrative(role.profileJson),
  }));
  const sourceFingerprint = {
    requirement: [
      campaign.jobRequirement.id,
      campaign.jobRequirement.updatedAt.toISOString(),
    ],
    research: research
      ? [research.id, research.updatedAt.toISOString()]
      : null,
    roles: roles.map((role) => [role.id, role.updatedAt.toISOString()]),
    assessments:
      campaign.consultationSession?.assessments.map((assessment) => [
        assessment.id,
        assessment.updatedAt.toISOString(),
      ]) ?? [],
    statements:
      campaign.consultationSession?.statements.map((statement) => [
        statement.id,
        statement.updatedAt.toISOString(),
      ]) ?? [],
    stories: stories.map((story) => [
      story.id,
      story.updatedAt.toISOString(),
      story.interviewAnswerApprovedAt?.toISOString() ?? null,
      story.resumeBulletApprovedAt?.toISOString() ?? null,
    ]),
    interviewStages: campaign.interviewStages.map((stage) => [
      stage.id,
      stage.updatedAt.toISOString(),
      stage.notesAfter,
      stage.outcome,
      stage.guide?.updatedAt.toISOString() ?? null,
    ]),
  };
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(sourceFingerprint))
    .digest("hex");

  const sources: SummarySource[] = [];
  const profile = campaign.product.profileJson
    ? parseCandidateProfileSafe(campaign.product.profileJson)
    : null;
  if (profile?.ok) {
    for (const item of profileEvidenceItems(profile.profile)) {
      if (item.kind === "FACT") {
        appendSource(sources, `profile:${item.id}`, item.text, "SEEKER");
      }
    }
  }
  const requirement = campaign.jobRequirement;
  appendSource(sources, "job:title", requirement.title, "JOB");
  appendSource(sources, "job:reporting-line", requirement.reportingLine, "JOB");
  appendSource(sources, "job:location", requirement.location, "JOB");
  appendSource(sources, "job:work-arrangement", requirement.workArrangement, "JOB");
  appendSource(sources, "job:posting", requirement.rawText, "JOB");
  for (const assessment of campaign.consultationSession?.assessments ?? []) {
    appendSource(
      sources,
      `assessment:${assessment.targetKey}`,
      [
        assessment.text,
        assessment.explanation,
        assessment.strategyText,
      ]
        .filter(Boolean)
        .join(". "),
      "ASSESSMENT",
    );
  }
  if (research) {
    appendSource(sources, "research:summary", research.companySummary, "COMPANY");
    appendSource(sources, "research:offering", research.whatTheySell, "COMPANY");
    appendSource(sources, "research:size", research.companySizeContext, "COMPANY");
    for (const [index, customer] of parseStringArray(research.customerTypes).entries()) {
      appendSource(sources, `research:customer:${index}`, customer, "COMPANY");
    }
    for (const [index, signal] of parseStringArray(research.hiringSignals).entries()) {
      appendSource(sources, `research:hiring:${index}`, signal, "COMPANY");
    }
    for (const [index, signal] of parseStringArray(research.riskSignals).entries()) {
      appendSource(sources, `research:risk:${index}`, signal, "COMPANY");
    }
  }
  for (const role of roles) {
    appendSource(sources, `persona:${role.id}:reason`, role.reason, "PERSONA");
    appendSource(sources, `persona:${role.id}:overview`, role.overview, "PERSONA");
    appendSource(sources, `persona:${role.id}:impact`, role.impact, "PERSONA");
    role.concerns.forEach((text, index) =>
      appendSource(sources, `persona:${role.id}:concern:${index}`, text, "PERSONA"),
    );
    role.talkingPoints.forEach((text, index) =>
      appendSource(sources, `persona:${role.id}:talking:${index}`, text, "PERSONA"),
    );
  }
  for (const story of stories) {
    appendSource(
      sources,
      `story:${story.id}`,
      [
        story.verbatimAnswer,
        story.interviewAnswerApprovedAt ? story.interviewAnswer : null,
        story.resumeBulletApprovedAt ? story.resumeBullet : null,
        story.situation,
        story.task,
        story.action,
        story.result,
      ]
        .filter(Boolean)
        .join(" "),
      "APPROVED_STORY",
    );
  }
  return {
    campaign,
    requirement,
    research,
    roles,
    stories,
    stages: campaign.interviewStages,
    sources,
    sourceHash,
  };
}

function guidanceTexts(guidance: ApplicationSummaryGuidance): string[] {
  return [
    ...guidance.coachingSummary.map((item) => item.text),
    ...guidance.questionsToPrepare.map((item) => item.text),
    ...guidance.questionsForDirectRoles.flatMap((role) =>
      role.questions.map((item) => item.text),
    ),
  ];
}

export function validateApplicationSummaryGuidance(input: {
  guidance: ApplicationSummaryGuidance;
  sources: SummarySource[];
  directRoles: Array<{ id: string; name: string }>;
}): string[] {
  const errors: string[] = [];
  const roles = new Map(input.directRoles.map((role) => [role.id, role]));
  const banned = bannedPhraseHits(
    guidanceTexts(input.guidance),
    consultationConfig.bannedPhrases,
  );
  if (banned.length > 0) {
    errors.push(`Remove banned language: ${banned.join(", ")}.`);
  }
  if (guidanceTexts(input.guidance).some(mentionsInternalSystemState)) {
    errors.push("Remove references to internal system state.");
  }
  const items = [
    ...input.guidance.coachingSummary,
    ...input.guidance.questionsToPrepare,
    ...input.guidance.questionsForDirectRoles.flatMap((role) => role.questions),
  ];
  for (const item of [
    ...input.guidance.questionsToPrepare,
    ...input.guidance.questionsForDirectRoles.flatMap((role) => role.questions),
  ]) {
    if (!item.text.trim().endsWith("?")) {
      errors.push("Every guidance question must be written as a question.");
    }
  }
  for (const item of items) {
    errors.push(
      ...validateGroundedStatement({
        statement: {
          text: item.text,
          claims: [{ text: item.text, supports: item.supports }],
        },
        sources: input.sources,
        bannedPhrases: consultationConfig.bannedPhrases,
        requireSentenceClaims: false,
      }),
    );
  }
  const seen = new Set<string>();
  for (const roleGuidance of input.guidance.questionsForDirectRoles) {
    const role = roles.get(roleGuidance.roleId);
    if (
      !role ||
      role.name !== roleGuidance.roleName ||
      seen.has(roleGuidance.roleId)
    ) {
      errors.push("Guidance referenced an invalid or duplicate Direct role.");
    }
    seen.add(roleGuidance.roleId);
  }
  if (seen.size !== input.directRoles.length) {
    errors.push("Guidance did not include every Direct Hiring Team role.");
  }
  return [...new Set(errors)];
}

export async function generateApplicationSummary(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
}): Promise<void> {
  const data = await loadSummaryData(input.organizationId, input.campaignId);
  if (data.campaign.ownerUserId !== input.userId) {
    throw new TenantError(`Only the owner can regenerate this ${vocab.campaign.singular}.`);
  }
  await prisma.applicationSummary.upsert({
    where: { campaignId: input.campaignId },
    create: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      status: "GENERATING",
      promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
    },
    update: {
      status: "GENERATING",
      generationError: null,
      guidanceJson: Prisma.JsonNull,
      sourceHash: null,
      generatedAt: null,
      promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
    },
  });
  const directRoles = data.roles
    .filter((role) => role.involvement === "DIRECT")
    .map((role) => ({ id: role.id, name: role.name }));
  let feedback: string[] = [];
  for (
    let attempt = 0;
    attempt <= consultationConfig.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const generated = await generateApplicationSummaryGuidance({
      sources: data.sources,
      directRoles,
      qualityFeedback: feedback,
    });
    if (!generated.ok) {
      await prisma.applicationSummary.update({
        where: { campaignId: input.campaignId },
        data: { status: "FAILED", generationError: generated.message },
      });
      return;
    }
    const errors = validateApplicationSummaryGuidance({
      guidance: generated.data,
      sources: data.sources,
      directRoles,
    });
    if (errors.length === 0) {
      await prisma.applicationSummary.update({
        where: { campaignId: input.campaignId },
        data: {
          status: "READY",
          guidanceJson: generated.data,
          sourceHash: data.sourceHash,
          generationError: null,
          generatedAt: new Date(),
          promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
        },
      });
      return;
    }
    feedback = errors;
  }
  await prisma.applicationSummary.update({
    where: { campaignId: input.campaignId },
    data: {
      status: "FAILED",
      generationError:
        "Application Summary guidance did not pass quality checks. Retry.",
    },
  });
}

export async function getApplicationSummaryView(input: {
  organizationId: string;
  campaignId: string;
}) {
  const data = await loadSummaryData(input.organizationId, input.campaignId);
  const guidance = data.campaign.applicationSummary?.guidanceJson
    ? applicationSummaryGuidanceSchema.safeParse(
        data.campaign.applicationSummary.guidanceJson,
      )
    : null;
  return {
    campaign: {
      id: data.campaign.id,
      name: data.campaign.name,
      ownerUserId: data.campaign.ownerUserId,
      visibility: data.campaign.visibility,
    },
    requirement: data.requirement,
    research: data.research,
    roles: data.roles,
    assessments: data.campaign.consultationSession?.assessments ?? [],
    stories: data.stories,
    stages: data.stages,
    summary: data.campaign.applicationSummary,
    guidance: guidance?.success ? guidance.data : null,
    stale:
      data.campaign.applicationSummary?.status === "READY" &&
      data.campaign.applicationSummary.sourceHash !== data.sourceHash,
  };
}

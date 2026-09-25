import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { generateApplicationSummaryGuidance } from "@/lib/application-summary/ai";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
  applicationSummaryGuidanceSchema,
  type ApplicationSummaryGuidance,
} from "@/lib/application-summary/contract";
import {
  mentionsInternalSystemState,
  validateGroundedStatement,
} from "@/lib/consultation/output-quality";
import {
  logQualityRejection,
  qualityIssue,
  qualityMessages,
} from "@/lib/generation/quality";
import { profileEvidenceItems } from "@/lib/consultation/assess";
import { prisma } from "@/lib/prisma-client";
import {
  buildCheatSheetPeople,
  cheatSheetSectionKind,
} from "@/lib/application-summary/people";
import { listPersonPreps } from "@/lib/interview/person-prep";
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
      contacts: {
        include: {
          contact: {
            select: { id: true, firstName: true, lastName: true, title: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
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
    suggestionKey: role.suggestionKey,
    reason: role.whyThisPersonaMatters,
    updatedAt: role.updatedAt,
    ...personaNarrative(role.profileJson),
  }));
  const people = buildCheatSheetPeople({
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      titles: role.likelyTitles,
      involvement: role.involvement,
      suggestionKey: role.suggestionKey,
    })),
    contacts: campaign.contacts
      .filter((row) => row.chosenPersonaId)
      .map((row) => ({
        contactId: row.contactId,
        personaId: row.chosenPersonaId,
        firstName: row.contact.firstName,
        lastName: row.contact.lastName,
        title: row.contact.title,
      })),
  }).map((person) => ({
    ...person,
    sectionKind: cheatSheetSectionKind(person),
  }));
  const personPreps = await listPersonPreps({ organizationId, campaignId });
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
    personPreps: personPreps.map((prep) => [
      prep.contactId,
      prep.status,
      prep.openingText,
      prep.confirmedAnswers.map((item) => item.text),
    ]),
    whyThisCompany: campaign.whyThisCompany,
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
  appendSource(
    sources,
    "seeker:why-this-company",
    campaign.whyThisCompany,
    "SEEKER",
  );
  for (const prep of personPreps) {
    appendSource(
      sources,
      `person-prep:${prep.contactId}:opening`,
      prep.openingText,
      "PERSON_PREP",
    );
    prep.confirmedAnswers.forEach((answer, index) =>
      appendSource(
        sources,
        `person-prep:${prep.contactId}:answer:${index}`,
        answer.text,
        "PERSON_PREP",
      ),
    );
  }
  return {
    campaign,
    requirement,
    research,
    roles,
    people,
    stories,
    stages: campaign.interviewStages,
    sources,
    sourceHash,
  };
}

function guidanceItemTexts(guidance: ApplicationSummaryGuidance): string[] {
  const personItems = guidance.people.flatMap((person) => [
    ...person.caresAbout,
    ...person.bestMaterial,
    ...person.likelyQuestions,
    ...person.questionsToAsk,
    person.recruiter?.sixtySecondSummary,
    person.recruiter?.whyThisCompany,
    person.recruiter?.whyThisRole,
    person.recruiter?.logistics,
    person.recruiter?.compensationReadiness,
    ...(person.recruiter?.flagAnswers ?? []),
    person.hiringManager?.firstNinetyDays,
    ...(person.hiringManager?.drillDowns ?? []),
    ...(person.hiringManager?.gaps ?? []),
    person.executive?.strategy,
    person.executive?.judgment,
    person.executive?.businessImpact,
    person.crossFunctional?.howWorkedAcross,
    person.crossFunctional?.dayToDay,
  ]);
  return [
    guidance.overview.thirtySecondFit.text,
    guidance.overview.careerRecap.text,
    ...guidance.overview.gapsToPrepare.map((item) => item.text),
    ...personItems.filter(Boolean).map((item) => item!.text),
    ...guidance.stories.flatMap((story) => [
      story.situation,
      ...story.variations.map((item) => item.text),
    ]),
  ];
}

function guidanceSupportItems(guidance: ApplicationSummaryGuidance) {
  return [
    guidance.overview.thirtySecondFit,
    guidance.overview.careerRecap,
    ...guidance.overview.gapsToPrepare,
    ...guidance.people.flatMap((person) => [
      ...person.caresAbout,
      ...person.bestMaterial,
      ...person.likelyQuestions,
      ...person.questionsToAsk,
      ...(person.recruiter
        ? [
            person.recruiter.sixtySecondSummary,
            person.recruiter.whyThisCompany,
            person.recruiter.whyThisRole,
            person.recruiter.logistics,
            person.recruiter.compensationReadiness,
            ...person.recruiter.flagAnswers,
          ]
        : []),
      ...(person.hiringManager
        ? [
            person.hiringManager.firstNinetyDays,
            ...person.hiringManager.drillDowns,
            ...person.hiringManager.gaps,
          ]
        : []),
      ...(person.executive
        ? [
            person.executive.strategy,
            person.executive.judgment,
            person.executive.businessImpact,
          ]
        : []),
      ...(person.crossFunctional
        ? [person.crossFunctional.howWorkedAcross, person.crossFunctional.dayToDay]
        : []),
    ]),
    ...guidance.stories.flatMap((story) => story.variations),
  ];
}

export function storyTextsRepeatVerbatim(guidance: ApplicationSummaryGuidance): boolean {
  const bodies = guidance.stories.flatMap((story) => [
    story.situation.trim(),
    ...story.variations.map((item) => item.text.trim()),
  ]);
  const seen = new Set<string>();
  for (const body of bodies) {
    if (!body) continue;
    if (seen.has(body)) return true;
    seen.add(body);
  }
  return false;
}

export function validateApplicationSummaryGuidance(input: {
  guidance: ApplicationSummaryGuidance;
  sources: SummarySource[];
  people: Array<{ sectionKey: string; heading: string; sectionKind: string }>;
}): string[] {
  const errors: string[] = [];
  if (guidanceItemTexts(input.guidance).some(mentionsInternalSystemState)) {
    errors.push("Remove references to internal system state.");
  }
  if (storyTextsRepeatVerbatim(input.guidance)) {
    errors.push("Each story may appear once. Do not repeat the same story text verbatim.");
  }
  const storyIds = new Set(input.guidance.stories.map((story) => story.storyId));
  for (const person of input.guidance.people) {
    for (const storyId of person.storyIds) {
      if (!storyIds.has(storyId)) {
        errors.push("A person section referenced a story that is not in the story bank.");
      }
    }
    for (const item of [...person.likelyQuestions, ...person.questionsToAsk]) {
      if (!item.text.trim().endsWith("?")) {
        errors.push("Every guidance question must be written as a question.");
      }
    }
  }
  for (const item of guidanceSupportItems(input.guidance)) {
    errors.push(
      ...qualityMessages(
        validateGroundedStatement({
          statement: {
            text: item.text,
            claims: [{ text: item.text, supports: item.supports }],
          },
          sources: input.sources,
          field: item.text.slice(0, 40),
          requireSentenceClaims: false,
        }),
      ),
    );
  }
  const expected = new Map(input.people.map((person) => [person.sectionKey, person]));
  const seen = new Set<string>();
  for (const person of input.guidance.people) {
    const expectedPerson = expected.get(person.sectionKey);
    if (
      !expectedPerson ||
      expectedPerson.heading !== person.heading ||
      expectedPerson.sectionKind !== person.sectionKind ||
      seen.has(person.sectionKey)
    ) {
      errors.push("Guidance referenced an invalid or duplicate person section.");
    }
    seen.add(person.sectionKey);
  }
  if (seen.size !== input.people.length) {
    errors.push("Guidance did not include every Hiring Team person section.");
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
  const people = data.people.map((person) => ({
    sectionKey: person.sectionKey,
    roleId: person.roleId,
    contactId: person.contactId,
    heading: person.heading,
    roleName: person.roleName,
    titles: person.titles,
    sectionKind: person.sectionKind,
  }));
  let feedback: string[] = [];
  for (
    let attempt = 0;
    attempt <= consultationConfig.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const generated = await generateApplicationSummaryGuidance({
      sources: data.sources,
      people,
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
      people,
    });
    if (errors.length > 0) {
      logQualityRejection({
        generator: "application_summary",
        attempt,
        issues: errors.map((message) =>
          qualityIssue({
            check: "summary_validation",
            field: "guidance",
            text: message,
            message,
          }),
        ),
      });
    }
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
        "Interview Cheat Sheet guidance did not pass checks. The passing parts were not enough to save. Retry.",
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
    people: data.people,
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

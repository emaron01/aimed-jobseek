import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  generateApplicationSummaryShell,
  generateCheatSheetPersonSectionGuidance,
} from "@/lib/application-summary/ai";
import { linkedInProfileHasSubstance } from "@/lib/application-summary/linkedin";
import {
  appendCheatSheetNote,
  parseCheatSheetNotes,
  peopleRequestedForGeneration,
} from "@/lib/application-summary/notes";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
  applicationSummaryGuidanceSchema,
  type ApplicationSummaryGuidance,
  type CheatSheetCoachItem,
} from "@/lib/application-summary/contract";
import {
  assignCoachItemIds,
  findCoachItem,
  replaceCoachItem,
  seekerFirstName,
  validateCoachItems,
  validateSeekerVoice,
} from "@/lib/application-summary/coach";
import { appendConfirmedFact } from "@/lib/consultation/write-back";
import { polishAnswerWithQuality } from "@/lib/consultation/service";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import { profileEvidenceItems } from "@/lib/consultation/assess";
import {
  mentionsInternalSystemState,
  validateGroundedStatement,
} from "@/lib/consultation/output-quality";
import {
  qualityMessages,
} from "@/lib/generation/quality";
import { prisma } from "@/lib/prisma-client";
import {
  buildCheatSheetPeople,
  cheatSheetSectionKind,
} from "@/lib/application-summary/people";
import { listPersonPreps } from "@/lib/interview/person-prep";
import {
  applicationSummaryConfig,
  consultationConfig,
  consultationConversationCopy,
  sanitizeWorkspaceFailure,
  vocab,
} from "@/lib/product-config";
import {
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
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
  appendSource(
    sources,
    "job:learned-notes",
    requirement.seekerLearnedNotes,
    "SEEKER",
  );
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
  const notesByContactId = new Map<string, ReturnType<typeof parseCheatSheetNotes>>();
  for (const row of campaign.contacts) {
    const notes = parseCheatSheetNotes(row.cheatSheetNotesJson);
    notesByContactId.set(row.contactId, notes);
    if (linkedInProfileHasSubstance(row.linkedInProfileText)) {
      appendSource(
        sources,
        `linkedin:${row.contactId}`,
        row.linkedInProfileText,
        "LINKEDIN",
      );
    }
    for (const note of notes) {
      appendSource(sources, `intel:${note.id}`, note.text, "INTERVIEW_INTEL");
    }
  }
  return {
    campaign,
    requirement,
    research,
    roles,
    people,
    notesByContactId,
    stories,
    stages: campaign.interviewStages,
    sources,
    sourceHash,
  };
}

function coachItemTexts(item: CheatSheetCoachItem): string[] {
  return [item.prompt, item.sampleAnswer, item.harperQuestion].filter(
    (text): text is string => Boolean(text?.trim()),
  );
}

function guidanceItemTexts(guidance: ApplicationSummaryGuidance): string[] {
  const personItems = guidance.people.flatMap((person) => [
    ...person.caresAbout,
    ...person.bestMaterial,
    ...person.questionsToAsk,
    person.recruiter?.sixtySecondSummary,
    person.recruiter?.whyThisCompany,
    person.recruiter?.whyThisRole,
    person.recruiter?.logistics,
    person.recruiter?.compensationReadiness,
    person.hiringManager?.firstNinetyDays,
    person.executive?.strategy,
    person.executive?.judgment,
    person.executive?.businessImpact,
    person.crossFunctional?.howWorkedAcross,
    person.crossFunctional?.dayToDay,
  ]);
  return [
    guidance.overview?.thirtySecondFit.text,
    guidance.overview?.careerRecap.text,
    ...personItems.filter(Boolean).map((item) => item!.text),
    ...(guidance.overview?.gapsToPrepare.flatMap(coachItemTexts) ?? []),
    ...guidance.people.flatMap((person) => [
      ...person.likelyQuestions.flatMap(coachItemTexts),
      ...(person.recruiter?.flagAnswers.flatMap(coachItemTexts) ?? []),
      ...(person.hiringManager?.drillDowns.flatMap(coachItemTexts) ?? []),
      ...(person.hiringManager?.gaps.flatMap(coachItemTexts) ?? []),
      person.linkedinAddendum?.background.text,
      person.linkedinAddendum?.focus.text,
      person.linkedinAddendum?.seekerConnection.text,
    ]),
    ...guidance.stories.flatMap((story) => [
      story.situation,
      ...story.variations.map((item) => item.text),
    ]),
  ].filter((text): text is string => Boolean(text?.trim()));
}

function coachItemAsGuidance(item: CheatSheetCoachItem) {
  const text =
    item.sampleAnswer?.trim() ||
    item.harperQuestion?.trim() ||
    item.prompt;
  return { text, supports: item.supports };
}

function guidanceSupportItems(guidance: ApplicationSummaryGuidance) {
  return [
    ...(guidance.overview
      ? [
          guidance.overview.thirtySecondFit,
          guidance.overview.careerRecap,
          ...guidance.overview.gapsToPrepare.map(coachItemAsGuidance),
        ]
      : []),
    ...guidance.people.flatMap((person) => [
      ...person.caresAbout,
      ...person.bestMaterial,
      ...person.likelyQuestions.map(coachItemAsGuidance),
      ...person.questionsToAsk,
      ...(person.recruiter
        ? [
            person.recruiter.sixtySecondSummary,
            person.recruiter.whyThisCompany,
            person.recruiter.whyThisRole,
            person.recruiter.logistics,
            person.recruiter.compensationReadiness,
            ...person.recruiter.flagAnswers.map(coachItemAsGuidance),
          ]
        : []),
      ...(person.hiringManager
        ? [
            person.hiringManager.firstNinetyDays,
            ...person.hiringManager.drillDowns.map(coachItemAsGuidance),
            ...person.hiringManager.gaps.map(coachItemAsGuidance),
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
      ...(person.linkedinAddendum
        ? [
            person.linkedinAddendum.background,
            person.linkedinAddendum.focus,
            person.linkedinAddendum.seekerConnection,
          ]
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

function seekerVoiceTexts(guidance: ApplicationSummaryGuidance): string[] {
  return [
    guidance.overview?.thirtySecondFit.text,
    guidance.overview?.careerRecap.text,
    ...(guidance.overview?.gapsToPrepare.flatMap((item) => [
      item.sampleAnswer,
      item.harperQuestion,
    ]) ?? []),
    ...guidance.people.flatMap((person) => [
      ...person.bestMaterial.map((item) => item.text),
      ...person.likelyQuestions.flatMap((item) => [
        item.sampleAnswer,
        item.harperQuestion,
      ]),
      person.recruiter?.sixtySecondSummary.text,
      person.recruiter?.whyThisCompany.text,
      person.recruiter?.whyThisRole.text,
      person.recruiter?.logistics.text,
      person.recruiter?.compensationReadiness.text,
      ...(person.recruiter?.flagAnswers.flatMap((item) => [
        item.sampleAnswer,
        item.harperQuestion,
      ]) ?? []),
      person.hiringManager?.firstNinetyDays.text,
      ...(person.hiringManager?.scorecardOutcomes.map((item) => item.note) ?? []),
      ...(person.hiringManager?.drillDowns.flatMap((item) => [
        item.sampleAnswer,
        item.harperQuestion,
      ]) ?? []),
      ...(person.hiringManager?.gaps.flatMap((item) => [
        item.sampleAnswer,
        item.harperQuestion,
      ]) ?? []),
      person.executive?.strategy.text,
      person.executive?.judgment.text,
      person.executive?.businessImpact.text,
      person.crossFunctional?.howWorkedAcross.text,
      person.crossFunctional?.dayToDay.text,
      person.linkedinAddendum?.seekerConnection.text,
    ]),
    ...guidance.stories.flatMap((story) => [
      story.situation,
      ...story.variations.map((item) => item.text),
    ]),
  ].filter((text): text is string => Boolean(text?.trim()));
}

export function validateApplicationSummaryGuidance(input: {
  guidance: ApplicationSummaryGuidance;
  sources: SummarySource[];
  people: Array<{ sectionKey: string; heading: string; sectionKind: string }>;
  firstName?: string | null;
  checkGrounding?: boolean;
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
    for (const item of person.questionsToAsk) {
      if (!item.text.trim().endsWith("?")) {
        errors.push("Every guidance question must be written as a question.");
      }
    }
    for (const item of [
      ...person.likelyQuestions,
      ...(person.hiringManager?.drillDowns ?? []),
    ]) {
      if (!item.prompt.trim().endsWith("?")) {
        errors.push("Every likely question and drill-down must be written as a question.");
      }
    }
  }
  errors.push(...validateCoachItems(input.guidance));
  if (input.firstName !== undefined) {
    errors.push(
      ...validateSeekerVoice({
        texts: seekerVoiceTexts(input.guidance),
        firstName: input.firstName,
      }),
    );
  }
  if (input.checkGrounding) {
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
    errors.push("Guidance did not include the requested person section.");
  }
  return [...new Set(errors)];
}

function parsedGuidance(value: unknown): ApplicationSummaryGuidance | null {
  const parsed = applicationSummaryGuidanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function personPayload(person: {
  sectionKey: string;
  roleId: string;
  contactId: string | null;
  heading: string;
  roleName: string;
  titles: string[];
  sectionKind: string;
}) {
  return {
    sectionKey: person.sectionKey,
    roleId: person.roleId,
    contactId: person.contactId,
    heading: person.heading,
    roleName: person.roleName,
    titles: person.titles,
    sectionKind: person.sectionKind,
  };
}

async function markSummaryFailed(campaignId: string, message: string) {
  await prisma.applicationSummary.update({
    where: { campaignId },
    data: { status: "FAILED", generationError: message },
  });
}

export async function generateApplicationSummary(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  sectionKey?: string | null;
}): Promise<void> {
  const data = await loadSummaryData(input.organizationId, input.campaignId);
  if (data.campaign.ownerUserId !== input.userId) {
    throw new TenantError(`Only the owner can regenerate this ${vocab.campaign.singular}.`);
  }
  const existing = parsedGuidance(data.campaign.applicationSummary?.guidanceJson);
  const profile = data.campaign.product.profileJson
    ? parseCandidateProfileSafe(data.campaign.product.profileJson)
    : null;
  const firstName = seekerFirstName(
    profile?.ok ? profile.profile.identity.name?.text ?? null : null,
  );
  const usage = {
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    category: "CONSULTATION" as const,
    operation: "APPLICATION_SUMMARY" as const,
  };

  if (input.sectionKey) {
    const requested = peopleRequestedForGeneration({
      people: data.people,
      sectionKey: input.sectionKey,
    });
    const person = data.people.find((item) => item.sectionKey === requested[0]!.sectionKey);
    if (!person) {
      throw new TenantError("That Interview cheat sheet section is not on this application.");
    }
    if (existing?.people.some((item) => item.sectionKey === person.sectionKey)) {
      return;
    }
    await prisma.applicationSummary.upsert({
      where: { campaignId: input.campaignId },
      create: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        status: existing ? "READY" : "GENERATING",
        promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
        guidanceJson: existing ?? undefined,
      },
      update: {
        generationError: null,
        promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
      },
    });
    const personSources = data.sources.filter((source) => {
      if (source.category === "LINKEDIN") {
        return person.contactId != null && source.id === `linkedin:${person.contactId}`;
      }
      if (source.category === "INTERVIEW_INTEL") {
        const notes = person.contactId
          ? data.notesByContactId.get(person.contactId) ?? []
          : [];
        return notes.some((note) => source.id === `intel:${note.id}`);
      }
      return source.category !== "LINKEDIN" && source.category !== "INTERVIEW_INTEL";
    });
    let qualityFeedback: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generated = await generateCheatSheetPersonSectionGuidance({
        sources: personSources,
        person: personPayload(person),
        qualityFeedback,
        usage,
      });
      if (!generated.ok) {
        if (attempt === 1) {
          if (!existing) await markSummaryFailed(input.campaignId, generated.message);
          throw new Error(generated.message);
        }
        continue;
      }
      const section = assignCoachItemIds({
        overview: existing?.overview,
        stories: existing?.stories ?? [],
        people: [generated.data],
      }).people[0]!;
      const next: ApplicationSummaryGuidance = {
        overview: existing?.overview,
        stories: existing?.stories ?? [],
        people: [...(existing?.people ?? []), section],
      };
      const errors = validateApplicationSummaryGuidance({
        guidance: { ...next, people: [section] },
        sources: personSources,
        people: [person],
        firstName,
      });
      if (errors.length > 0) {
        qualityFeedback = errors;
        if (attempt === 1) {
          if (!existing) {
            await markSummaryFailed(
              input.campaignId,
              `${applicationSummaryConfig.title} could not be generated. Retry.`,
            );
          }
          throw new Error(errors[0]);
        }
        continue;
      }
      await prisma.applicationSummary.update({
        where: { campaignId: input.campaignId },
        data: {
          status: "READY",
          guidanceJson: next,
          sourceHash: data.sourceHash,
          generationError: null,
          generatedAt: new Date(),
          promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
        },
      });
      return;
    }
    const message = `${applicationSummaryConfig.title} could not be generated. Retry.`;
    if (!existing) await markSummaryFailed(input.campaignId, message);
    throw new Error(message);
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
      sourceHash: null,
      generatedAt: null,
      promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
    },
  });
  let qualityFeedback: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generated = await generateApplicationSummaryShell({
      sources: data.sources.filter(
        (source) => source.category !== "LINKEDIN" && source.category !== "INTERVIEW_INTEL",
      ),
      qualityFeedback,
      usage,
    });
    if (!generated.ok) {
      if (attempt === 1) {
        await markSummaryFailed(input.campaignId, generated.message);
        throw new Error(generated.message);
      }
      continue;
    }
    const guidance = assignCoachItemIds({
      overview: generated.data.overview,
      stories: generated.data.stories,
      people: existing?.people ?? [],
    });
    const errors = validateApplicationSummaryGuidance({
      guidance: { ...guidance, people: [] },
      sources: data.sources,
      people: [],
      firstName,
    });
    if (errors.length > 0) {
      qualityFeedback = errors;
      if (attempt === 1) {
        await markSummaryFailed(
          input.campaignId,
          `${applicationSummaryConfig.title} could not be generated. Retry.`,
        );
        throw new Error(errors[0]);
      }
      continue;
    }
    await prisma.applicationSummary.update({
      where: { campaignId: input.campaignId },
      data: {
        status: "READY",
        guidanceJson: guidance,
        sourceHash: data.sourceHash,
        generationError: null,
        generatedAt: new Date(),
        promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
      },
    });
    return;
  }
  const message = `${applicationSummaryConfig.title} could not be generated. Retry.`;
  await markSummaryFailed(input.campaignId, message);
  throw new Error(message);
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
    summary: data.campaign.applicationSummary
      ? {
          ...data.campaign.applicationSummary,
          generationError: sanitizeWorkspaceFailure(
            data.campaign.applicationSummary.generationError,
          ),
        }
      : null,
    guidance: guidance?.success ? guidance.data : null,
    notesByContactId: data.notesByContactId,
    stale:
      data.campaign.applicationSummary?.status === "READY" &&
      data.campaign.applicationSummary.sourceHash !== data.sourceHash,
  };
}

export async function addCheatSheetInterviewNote(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  contactId: string;
  stageId?: string | null;
  text: string;
}) {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      ownerUserId: input.userId,
    },
    select: { id: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    select: { id: true, cheatSheetNotesJson: true },
  });
  if (!membership) {
    throw new TenantError(
      `${vocab.contact.Singular} was not found on this ${vocab.campaign.singular}.`,
    );
  }
  const notes = appendCheatSheetNote({
    existing: membership.cheatSheetNotesJson,
    text: input.text,
    stageId: input.stageId,
  });
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: { cheatSheetNotesJson: notes },
  });
  return notes;
}

function blankGuidancePath(value: unknown, path: string): unknown {
  const parts = path.replace(/^guidance\.?/, "").split(".").filter(Boolean);
  if (parts.length === 0) return value;
  const clone = structuredClone(value);
  let cursor: unknown = clone;
  for (const [index, part] of parts.entries()) {
    if (!cursor || typeof cursor !== "object") return clone;
    const key = /^\d+$/.test(part) ? Number(part) : part;
    if (index === parts.length - 1) {
      if (Array.isArray(cursor) && typeof key === "number") {
        cursor[key] = "";
      } else if (!Array.isArray(cursor)) {
        (cursor as Record<string, unknown>)[String(key)] = "";
      }
      return clone;
    }
    cursor = Array.isArray(cursor)
      ? cursor[Number(key)]
      : (cursor as Record<string, unknown>)[String(key)];
  }
  return clone;
}

export async function answerCheatSheetCoachItem(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  itemId: string;
  answer: string;
}): Promise<void> {
  const answer = input.answer.trim();
  if (!answer) {
    throw new TenantError("Write an answer, or skip the question.");
  }
  const data = await loadSummaryData(input.organizationId, input.campaignId);
  if (data.campaign.ownerUserId !== input.userId) {
    throw new TenantError(`Only the owner can update this ${vocab.campaign.singular}.`);
  }
  const parsed = applicationSummaryGuidanceSchema.safeParse(
    data.campaign.applicationSummary?.guidanceJson,
  );
  if (!parsed.success || data.campaign.applicationSummary?.status !== "READY") {
    throw new TenantError(`${applicationSummaryConfig.title} is not ready.`);
  }
  const guidance = assignCoachItemIds(parsed.data);
  const item = findCoachItem(guidance, input.itemId);
  if (!item?.harperQuestion?.trim()) {
    throw new TenantError(
      `${consultationConfig.displayName} is not asking for an answer on this item.`,
    );
  }
  const product = data.campaign.product;
  const profileParsed = product.profileJson
    ? parseCandidateProfileSafe(product.profileJson)
    : null;
  if (!profileParsed?.ok) {
    throw new TenantError(
      `The ${vocab.product.singular} could not be read, so this was not saved.`,
    );
  }
  const session =
    data.campaign.consultationSession ??
    (await prisma.consultationSession.create({
      data: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        productId: product.id,
        status: "DONE",
        generationStatus: "READY",
        promptVersion: CONSULTATION_PROMPT_VERSION,
      },
    }));
  const lastTurn = await prisma.consultationTurn.findFirst({
    where: { sessionId: session.id },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const nextSequence = (lastTurn?.sequence ?? 0) + 1;
  const targetKey = `cheatSheet:${input.itemId}`;
  const questionTurn = await prisma.consultationTurn.create({
    data: {
      organizationId: input.organizationId,
      sessionId: session.id,
      sequence: nextSequence,
      speaker: "CONSULTANT",
      body: item.harperQuestion.trim(),
      targetKey,
    },
  });
  const seekerTurn = await prisma.consultationTurn.create({
    data: {
      organizationId: input.organizationId,
      sessionId: session.id,
      sequence: nextSequence + 1,
      speaker: "SEEKER",
      body: answer,
      targetKey,
      seekerAuthored: true,
      analysisJson: { replyToTurnId: questionTurn.id, status: "READY" },
    },
  });
  const polished = await polishAnswerWithQuality({
    answer,
    story: {
      situation: answer,
      task: item.prompt,
      action: answer,
      result: answer,
    },
    sources: [
      { id: `answer:${seekerTurn.id}`, text: answer },
      ...profileEvidenceItems(profileParsed.profile)
        .filter((entry) => entry.kind === "FACT")
        .map((entry) => ({ id: entry.id, text: entry.text })),
    ],
    declinedFollowUp: false,
    strengtheningNeeds: [],
    usage: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      category: "CONSULTATION",
      operation: "CONSULTATION_REPLY",
    },
  });
  if (!polished.ok) {
    throw new TenantError(polished.message);
  }
  const sampleAnswer = polished.data.interviewAnswer.text.trim();
  if (!sampleAnswer) {
    throw new TenantError(consultationConversationCopy.generationFailed);
  }
  const nextProfile = appendConfirmedFact(profileParsed.profile, {
    id: `cheatSheet:${input.itemId}`,
    text: answer,
    turnId: seekerTurn.id,
  });
  const existingStory = await prisma.profileStory.findFirst({
    where: {
      organizationId: input.organizationId,
      consultationTurnId: seekerTurn.id,
    },
    select: { id: true },
  });
  const now = new Date();
  const storyData = {
    situation: answer,
    task: item.prompt,
    action: answer,
    result: answer,
    competencyLinks: [] as Prisma.InputJsonValue,
    verbatimAnswer: answer,
    interviewAnswer: sampleAnswer,
    interviewAnswerApprovedAt: now,
    resumeBullet: polished.data.resumeBullet.text.trim() || null,
    resumeBulletApprovedAt: polished.data.resumeBullet.text.trim() ? now : null,
    seekerAuthored: true,
  };
  const nextGuidance = replaceCoachItem(guidance, input.itemId, {
    ...item,
    sampleAnswer,
    harperQuestion: null,
    supports: [
      ...item.supports,
      { sourceId: `answer:${seekerTurn.id}`, quote: answer },
    ],
  });
  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: { profileJson: nextProfile as unknown as Prisma.InputJsonValue },
    }),
    existingStory
      ? prisma.profileStory.update({
          where: { id: existingStory.id },
          data: storyData,
        })
      : prisma.profileStory.create({
          data: {
            organizationId: input.organizationId,
            productId: product.id,
            consultationTurnId: seekerTurn.id,
            ...storyData,
          },
        }),
    prisma.consultationStatement.upsert({
      where: {
        turnId_kind: { turnId: seekerTurn.id, kind: "INTERVIEW_ANSWER" },
      },
      create: {
        organizationId: input.organizationId,
        sessionId: session.id,
        turnId: seekerTurn.id,
        kind: "INTERVIEW_ANSWER",
        content: sampleAnswer,
        status: "APPROVED",
        groundingJson: polished.data.interviewAnswer.claims as Prisma.InputJsonValue,
        promptVersion: CONSULTATION_PROMPT_VERSION,
        approvedAt: now,
      },
      update: {
        content: sampleAnswer,
        status: "APPROVED",
        groundingJson: polished.data.interviewAnswer.claims as Prisma.InputJsonValue,
        approvedAt: now,
      },
    }),
    prisma.applicationSummary.update({
      where: { campaignId: input.campaignId },
      data: { guidanceJson: nextGuidance },
    }),
  ]);
}

export async function resolveApplicationSummaryFlag(input: {
  organizationId: string;
  campaignId: string;
  claimId: string;
  action: "KEPT" | "REMOVED";
}): Promise<void> {
  const summary = await prisma.applicationSummary.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!summary) throw new TenantError(`${applicationSummaryConfig.title} was not found.`);
  await prisma.applicationSummary.update({
    where: { campaignId: input.campaignId },
    data: {
      guidanceJson:
        input.action === "REMOVED"
          ? (blankGuidancePath(summary.guidanceJson, input.claimId) as object)
          : undefined,
    },
  });
}

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  generateApplicationSummaryShell,
  generateCheatSheetPersonSectionGuidance,
} from "@/lib/application-summary/ai";
import { buildApplicationSummaryGuidanceMessages } from "@/lib/application-summary/prompt";
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
} from "@/lib/application-summary/coach";
import {
  harperAlreadyAskedCareerWalkThrough,
  mergePersonLikelyQuestions,
  personLikelyQuestionCountDecision,
  resolvePersonLikelyQuestions,
  seekerKeptLikelyQuestionIds,
  validatePersonSectionLikelyQuestions,
} from "@/lib/application-summary/likely-questions";
import { loadOrderedAnsweredHarperQuestions } from "@/lib/consultation/harper-display-qa";
import { isApplicationLearningsSourceId } from "@/lib/consultation/learnings";
import {
  approveConsultationStatement,
  recordConsultationReply,
  regenerateConsultationStatement,
} from "@/lib/consultation/service";
import {
  CHEAT_SHEET_TARGET_PREFIX,
  CONSULTATION_PROMPT_VERSION,
} from "@/lib/consultation/contract";
import {
  individualProfileRecordSchema,
  interviewerWorkExperience,
} from "@/lib/contact-profile/contract";
import { parseLinkedInExtracted } from "@/lib/contact-profile/service";
import {
  isWhyThisCompanyFactId,
  profileEvidenceForApplication,
  whyThisCompanyFactId,
} from "@/lib/consultation/assess";
import {
  deriveCareerStage,
  type CareerStage,
} from "@/lib/consultation/career-stage";
import { prisma } from "@/lib/prisma-client";
import { isHiringTeamPersonaBuilt } from "@/lib/hiring-team/build";
import {
  buildCheatSheetPeople,
  cheatSheetPersonSectionInputHash,
  cheatSheetSectionKind,
  interviewerContactIdsFrom,
  personSectionNeedsGeneration,
  type CheatSheetGeneralQuestionInput,
  type CheatSheetInterviewerContext,
} from "@/lib/application-summary/people";
import { listPersonPreps } from "@/lib/interview/person-prep";
import { prepareInterviewPrepGuideGeneration } from "@/lib/interview/prep-guide";
import {
  applicationSummaryConfig,
  consultationConfig,
  sanitizeWorkspaceFailure,
  vocab,
} from "@/lib/product-config";
import {
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";
import { loadApplicationEmployerResearch } from "@/lib/application/employer-research-reader";

export type SummarySource = {
  id: string;
  text: string;
  category: string;
};

/** Sources that belong to one person and never reach another person's section. */
const PER_PERSON_SOURCE_CATEGORIES = new Set([
  "LINKEDIN",
  "INTERVIEW_INTEL",
  "INTERVIEWER_PATTERN",
  "INTERVIEWER_OWN",
  "INTERVIEWER_PROFILE",
  "PERSONA",
  "PERSON_PREP",
]);

export function sourcesForPersonSection(input: {
  sources: SummarySource[];
  contactId: string | null;
  roleId: string;
  noteIds: string[];
  /** When false, shared application learnings are excluded (cost guard / HM-only). */
  includeApplicationLearnings?: boolean;
}): SummarySource[] {
  const includeLearnings = input.includeApplicationLearnings !== false;
  return input.sources.filter((source) => {
    if (source.category === "PERSONA") {
      return source.id.startsWith(`persona:${input.roleId}:`);
    }
    if (source.category === "LINKEDIN") {
      return input.contactId != null && source.id === `linkedin:${input.contactId}`;
    }
    if (source.category === "INTERVIEW_INTEL") {
      return input.noteIds.some((noteId) => source.id === `intel:${noteId}`);
    }
    if (source.category === "INTERVIEWER_PATTERN") {
      return (
        input.contactId != null &&
        source.id.startsWith(`interviewer-pattern:${input.contactId}:`)
      );
    }
    if (source.category === "INTERVIEWER_OWN") {
      return (
        input.contactId != null &&
        source.id.startsWith(`interviewer-own:${input.contactId}:`)
      );
    }
    if (source.category === "INTERVIEWER_PROFILE") {
      return (
        input.contactId != null &&
        source.id.startsWith(`interviewer-profile:${input.contactId}:`)
      );
    }
    if (source.category === "PERSON_PREP") {
      return (
        input.contactId != null &&
        source.id.startsWith(`person-prep:${input.contactId}:`)
      );
    }
    if (isApplicationLearningsSourceId(source.id)) {
      return includeLearnings;
    }
    return !PER_PERSON_SOURCE_CATEGORIES.has(source.category);
  });
}

function careerStageFromProfileJson(profileJson: unknown): CareerStage {
  const parsed = profileJson
    ? parseCandidateProfileSafe(profileJson)
    : null;
  if (!parsed?.ok) {
    return deriveCareerStage({ experience: [], education: [] });
  }
  return deriveCareerStage(parsed.profile);
}

export async function personSectionInputsUnchanged(input: {
  organizationId: string;
  campaignId: string;
  sectionKey: string;
}): Promise<boolean> {
  const data = await loadSummaryData(input.organizationId, input.campaignId);
  const existing = parsedGuidance(data.campaign.applicationSummary?.guidanceJson);
  const person = data.people.find((item) => item.sectionKey === input.sectionKey);
  if (!person || !existing) return false;
  const existingPerson = existing.people.find(
    (item) => item.sectionKey === input.sectionKey,
  );
  if (!existingPerson || personSectionNeedsGeneration(existingPerson)) {
    return false;
  }
  const personSources = sourcesForPersonSection({
    sources: data.sources,
    contactId: person.contactId,
    roleId: person.roleId,
    noteIds: (person.contactId
      ? data.notesByContactId.get(person.contactId) ?? []
      : []
    ).map((note) => note.id),
    includeApplicationLearnings: person.sectionKind === "HIRING_MANAGER",
  });
  const careerStage = careerStageFromProfileJson(data.campaign.product.profileJson);
  const generalQuestions = await generalQuestionsForPersonSection(
    input.organizationId,
    input.campaignId,
  );
  const interviewer = interviewerContextForPerson(person, data.roles);
  const inputHash = cheatSheetPersonSectionInputHash({
    person: personPayload(person),
    sources: personSources,
    careerStage,
    generalQuestions,
    interviewer,
  });
  return existingPerson.inputHash === inputHash;
}

/**
 * True when clicking regenerate would not rebuild the shell overview or any
 * person section (receipt + person input hashes all match).
 */
export async function applicationSummaryNothingToRebuild(input: {
  organizationId: string;
  campaignId: string;
  sectionKey?: string | null;
}): Promise<boolean> {
  if (input.sectionKey) {
    return personSectionInputsUnchanged({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sectionKey: input.sectionKey,
    });
  }

  const data = await loadSummaryData(input.organizationId, input.campaignId);
  const existing = parsedGuidance(data.campaign.applicationSummary?.guidanceJson);
  if (!existing?.overview) return false;

  const {
    APPLICATION_SUMMARY_SHELL_OPERATION,
    applicationSummaryShellFingerprint,
  } = await import("@/lib/application-summary/shell-gate");
  const { findPaidCallReceipt } = await import("@/lib/ai/paid-call-gate");
  const fingerprint = applicationSummaryShellFingerprint(
    sourcesForShell(data.sources),
  );
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: APPLICATION_SUMMARY_SHELL_OPERATION,
    subjectKey: input.campaignId,
  });
  if (!receipt || receipt.inputHash !== fingerprint) return false;

  for (const person of data.people) {
    if (!person.contactId || !person.personaBuilt) continue;
    const unchanged = await personSectionInputsUnchanged({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sectionKey: person.sectionKey,
    });
    if (!unchanged) return false;
  }
  return true;
}

const SHELL_EXCLUDED_SOURCE_CATEGORIES = new Set([
  ...PER_PERSON_SOURCE_CATEGORIES,
  "ASSESSMENT",
]);

export function sourcesForShell(sources: SummarySource[]): SummarySource[] {
  return sources.filter(
    (source) => !SHELL_EXCLUDED_SOURCE_CATEGORIES.has(source.category),
  );
}

/** Cheat Sheet overview messages. Reads stored sources; writes nothing. */
export async function applicationSummaryShellModelMessages(input: {
  organizationId: string;
  campaignId: string;
}) {
  const data = await loadSummaryData(input.organizationId, input.campaignId);
  return buildApplicationSummaryGuidanceMessages({
    sources: sourcesForShell(data.sources),
    people: [],
    mode: "shell",
  });
}

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

/** What their work experience shows they are likely to value. Empty when too thin to read. */
function interviewerPatterns(individualProfileJson: unknown): string[] {
  const parsed = individualProfileRecordSchema.safeParse(individualProfileJson);
  if (!parsed.success) return [];
  return parsed.data.likelyToValue.map((item) => item.text);
}

function interviewerOwnPersona(individualProfileJson: unknown): string[] {
  const parsed = individualProfileRecordSchema.safeParse(individualProfileJson);
  if (!parsed.success) return [];
  return [
    ...parsed.data.caresAbout.map((item) => item.text),
    ...parsed.data.talkingPoints.map((item) => item.text),
  ];
}

function interviewerProfileDetails(extractedJson: unknown): string[] {
  const extracted = parseLinkedInExtracted(extractedJson);
  if (!extracted) return [];
  const experience = interviewerWorkExperience(extracted);
  return [
    extracted.headline?.text,
    extracted.about?.text,
    extracted.currentTitle?.text,
    extracted.currentEmployer?.text,
    ...experience.flatMap((role) => [
      [role.title?.text, role.employer?.text, role.dates?.text].filter(Boolean).join(" · "),
      role.description?.text,
      ...role.accomplishments.map((item) => item.text),
    ]),
    ...extracted.statedFocus.map((item) => item.text),
  ].filter((text): text is string => Boolean(text?.trim()));
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
        include: {
          guide: { select: { id: true, status: true, updatedAt: true } },
          interviewers: { select: { contactId: true } },
        },
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
  const research = await loadApplicationEmployerResearch({
    organizationId,
    campaignId,
  });
  const roles = campaign.hiringTeamRoles.map((role) => ({
    id: role.id,
    name: role.name,
    definition: role.definition,
    responsibilities: role.responsibilities,
    likelyTitles: parseStringArray(role.targetTitles),
    suggestionKey: role.suggestionKey,
    reason: role.whyThisPersonaMatters,
    updatedAt: role.updatedAt,
    cheatSheetActivatedAt: role.cheatSheetActivatedAt,
    ...personaNarrative(role.profileJson),
  }));
  const interviewerContactIds = interviewerContactIdsFrom({
    stageInterviewerIds: campaign.interviewStages.flatMap((stage) =>
      stage.interviewers.map((row) => row.contactId),
    ),
    contacts: campaign.contacts.map((row) => ({
      contactId: row.contactId,
      personPrepOfferedAt: row.personPrepOfferedAt,
    })),
  });
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
    interviewerContactIds,
    activatedRoles: roles
      .filter((role) => role.cheatSheetActivatedAt)
      .map((role) => ({
        id: role.id,
        name: role.name,
        titles: role.likelyTitles,
        involvement: role.involvement,
        suggestionKey: role.suggestionKey,
      })),
  }).map((person) => {
    const role = campaign.hiringTeamRoles.find((item) => item.id === person.roleId);
    return {
      ...person,
      sectionKind: cheatSheetSectionKind(person),
      personaBuilt: isHiringTeamPersonaBuilt(role ?? {}),
    };
  });
  const personPreps = await listPersonPreps({ organizationId, campaignId });
  const sourceFingerprint = {
    requirement: [
      campaign.jobRequirement.id,
      campaign.jobRequirement.updatedAt.toISOString(),
      campaign.jobRequirement.seekerLearnedNotes,
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
      stage.notesBefore,
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
    const scoped = profileEvidenceForApplication(profile.profile, {
      campaignId: campaign.id,
      whyThisCompany: campaign.whyThisCompany,
    });
    for (const item of scoped) {
      if (item.kind === "FACT" && !isWhyThisCompanyFactId(item.id)) {
        appendSource(sources, `profile:${item.id}`, item.text, "SEEKER");
      }
    }
    const ownWhy = scoped.find(
      (item) => item.id === whyThisCompanyFactId(campaign.id),
    );
    appendSource(
      sources,
      "seeker:why-this-company",
      ownWhy?.text ?? campaign.whyThisCompany,
      "SEEKER",
    );
  } else {
    appendSource(
      sources,
      "seeker:why-this-company",
      campaign.whyThisCompany,
      "SEEKER",
    );
  }
  const requirement = campaign.jobRequirement;
  appendSource(sources, "job:title", requirement.title, "JOB");
  appendSource(sources, "job:reporting-line", requirement.reportingLine, "JOB");
  appendSource(sources, "job:location", requirement.location, "JOB");
  appendSource(sources, "job:work-arrangement", requirement.workArrangement, "JOB");
  appendSource(sources, "job:posting", requirement.rawText, "JOB");
  for (const [index, item] of parseStringArray(requirement.requiredItems).entries()) {
    appendSource(sources, `job:required:${index}`, item, "JOB");
  }
  for (const [index, item] of parseStringArray(requirement.responsibilities).entries()) {
    appendSource(sources, `job:responsibility:${index}`, item, "JOB");
  }
  for (const [index, item] of parseStringArray(requirement.preferredItems).entries()) {
    appendSource(sources, `job:preferred:${index}`, item, "JOB");
  }
  const scorecard = requirement.scorecardJson;
  if (scorecard && typeof scorecard === "object") {
    const card = scorecard as {
      mission?: { text?: unknown };
      outcomes?: Array<{ text?: unknown }>;
    };
    if (typeof card.mission?.text === "string") {
      appendSource(sources, "job:mission", card.mission.text, "JOB");
    }
    for (const [index, outcome] of (card.outcomes ?? []).entries()) {
      if (typeof outcome?.text === "string") {
        appendSource(sources, `job:outcome:${index}`, outcome.text, "JOB");
      }
    }
  }
  appendSource(
    sources,
    "job:learned-notes",
    requirement.seekerLearnedNotes,
    "SEEKER",
  );
  for (const stage of campaign.interviewStages) {
    appendSource(
      sources,
      `interview:${stage.id}:notesBefore`,
      stage.notesBefore,
      "JOB",
    );
    appendSource(
      sources,
      `interview:${stage.id}:notesAfter`,
      stage.notesAfter,
      "JOB",
    );
  }
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
    appendSource(sources, "research:job-focus", research.jobFocus, "COMPANY");
    appendSource(
      sources,
      "research:job-focus-detail",
      research.jobFocusDetail,
      "COMPANY",
    );
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
    for (const [index, item] of interviewerPatterns(
      row.individualProfileJson,
    ).entries()) {
      appendSource(
        sources,
        `interviewer-pattern:${row.contactId}:${index}`,
        item,
        "INTERVIEWER_PATTERN",
      );
    }
    for (const [index, item] of interviewerOwnPersona(
      row.individualProfileJson,
    ).entries()) {
      appendSource(
        sources,
        `interviewer-own:${row.contactId}:${index}`,
        item,
        "INTERVIEWER_OWN",
      );
    }
    for (const [index, item] of interviewerProfileDetails(
      row.linkedInExtractedJson,
    ).entries()) {
      appendSource(
        sources,
        `interviewer-profile:${row.contactId}:${index}`,
        item,
        "INTERVIEWER_PROFILE",
      );
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

export function storyTextsRepeatVerbatim(guidance: ApplicationSummaryGuidance): boolean {
  const bodies = (guidance.stories ?? []).flatMap((story) => [
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
  firstName?: string | null;
  checkGrounding?: boolean;
}): string[] {
  void input;
  return [];
}

function parsedGuidance(value: unknown): ApplicationSummaryGuidance | null {
  const parsed = applicationSummaryGuidanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function jsonGuidance(value: ApplicationSummaryGuidance): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

async function generalQuestionsForPersonSection(
  organizationId: string,
  campaignId: string,
): Promise<CheatSheetGeneralQuestionInput[]> {
  const loaded = await loadOrderedAnsweredHarperQuestions({
    organizationId,
    campaignId,
  });
  return loaded.generalQuestions.map((item) => ({
    id: item.questionTurnId,
    text: item.question,
    interviewTypeTag: item.interviewTypeTag ?? null,
    targetKey: item.targetKey,
  }));
}

function interviewerContextForPerson(
  person: { roleId: string; roleName: string; titles: string[] },
  roles: Array<{
    id: string;
    definition?: string | null;
    responsibilities?: string | null;
    overview?: string | null;
    concerns?: string[];
  }>,
): CheatSheetInterviewerContext {
  const role = roles.find((item) => item.id === person.roleId);
  const persona = [role?.definition?.trim(), role?.overview?.trim()]
    .filter((part): part is string => Boolean(part))
    .join("\n");
  return {
    hiringTeamRole: person.roleName,
    title: person.titles.map((title) => title.trim()).filter(Boolean).join(", "),
    persona,
    responsibilities: role?.responsibilities?.trim() ?? "",
    caresAbout: role?.concerns ?? [],
  };
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

async function loadSeekerKeptLikelyQuestionIds(input: {
  organizationId: string;
  campaignId: string;
  questionIds: string[];
}): Promise<Set<string>> {
  if (input.questionIds.length === 0) return new Set();
  const targetKeys = input.questionIds.map(
    (id) => `${CHEAT_SHEET_TARGET_PREFIX}${id}`,
  );
  const turns = await prisma.consultationTurn.findMany({
    where: {
      organizationId: input.organizationId,
      session: {
        campaignId: input.campaignId,
        organizationId: input.organizationId,
      },
      targetKey: { in: targetKeys },
    },
    select: {
      id: true,
      speaker: true,
      targetKey: true,
      analysisJson: true,
      skipped: true,
    },
  });
  const consultantTurnIds = turns
    .filter((turn) => turn.speaker === "CONSULTANT")
    .map((turn) => turn.id);
  const statements =
    consultantTurnIds.length === 0
      ? []
      : await prisma.consultationStatement.findMany({
          where: {
            turnId: { in: consultantTurnIds },
            kind: "INTERVIEW_ANSWER",
          },
          select: { turnId: true, kind: true },
        });
  return seekerKeptLikelyQuestionIds({
    questionIds: input.questionIds,
    turns,
    statements,
  });
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
  const actorId = input.userId || data.campaign.ownerUserId;
  if (data.campaign.ownerUserId !== actorId) {
    throw new TenantError(`Only the owner can regenerate this ${vocab.campaign.singular}.`);
  }
  const existing = parsedGuidance(data.campaign.applicationSummary?.guidanceJson);
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
      throw new TenantError("That Interview Preparation Guides section is not on this application.");
    }
    if (person.contactId && !person.personaBuilt) {
      await prepareInterviewPrepGuideGeneration({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        personaId: person.roleId,
        personaBuilt: false,
      });
      return generateApplicationSummary(input);
    }
    await prisma.applicationSummary.upsert({
      where: { campaignId: input.campaignId },
      create: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        status: "READY",
        promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
        guidanceJson: existing ? jsonGuidance(existing) : undefined,
      },
      update: {
        generationError: null,
        promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
      },
    });
    const personSources = sourcesForPersonSection({
      sources: data.sources,
      contactId: person.contactId,
      roleId: person.roleId,
      noteIds: (person.contactId
        ? data.notesByContactId.get(person.contactId) ?? []
        : []
      ).map((note) => note.id),
      includeApplicationLearnings: person.sectionKind === "HIRING_MANAGER",
    });
    const careerStage = careerStageFromProfileJson(data.campaign.product.profileJson);
    const generalQuestions = await generalQuestionsForPersonSection(
      input.organizationId,
      input.campaignId,
    );
    const interviewer = interviewerContextForPerson(person, data.roles);
    const inputHash = cheatSheetPersonSectionInputHash({
      person: personPayload(person),
      sources: personSources,
      careerStage,
      generalQuestions,
      interviewer,
    });
    const existingPerson = existing?.people.find(
      (item) => item.sectionKey === person.sectionKey,
    );
    if (
      existingPerson &&
      existingPerson.inputHash === inputHash &&
      !personSectionNeedsGeneration(existingPerson)
    ) {
      return;
    }
    const seekerKeptIds = await loadSeekerKeptLikelyQuestionIds({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      questionIds: (existingPerson?.likelyQuestions ?? [])
        .map((item) => item.id?.trim() ?? "")
        .filter(Boolean),
    });
    const consultantTurns = await prisma.consultationTurn.findMany({
      where: {
        session: { campaignId: input.campaignId, organizationId: input.organizationId },
        speaker: "CONSULTANT",
      },
      select: { speaker: true, targetKey: true, body: true },
    });
    const harperAskedCareerWalkThrough =
      harperAlreadyAskedCareerWalkThrough(consultantTurns);
    let qualityFeedback: string[] = [];
    let failureCause = "Person section did not meet the guide requirements.";
    type GeneratedSection = Extract<
      Awaited<ReturnType<typeof generateCheatSheetPersonSectionGuidance>>,
      { ok: true }
    >["data"];
    let best: {
      data: GeneratedSection;
      likelyQuestions: CheatSheetCoachItem[];
    } | null = null;
    const saveSection = async (
      generatedData: GeneratedSection,
      likelyQuestions: CheatSheetCoachItem[],
    ) => {
      const mergedLikelyQuestions = mergePersonLikelyQuestions({
        existing: existingPerson?.likelyQuestions ?? [],
        incoming: likelyQuestions,
        seekerKeptIds,
      });
      const section = {
        ...assignCoachItemIds({
          overview: existing?.overview,
          stories: existing?.stories ?? [],
          people: [
            {
              ...generatedData,
              likelyQuestions: mergedLikelyQuestions,
              bestMaterial: [],
              storyIds: [],
            },
          ],
        }).people[0]!,
        inputHash,
      };
      const next: ApplicationSummaryGuidance = {
        overview: existing?.overview,
        stories: existing?.stories ?? [],
        people: [
          ...(existing?.people ?? []).filter((item) => item.sectionKey !== person.sectionKey),
          section,
        ],
      };
      await prisma.applicationSummary.update({
        where: { campaignId: input.campaignId },
        data: {
          status: "READY",
          guidanceJson: jsonGuidance(next),
          sourceHash: data.sourceHash,
          generationError: null,
          generatedAt: new Date(),
          promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
        },
      });
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generated = await generateCheatSheetPersonSectionGuidance({
        sources: personSources,
        person: personPayload(person),
        careerStage,
        qualityFeedback,
        usage,
        generalQuestions,
        interviewer,
      });
      if (!generated.ok) {
        failureCause = generated.cause;
        if (attempt === 1) break;
        continue;
      }
      const resolved = resolvePersonLikelyQuestions({
        likelyQuestions: generated.data.likelyQuestions,
        harperAskedCareerWalkThrough,
        generalQuestions,
      });
      const likelyQuestions = resolved.items;
      const decision = personLikelyQuestionCountDecision(likelyQuestions.length, attempt);
      const partIssues =
        likelyQuestions.length >= 4
          ? validatePersonSectionLikelyQuestions({ likelyQuestions })
          : [];
      if (
        likelyQuestions.length > 0 &&
        likelyQuestions.length <= 12 &&
        partIssues.length === 0
      ) {
        if (!best || likelyQuestions.length > best.likelyQuestions.length) {
          best = { data: generated.data, likelyQuestions };
        }
      }
      if (decision === "save" && partIssues.length === 0) {
        await saveSection(generated.data, likelyQuestions);
        return;
      }
      if (decision === "accept-short" && best) {
        await saveSection(best.data, best.likelyQuestions);
        return;
      }
      qualityFeedback = [
        ...(likelyQuestions.length < 4
          ? [
              "Return between 4 and 12 likely questions in total, ranked from most to least likely.",
            ]
          : []),
        ...(resolved.unusedReferenceIds.length > 0
          ? [
              "A reference to a General question id that was not supplied was not used. Reference only the supplied ids.",
            ]
          : []),
        ...(likelyQuestions.length === 0
          ? [
              "Keep at least one likelyQuestions item that is not a duplicate career walk-through.",
            ]
          : []),
        ...partIssues,
      ];
    }
    if (best && best.likelyQuestions.length > 0 && best.likelyQuestions.length < 4) {
      await saveSection(best.data, best.likelyQuestions);
      return;
    }
    throw new Error(failureCause);
  }

  const shellSources = sourcesForShell(data.sources);
  // Worker second line: unchanged shell inputs → keep overview, no paid call.
  if (existing?.overview) {
    const {
      APPLICATION_SUMMARY_SHELL_OPERATION,
      applicationSummaryShellFingerprint,
    } = await import("@/lib/application-summary/shell-gate");
    const { findPaidCallReceipt } = await import("@/lib/ai/paid-call-gate");
    const fingerprint = applicationSummaryShellFingerprint(shellSources);
    const receipt = await findPaidCallReceipt({
      organizationId: input.organizationId,
      operation: APPLICATION_SUMMARY_SHELL_OPERATION,
      subjectKey: input.campaignId,
    });
    if (receipt && receipt.inputHash === fingerprint) {
      await prisma.applicationSummary.update({
        where: { campaignId: input.campaignId },
        data: {
          status: "READY",
          sourceHash: data.sourceHash,
          generationError: null,
          promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
        },
      });
      return;
    }
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generated = await generateApplicationSummaryShell({
      sources: shellSources,
      usage,
    });
    if (!generated.ok) {
      if (attempt === 1) {
        await markSummaryFailed(input.campaignId, generated.message);
        throw new Error(generated.cause);
      }
      continue;
    }
    const guidance = assignCoachItemIds({
      overview: {
        ...generated.data.overview,
        gapsToPrepare: [],
      },
      stories: existing?.stories ?? [],
      people: existing?.people ?? [],
    });
    await prisma.applicationSummary.update({
      where: { campaignId: input.campaignId },
      data: {
        status: "READY",
        guidanceJson: jsonGuidance(guidance),
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
  throw new Error("Interview Preparation Guides overview did not return a usable result.");
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

async function ensureCheatSheetConsultantTurn(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  itemId: string;
}): Promise<{
  sessionId: string;
  questionTurnId: string;
  targetKey: string;
  sampleAnswer: string;
}> {
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
  const questionText = item?.harperQuestion?.trim() || item?.prompt.trim() || "";
  if (!item || !questionText) {
    throw new TenantError(
      `${consultationConfig.displayName} is not asking for an answer on this item.`,
    );
  }
  const product = data.campaign.product;
  const session =
    data.campaign.consultationSession ??
    (await prisma.consultationSession.create({
      data: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        productId: product.id,
        status: "IN_PROGRESS",
        generationStatus: "READY",
        promptVersion: CONSULTATION_PROMPT_VERSION,
      },
    }));
  const targetKey = `cheatSheet:${input.itemId}`;
  let questionTurn = await prisma.consultationTurn.findFirst({
    where: {
      sessionId: session.id,
      speaker: "CONSULTANT",
      targetKey,
    },
    select: { id: true },
  });
  if (!questionTurn) {
    const lastTurn = await prisma.consultationTurn.findFirst({
      where: { sessionId: session.id },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    questionTurn = await prisma.consultationTurn.create({
      data: {
        organizationId: input.organizationId,
        sessionId: session.id,
        sequence: (lastTurn?.sequence ?? 0) + 1,
        speaker: "CONSULTANT",
        body: questionText,
        targetKey,
        followUp: false,
      },
      select: { id: true },
    });
  }
  return {
    sessionId: session.id,
    questionTurnId: questionTurn.id,
    targetKey,
    sampleAnswer: item.sampleAnswer?.trim() ?? "",
  };
}

async function storeCheatSheetSampleStatement(input: {
  organizationId: string;
  sessionId: string;
  questionTurnId: string;
  content: string;
}): Promise<string> {
  const statement = await prisma.consultationStatement.upsert({
    where: {
      turnId_kind: { turnId: input.questionTurnId, kind: "INTERVIEW_ANSWER" },
    },
    create: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      turnId: input.questionTurnId,
      kind: "INTERVIEW_ANSWER",
      status: "DRAFT",
      content: input.content,
      groundingJson: [],
      promptVersion: CONSULTATION_PROMPT_VERSION,
    },
    update: {
      content: input.content,
      status: "DRAFT",
      approvedAt: null,
    },
    select: { id: true },
  });
  return statement.id;
}

export async function answerCheatSheetCoachItem(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  itemId: string;
  answer: string;
}): Promise<{ unchanged: boolean }> {
  const answer = input.answer.trim();
  if (!answer) {
    throw new TenantError("Write an answer, or skip the question.");
  }
  const prepared = await ensureCheatSheetConsultantTurn(input);
  const recorded = await recordConsultationReply({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    targetKey: prepared.targetKey,
    answer,
    intent: "REPLY",
  });
  return { unchanged: recorded.unchanged === true };
}

/** Stores the generated sample exactly, then Harper's existing approve path. No model call. */
export async function approveCheatSheetSampleAnswer(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  itemId: string;
}): Promise<void> {
  const prepared = await ensureCheatSheetConsultantTurn(input);
  if (!prepared.sampleAnswer) {
    throw new TenantError("That sample answer was not found.");
  }
  const statementId = await storeCheatSheetSampleStatement({
    organizationId: input.organizationId,
    sessionId: prepared.sessionId,
    questionTurnId: prepared.questionTurnId,
    content: prepared.sampleAnswer,
  });
  await approveConsultationStatement({
    organizationId: input.organizationId,
    statementId,
    content: prepared.sampleAnswer,
  });
}

/**
 * Stores the sample as a draft, then uses Harper's existing statement
 * regenerate. The click is what asks for a new draft. Page render does not.
 */
export async function regenerateCheatSheetSampleAnswer(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  itemId: string;
  content: string;
}): Promise<{ polished: boolean }> {
  await saveCheatSheetSampleDraft(input);
  const prepared = await ensureCheatSheetConsultantTurn(input);
  const statement = await prisma.consultationStatement.findFirst({
    where: {
      organizationId: input.organizationId,
      turnId: prepared.questionTurnId,
      kind: "INTERVIEW_ANSWER",
    },
    select: { id: true },
  });
  if (!statement) throw new TenantError("That polished statement was not found.");
  return regenerateConsultationStatement({
    organizationId: input.organizationId,
    statementId: statement.id,
  });
}

/** Saves edited sample text as a draft statement. No model call and no job. */
export async function saveCheatSheetSampleDraft(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  itemId: string;
  content: string;
}): Promise<void> {
  const content = input.content.trim();
  if (!content) throw new TenantError("Write an answer, or skip the question.");
  const prepared = await ensureCheatSheetConsultantTurn(input);
  await storeCheatSheetSampleStatement({
    organizationId: input.organizationId,
    sessionId: prepared.sessionId,
    questionTurnId: prepared.questionTurnId,
    content,
  });
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

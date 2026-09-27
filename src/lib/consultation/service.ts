import { Prisma } from "@prisma/client";
import type { JobScorecard, ScorecardItem } from "@/lib/job-requirement/types";
import {
  planConsultationWithModel,
  extractWithModel,
  polishAnswerWithModel,
} from "@/lib/consultation/ai";
import {
  evidenceTargets,
  gapsAreCovered,
  isStandingRequirement,
  profileEvidenceItems,
  verifyModelAssessments,
  type EvidenceAssessment,
  type EvidenceTarget,
} from "@/lib/consultation/assess";
import {
  CONSULTATION_PROMPT_VERSION,
  WHY_THIS_COMPANY_TARGET_KEY,
  isConsultationExtractAnswer,
  isConsultationExtractFeedback,
  type CoachHiringTeamRole,
  type ConsultationExtractResult,
  type InterviewerPrepPayload,
  type SeekerStatedFactPayload,
} from "@/lib/consultation/contract";
import {
  loadCoachCompanyResearch,
  loadCoachHiringTeam,
} from "@/lib/consultation/hiring-team-context";
import type { AiCallUsageContext } from "@/lib/ai/types";
import {
  askedQuestionsFromTurns,
  matchConsultationFocus,
  planQuestionRound,
  questionDuplicatesAsked,
  questionNeedsRoleSource,
  seniorityWarrantsChronology,
  type QuestionRoundPlan,
} from "@/lib/consultation/questions";
import {
  cannedWordingRepairedAt,
  looksLikeCannedHarperText,
  repairExistingConsultationSession,
} from "@/lib/consultation/repair-existing";
import { SEEKER_STATED_FACT_ID } from "@/lib/product-research/seeker-background";
import { type GroundingSource } from "@/lib/consultation/output-quality";
import {
  buildConsultationQaView,
  consultationFollowUpCount,
  consultationHasUnansweredQuestions,
  consultationQuestionAcceptsReply,
  consultationReplyTargetKey,
  findConsultationQaItem,
  parseConsultationReplyTarget,
  replyToTurnIdFromAnalysis,
  resolveReplyableQaItem,
  type ConsultationQaItem,
  type QaStatement,
  type QaTurn,
} from "@/lib/consultation/qa-view";
import {
  consultationItemNeedsResultRepair,
  isRawSeekerResult,
} from "@/lib/consultation/results";
import { nextConsultationStatus } from "@/lib/consultation/state";
import {
  harperCoachingVoiceViolations,
  seekerFirstName,
  seekerPrepInstructionViolations,
  talkTrackVoiceViolations,
} from "@/lib/consultation/voice";
import {
  appendConfirmedFact,
  proposalsFromExtraction,
} from "@/lib/consultation/write-back";
import { prisma } from "@/lib/prisma-client";
import {
  consultationConfig,
  consultationConversationCopy,
  vocab,
} from "@/lib/product-config";
import {
  emptyCandidateProfile,
  parseCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
import { persistExtractedExperienceDates } from "@/lib/product-research/restore-role-dates";
import { persistExtractedContactDetails } from "@/lib/product-research/restore-contact-details";
import {
  contactIdFromPersonPrepTarget,
  personPrepTargetKey,
} from "@/lib/interview/person-prep";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";

function readScorecard(value: unknown): JobScorecard {
  if (!value || typeof value !== "object") {
    return { mission: null, outcomes: [], competencies: [] };
  }
  const row = value as Partial<JobScorecard>;
  const item = (entry: unknown): ScorecardItem | null => {
    if (!entry || typeof entry !== "object") return null;
    const candidate = entry as Partial<ScorecardItem>;
    if (typeof candidate.text !== "string" || !candidate.text.trim()) return null;
    if (typeof candidate.id !== "string" || !candidate.id.trim()) return null;
    return {
      id: candidate.id,
      text: candidate.text,
      inferred: candidate.inferred === true,
    };
  };
  return {
    mission: item(row.mission),
    outcomes: Array.isArray(row.outcomes)
      ? row.outcomes.map(item).filter((entry): entry is ScorecardItem => Boolean(entry))
      : [],
    competencies: Array.isArray(row.competencies)
      ? row.competencies.map(item).filter((entry): entry is ScorecardItem => Boolean(entry))
      : [],
  };
}

async function requireApplication(organizationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true, productId: true, whyThisCompany: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId, organizationId },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement yet.`,
    );
  }
  const product = await prisma.product.findFirst({
    where: { id: campaign.productId, organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} was not found.`);
  }
  const parsed = product.profileJson
    ? parseCandidateProfileSafe(product.profileJson)
    : { ok: true as const, profile: emptyCandidateProfile() };
  if (!parsed.ok) {
    throw new TenantError(
      `The ${vocab.product.singular} could not be read, so consultation did not start.`,
    );
  }
  const withDates = await persistExtractedExperienceDates({
    organizationId,
    productId: product.id,
    profile: parsed.profile,
  });
  const profile = await persistExtractedContactDetails({
    organizationId,
    productId: product.id,
    profile: withDates,
  });
  return { campaign, requirement, product, profile };
}

function consultationUsage(
  organizationId: string,
  campaignId: string,
  operation: "CONSULTATION" | "CONSULTATION_REPLY",
): AiCallUsageContext {
  return {
    organizationId,
    campaignId,
    category: "CONSULTATION",
    operation,
  };
}

async function voiceSamplesForUsage(
  usage?: AiCallUsageContext,
): Promise<Array<{ label: string; sampleText: string }>> {
  if (!usage?.organizationId || !usage.campaignId) return [];
  const campaign = await prisma.campaign.findFirst({
    where: { id: usage.campaignId, organizationId: usage.organizationId },
    select: { ownerUserId: true },
  });
  if (!campaign) return [];
  return prisma.voiceSample.findMany({
    where: {
      organizationId: usage.organizationId,
      userId: campaign.ownerUserId,
      active: true,
    },
    select: { label: true, sampleText: true },
    orderBy: { createdAt: "asc" },
  });
}

function whyThisCompanyTarget(): EvidenceTarget {
  return {
    key: WHY_THIS_COMPANY_TARGET_KEY,
    kind: "MISSION",
    text: consultationConversationCopy.whyThisCompanyTarget,
  };
}

function whyThisCompanyFactId(campaignId: string): string {
  return `why-this-company:${campaignId}`;
}

function whyThisCompanyAlreadyAnswered(input: {
  campaignId: string;
  whyThisCompany: string | null;
  profile: ReturnType<typeof parseCandidateProfile>;
}): boolean {
  if (input.whyThisCompany?.trim()) return true;
  const factId = whyThisCompanyFactId(input.campaignId);
  return (
    input.profile.skills.some((item) => item.id === factId) ||
    input.profile.experience.some((role) =>
      role.achievements.some((item) => item.id === factId),
    )
  );
}

function markWhyThisCompanyAsked(
  askedKeys: Set<string>,
  input: {
    campaignId: string;
    whyThisCompany: string | null;
    profile: ReturnType<typeof parseCandidateProfile>;
  },
): void {
  if (whyThisCompanyAlreadyAnswered(input)) {
    askedKeys.add(WHY_THIS_COMPANY_TARGET_KEY);
  }
}

function targetsFromRequirement(requirement: {
  requiredItems: unknown;
  preferredItems: unknown;
  scorecardJson: unknown;
}): EvidenceTarget[] {
  return [
    whyThisCompanyTarget(),
    ...evidenceTargets({
      requiredItems: parseStringArray(requirement.requiredItems),
      preferredItems: parseStringArray(requirement.preferredItems),
      scorecard: readScorecard(requirement.scorecardJson),
    }),
  ];
}

async function saveAssessments(
  organizationId: string,
  sessionId: string,
  assessments: EvidenceAssessment[],
) {
  const keep = assessments.filter((assessment) => isStandingRequirement(assessment));
  await prisma.consultationAssessment.deleteMany({
    where: {
      sessionId,
      targetKey: { notIn: keep.map((assessment) => assessment.key) },
    },
  });
  for (const assessment of keep) {
    await prisma.consultationAssessment.upsert({
      where: {
        sessionId_targetKey: { sessionId, targetKey: assessment.key },
      },
      create: {
        organizationId,
        sessionId,
        targetKey: assessment.key,
        kind: assessment.kind,
        text: assessment.text,
        strength: assessment.strength,
        supportingFactIds: assessment.supportingFactIds,
        strategy: assessment.strategy,
        explanation: assessment.explanation,
        strategyText: assessment.strategyText,
        verificationJson: assessment.verification as Prisma.InputJsonValue,
        experienceCalculationJson:
          (assessment.experienceCalculation as Prisma.InputJsonValue | null) ??
          undefined,
      },
      update: {
        kind: assessment.kind,
        text: assessment.text,
        strength: assessment.strength,
        supportingFactIds: assessment.supportingFactIds,
        strategy: assessment.strategy,
        explanation: assessment.explanation,
        strategyText: assessment.strategyText,
        verificationJson: assessment.verification as Prisma.InputJsonValue,
        experienceCalculationJson:
          (assessment.experienceCalculation as Prisma.InputJsonValue | null) ??
          Prisma.JsonNull,
      },
    });
  }
}

function storedAssessment(row: {
  targetKey: string;
  kind: string;
  text: string;
  strength: EvidenceAssessment["strength"];
  supportingFactIds: unknown;
  strategy: EvidenceAssessment["strategy"];
  explanation: string | null;
  strategyText: string | null;
  verificationJson: unknown;
  experienceCalculationJson: unknown;
}): EvidenceAssessment {
  return {
    key: row.targetKey,
    kind: row.kind as EvidenceAssessment["kind"],
    text: row.text,
    strength: row.strength,
    supportingFactIds: parseStringArray(row.supportingFactIds),
    strategy: row.strategy,
    explanation: row.explanation ?? "",
    strategyText: row.strategyText ?? "",
    verification: (row.verificationJson ?? {
      originalStrength: row.strength,
      invalidSupportingFactIds: [],
      invalidRoleIds: [],
      downgradeReasons: [],
    }) as EvidenceAssessment["verification"],
    experienceCalculation:
      (row.experienceCalculationJson as EvidenceAssessment["experienceCalculation"]) ??
      null,
  };
}

async function nextSequence(sessionId: string): Promise<number> {
  const latest = await prisma.consultationTurn.findFirst({
    where: { sessionId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return (latest?.sequence ?? 0) + 1;
}

async function addTurn(input: {
  organizationId: string;
  sessionId: string;
  speaker: "CONSULTANT" | "SEEKER";
  body: string;
  targetKey: string | null;
  followUp?: boolean;
  skipped?: boolean;
  seekerAuthored?: boolean;
  analysisJson?: Prisma.InputJsonValue;
  questionContext?: {
    requirementInterpretation: string | null;
    hiringTeamRoleId: string;
    whoCaresNote: string;
  };
  intent?: string | null;
}) {
  const sequence = await nextSequence(input.sessionId);
  return prisma.consultationTurn.create({
    data: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      sequence,
      speaker: input.speaker,
      body: input.body,
      targetKey: input.targetKey,
      followUp: input.followUp ?? false,
      skipped: input.skipped ?? false,
      seekerAuthored: input.seekerAuthored ?? false,
      analysisJson: input.analysisJson,
      questionContextJson:
        (input.questionContext as Prisma.InputJsonValue | undefined) ?? undefined,
      intent: input.intent ?? null,
    },
  });
}

function polishingSources(input: {
  answer: string;
  turnId: string;
}): GroundingSource[] {
  return [{ id: `answer:${input.turnId}`, text: input.answer }];
}

function extractThirdPersonViolations(text: string): string[] {
  if (!text.trim()) return [];
  if (
    /\b(the seeker|the candidate|he|she)\b/i.test(text)
  ) {
    return [
      "Write facts, story fields, and explanations in first person or neutral. Never use the seeker, the candidate, he, she, or the person's name.",
    ];
  }
  return [];
}

function answerDeniesGapExperience(answer: string): boolean {
  return /\b(i have never|i've never|i do not have|i don't have|i have not|i haven't|i never (sold|did|ran|built|led|owned|developed|installed)|no experience with)\b/i.test(
    answer,
  );
}

function coachingSpeaksAsSeekerI(text: string): boolean {
  return /\b((did|do|have|has|am|was|were|would|can|could) I|that I |which \w+ I |what I )\b/i.test(
    text,
  );
}

function isThinIncompleteAnswer(
  answer: string,
  data: Pick<ConsultationExtractResult, "missingStarElements">,
): boolean {
  return (
    data.missingStarElements.length >= 3 &&
    answer.split(/\s+/).filter(Boolean).length <= 8
  );
}

function extractAnswerQualityIssues(input: {
  data: ConsultationExtractResult;
  answer?: string;
  gapText?: string;
  profileItems?: ReturnType<typeof profileEvidenceItems>;
}): string[] {
  if (!isConsultationExtractAnswer(input.data)) return [];
  const issues: string[] = [];
  const answer = input.answer?.trim() ?? "";
  if (answerDeniesGapExperience(answer) && input.data.gapDecision !== "no_evidence") {
    issues.push(
      "When the person says they have never done the required work, gapDecision is no_evidence even if they name related experience. coaching and followUpQuestion must be null.",
    );
  }
  if (
    input.data.gapDecision === "evidence" &&
    isThinIncompleteAnswer(answer, input.data)
  ) {
    issues.push(
      "A short or vague answer is incomplete, not evidence. Set gapDecision to incomplete and write coaching plus one followUpQuestion addressed to you.",
    );
  }
  if (input.data.gapDecision === "incomplete") {
    if (!input.data.coaching?.trim()) {
      issues.push(
        "When gapDecision is incomplete, coaching is required and must be written by you.",
      );
    }
    if (!input.data.followUpQuestion?.trim()) {
      issues.push(
        "When gapDecision is incomplete, followUpQuestion is required and must be written by you.",
      );
    }
    const coaching = input.data.coaching?.trim() ?? "";
    const followUp = input.data.followUpQuestion?.trim() ?? "";
    if (coaching && followUp && coaching === followUp) {
      issues.push(
        "coaching and followUpQuestion must be different: a brief note, then one question for the missing piece.",
      );
    }
  }
  if (input.data.gapDecision === "no_evidence") {
    if (input.data.coaching?.trim() || input.data.followUpQuestion?.trim()) {
      issues.push(
        "When gapDecision is no_evidence, coaching and followUpQuestion must be null.",
      );
    }
  }
  const workTexts = [
    ...input.data.facts.map((fact) => fact.text),
    input.data.story?.situation ?? "",
    input.data.story?.task ?? "",
    input.data.story?.action ?? "",
    input.data.story?.result ?? "",
    ...input.data.demonstratedTargets.map((item) => item.explanation),
  ];
  for (const text of workTexts) {
    issues.push(...extractThirdPersonViolations(text));
  }
  for (const text of [input.data.coaching ?? "", input.data.followUpQuestion ?? ""]) {
    if (!text.trim()) continue;
    issues.push(...extractThirdPersonViolations(text));
    if (coachingSpeaksAsSeekerI(text)) {
      issues.push(
        "coaching and followUpQuestion must address the seeker as you, not as I.",
      );
    }
  }
  if (
    input.gapText &&
    questionNeedsRoleSource({
      gapText: input.gapText,
      profileItems: input.profileItems,
    }) &&
    input.data.followUpQuestion &&
    !/which roles?/i.test(input.data.followUpQuestion)
  ) {
    issues.push(
      "If years or background are not tied to roles, the follow-up must ask which roles they came from, in your own words.",
    );
  }
  return [...new Set(issues)];
}

async function extractAnswerWithQuality(input: {
  answer: string;
  question: string;
  target: EvidenceTarget | null;
  targets: EvidenceTarget[];
  profileItems: ReturnType<typeof profileEvidenceItems>;
  targetStrength?: "STRONG" | "PARTIAL" | "NONE" | null;
  supportingEvidence?: string[];
  usage?: AiCallUsageContext;
}) {
  let lastFailure: string = consultationConversationCopy.generationFailed;
  let qualityFeedback: string[] = [];
  let lastOk: Extract<
    Awaited<ReturnType<typeof extractWithModel>>,
    { ok: true }
  > | null = null;
  for (
    let attempt = 0;
    attempt <= consultationConfig.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const extracted = await extractWithModel({
      ...input,
      qualityFeedback,
      usage: input.usage,
    });
    if (!extracted.ok) {
      lastFailure = extracted.message;
      continue;
    }
    lastOk = extracted;
    const issues = extractAnswerQualityIssues({
      data: extracted.data,
      answer: input.answer,
      gapText: input.target?.text,
      profileItems: input.profileItems,
    });
    const lastAttempt =
      attempt === consultationConfig.qualityRegenerationAttempts;
    if (issues.length > 0 && !lastAttempt) {
      qualityFeedback = issues;
      continue;
    }
    return extracted;
  }
  if (lastOk) return lastOk;
  return {
    ok: false as const,
    message: lastFailure,
  };
}

export async function polishAnswerWithQuality(input: {
  answer: string;
  story: {
    situation: string | null;
    task: string | null;
    action: string | null;
    result: string | null;
  };
  sources: GroundingSource[];
  declinedFollowUp: boolean;
  confirmedGap?: boolean;
  strengtheningNeeds: string[];
  seekerAnswers?: string[];
  firstName?: string | null;
  profileItems: ReturnType<typeof profileEvidenceItems>;
  target?: EvidenceTarget | null;
  targetStrength?: "STRONG" | "PARTIAL" | "NONE" | null;
  supportingEvidence?: string[];
  usage?: AiCallUsageContext;
}) {
  const seekerAnswers =
    input.seekerAnswers?.map((answer) => answer.trim()).filter(Boolean) ??
    input.answer
      .split("\n")
      .map((answer) => answer.trim())
      .filter(Boolean);
  const confirmedGap = input.confirmedGap === true;
  const voiceSamples = await voiceSamplesForUsage(input.usage);
  let lastFailure: string = consultationConversationCopy.generationFailed;
  let qualityFeedback: string[] = [];
  let lastAcceptable: Extract<
    Awaited<ReturnType<typeof polishAnswerWithModel>>,
    { ok: true }
  > | null = null;
  for (
    let attempt = 0;
    attempt <= consultationConfig.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const polished = await polishAnswerWithModel({
      answer: input.answer,
      story: input.story,
      declinedFollowUp: input.declinedFollowUp,
      confirmedGap,
      strengtheningNeeds: input.strengtheningNeeds,
      qualityFeedback,
      target: input.target ?? null,
      targetStrength: input.targetStrength ?? null,
      supportingEvidence: input.supportingEvidence ?? [],
      voiceSamples,
      profileItems: input.profileItems,
      usage: input.usage,
    });
    if (!polished.ok) {
      lastFailure = polished.message;
      continue;
    }
    const interviewText = polished.data.interviewAnswer.trim();
    const bulletText = polished.data.resumeBullet?.trim() ?? "";
    const interviewRaw = Boolean(
      interviewText && isRawSeekerResult(interviewText, seekerAnswers),
    );
    const bulletRaw = Boolean(
      !confirmedGap && bulletText && isRawSeekerResult(bulletText, seekerAnswers),
    );
    const lastAttempt =
      attempt === consultationConfig.qualityRegenerationAttempts;
    if (interviewRaw || bulletRaw) {
      lastFailure = consultationConversationCopy.generationFailed;
      qualityFeedback = [
        confirmedGap
          ? "Write a first-person talk track for addressing this gap honestly. Do not invent experience. Do not copy the reply unchanged. Never refer to the person in third person."
          : "The last interview answer or resume bullet copied the wording. Write polished first-person statements. You may use the supplied Personal Profile; do not copy the reply unchanged.",
      ];
      if (lastAttempt) {
        return {
          ok: false as const,
          message: lastFailure,
        };
      }
      continue;
    }
    const accepted = {
      ...polished,
      data: {
        ...polished.data,
        resumeBullet: confirmedGap ? null : polished.data.resumeBullet,
      },
    };
    const empty =
      !interviewText || (!confirmedGap && !bulletText);
    const voiceBroken =
      talkTrackVoiceViolations({
        text: interviewText,
        firstName: input.firstName ?? null,
      }).length > 0;
    if ((empty || voiceBroken) && !lastAttempt) {
      lastAcceptable = empty ? lastAcceptable : accepted;
      qualityFeedback = [
        confirmedGap
          ? "Write a first-person talk track for addressing this gap honestly. Do not invent experience. Never refer to the person in third person."
          : "Write polished first-person statements. You may use the supplied Personal Profile; do not copy the reply unchanged.",
      ];
      continue;
    }
    if (empty && lastAttempt && lastAcceptable) return lastAcceptable;
    if (empty) {
      return {
        ok: false as const,
        message: lastFailure,
      };
    }
    return accepted;
  }
  if (lastAcceptable) return lastAcceptable;
  return {
    ok: false as const,
    message: lastFailure,
  };
}

function companyMotivationFromExtract(
  value: string | null | undefined,
): string | null {
  const text = value?.trim() ?? "";
  return text || null;
}

function analysisHasCompanyMotivation(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return "companyMotivation" in value;
}

function analysisWithCompanyMotivation(
  value: unknown,
  companyMotivation: string | null,
): Prisma.InputJsonValue {
  const base =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  return { ...base, companyMotivation } as Prisma.InputJsonValue;
}

function profileWithoutWhyThisCompanyFact(
  profile: ReturnType<typeof parseCandidateProfile>,
  campaignId: string,
): ReturnType<typeof parseCandidateProfile> {
  const factId = whyThisCompanyFactId(campaignId);
  const next = parseCandidateProfile(profile);
  next.skills = next.skills.filter((item) => item.id !== factId);
  for (const role of next.experience) {
    role.achievements = role.achievements.filter((item) => item.id !== factId);
  }
  return parseCandidateProfile(next);
}

async function persistWhyThisCompany(input: {
  organizationId: string;
  campaignId: string;
  companyMotivation: string | null;
}): Promise<void> {
  const text = companyMotivationFromExtract(input.companyMotivation);
  if (!text) return;
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: { whyThisCompany: text },
  });
  const { product, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const next = appendConfirmedFact(
    profileWithoutWhyThisCompanyFact(profile, input.campaignId),
    {
      id: whyThisCompanyFactId(input.campaignId),
      text,
      turnId: WHY_THIS_COMPANY_TARGET_KEY,
    },
  );
  await prisma.product.update({
    where: { id: product.id },
    data: { profileJson: next },
  });
}

async function clearWhyThisCompanyMotivation(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const { product, profile, campaign } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  if (!campaign.whyThisCompany?.trim()) {
    const factId = whyThisCompanyFactId(input.campaignId);
    const hasFact =
      profile.skills.some((item) => item.id === factId) ||
      profile.experience.some((role) =>
        role.achievements.some((item) => item.id === factId),
      );
    if (!hasFact) return;
  }
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: { whyThisCompany: null },
  });
  await prisma.product.update({
    where: { id: product.id },
    data: {
      profileJson: profileWithoutWhyThisCompanyFact(profile, input.campaignId),
    },
  });
}

export async function reextractExistingWhyThisCompanyMotivation(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const session = await prisma.consultationSession.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    include: { turns: { orderBy: { sequence: "asc" } } },
  });
  if (!session) return;
  const whyQuestions = session.turns.filter(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      turn.targetKey === WHY_THIS_COMPANY_TARGET_KEY,
  );
  const whyReplies = session.turns.filter(
    (turn) =>
      turn.speaker === "SEEKER" &&
      !turn.skipped &&
      turn.body.trim() &&
      (turn.targetKey === WHY_THIS_COMPANY_TARGET_KEY ||
        whyQuestions.some(
          (question) =>
            replyToTurnIdFromAnalysis(turn.analysisJson) === question.id,
        )),
  );
  if (whyReplies.length === 0) return;
  if (whyReplies.every((turn) => analysisHasCompanyMotivation(turn.analysisJson))) {
    return;
  }
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const targets = targetsFromRequirement(requirement);
  const target =
    targets.find((entry) => entry.key === WHY_THIS_COMPANY_TARGET_KEY) ??
    whyThisCompanyTarget();
  const question =
    [...whyQuestions].at(-1)?.body.trim() ||
    target.text;
  const extracted = await extractAnswerWithQuality({
    answer: whyReplies.map((turn) => turn.body).join("\n"),
    question,
    target,
    targets,
    profileItems: profileEvidenceItems(profile),
    usage: consultationUsage(
      input.organizationId,
      input.campaignId,
      "CONSULTATION_REPLY",
    ),
  });
  if (!extracted.ok) {
    await failGeneration(session.id, extracted.message);
    throw new Error(extracted.message);
  }
  const companyMotivation = isConsultationExtractAnswer(extracted.data)
    ? companyMotivationFromExtract(extracted.data.companyMotivation)
    : null;
  if (companyMotivation) {
    await persistWhyThisCompany({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      companyMotivation,
    });
  } else {
    await clearWhyThisCompanyMotivation({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    });
  }
  for (const reply of whyReplies) {
    await prisma.consultationTurn.update({
      where: { id: reply.id },
      data: {
        analysisJson: analysisWithCompanyMotivation(
          reply.analysisJson,
          companyMotivation,
        ),
      },
    });
  }
}

function consultantTurnIsAnswered(
  turns: Array<{
    id: string;
    speaker: string;
    skipped: boolean;
    body: string;
    targetKey: string | null;
    analysisJson: unknown;
  }>,
  question: { id: string; targetKey: string | null },
): boolean {
  return turns.some(
    (reply) =>
      reply.speaker === "SEEKER" &&
      !reply.skipped &&
      reply.body.trim() &&
      (replyToTurnIdFromAnalysis(reply.analysisJson) === question.id ||
        (Boolean(question.targetKey) && reply.targetKey === question.targetKey)),
  );
}

function analysisWithCannedRepair(value: unknown): Prisma.InputJsonValue {
  const base =
    value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  return {
    ...base,
    cannedWordingRepairedAt: new Date().toISOString(),
  } as Prisma.InputJsonValue;
}

export async function regenerateCannedConsultationWording(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const session = await prisma.consultationSession.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    include: { turns: { orderBy: { sequence: "asc" } } },
  });
  if (!session) return;
  const unansweredCanned = session.turns.filter(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      turn.intent !== "CLOSING" &&
      looksLikeCannedHarperText(turn.body) &&
      !cannedWordingRepairedAt(turn.analysisJson) &&
      !consultantTurnIsAnswered(session.turns, turn),
  );
  if (unansweredCanned.length === 0) return;
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const [roles, companyResearch, interviewStages] = await Promise.all([
    loadCoachHiringTeam(input.organizationId, input.campaignId),
    loadCoachCompanyResearch(input.organizationId, input.campaignId),
    prisma.interviewStage.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
      },
      select: { id: true, notesBefore: true, notesAfter: true },
    }),
  ]);
  const askedQuestions = askedQuestionsFromTurns(session.turns);
  const profileItems = [
    ...profileEvidenceItems(profile),
    ...learnedNotesEvidence(input.campaignId, requirement.seekerLearnedNotes),
    ...interviewNotesEvidence(interviewStages),
  ];
  const focusTargetKey = unansweredCanned[0]?.targetKey ?? null;
  let lastPlan: Extract<
    Awaited<ReturnType<typeof planConsultationWithModel>>,
    { ok: true }
  > | null = null;
  let qualityFeedback = [
    "These unanswered questions use stock product wording and must be rewritten in your own words. Keep the same targetKey. Never paste a fixed stock sentence.",
    ...unansweredCanned.map((turn) => `Rewrite: ${turn.body}`),
  ];
  for (
    let attempt = 0;
    attempt <= consultationConfig.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const plan = await planConsultationWithModel({
      targets: targetsFromRequirement(requirement),
      profileItems,
      seekerStatedFacts: seekerStatedFactsForCoach({
        profile,
        campaignId: input.campaignId,
        learnedNotes: requirement.seekerLearnedNotes,
        stages: interviewStages,
      }),
      askedQuestions,
      hiringTeam: roles,
      companyResearch,
      chronologyRequested: seniorityWarrantsChronology({
        seniority: requirement.seniority,
        title: requirement.title,
      }),
      coveredTargetKeys: [],
      focusTargetKey,
      qualityFeedback,
      usage: consultationUsage(
        input.organizationId,
        input.campaignId,
        "CONSULTATION",
      ),
    });
    if (!plan.ok) continue;
    lastPlan = plan;
    const lastAttempt =
      attempt === consultationConfig.qualityRegenerationAttempts;
    const stillCanned = unansweredCanned.some((turn) => {
      const replacement = plan.data.questions.find(
        (question) => question.targetKey === turn.targetKey,
      );
      const next = replacement?.text.trim() || "";
      return !next || looksLikeCannedHarperText(next);
    });
    if (stillCanned && !lastAttempt) {
      qualityFeedback = [
        ...qualityFeedback,
        "Write each replacement question yourself. Do not reuse stock wording.",
      ];
      continue;
    }
    break;
  }
  for (const turn of unansweredCanned) {
    const replacement = lastPlan?.data.questions.find(
      (question) => question.targetKey === turn.targetKey,
    );
    const next = replacement?.text.trim() || "";
    await prisma.consultationTurn.update({
      where: { id: turn.id },
      data: {
        ...(next && !looksLikeCannedHarperText(next) ? { body: next } : {}),
        analysisJson: analysisWithCannedRepair(turn.analysisJson),
      },
    });
  }
}

export async function prepareExistingConsultationSession(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  await repairExistingConsultationSession(input);
  await reextractExistingWhyThisCompanyMotivation(input);
  await regenerateCannedConsultationWording(input);
}

function seekerFacingGenerationError(message: string): string {
  const trimmed = message.trim();
  if (
    /that question is not open/i.test(trimmed) ||
    /there is no open question/i.test(trimmed) ||
    /not waiting for an answer/i.test(trimmed) ||
    /not waiting for a reply/i.test(trimmed)
  ) {
    return consultationConversationCopy.generationFailed;
  }
  return trimmed || consultationConversationCopy.generationFailed;
}

async function failGeneration(sessionId: string, message: string): Promise<void> {
  const shown = seekerFacingGenerationError(message);
  console.error(
    JSON.stringify({
      event: "consultation_generation_failed",
      sessionId,
      message,
    }),
  );
  await prisma.consultationSession.update({
    where: { id: sessionId },
    data: {
      generationStatus: "FAILED",
      generationError: shown,
    },
  });
}

function learnedNotesEvidence(
  campaignId: string,
  notes: string | null | undefined,
): ReturnType<typeof profileEvidenceItems> {
  const text = notes?.trim();
  if (!text) return [];
  return [
    {
      id: `learned-notes:${campaignId}`,
      kind: "FACT",
      text,
      itemType: "ITEM",
    },
  ];
}

function interviewNotesEvidence(
  stages: Array<{ id: string; notesBefore: string | null; notesAfter: string | null }>,
): ReturnType<typeof profileEvidenceItems> {
  const items: ReturnType<typeof profileEvidenceItems> = [];
  for (const stage of stages) {
    const before = stage.notesBefore?.trim();
    if (before) {
      items.push({
        id: `interview-notes:${stage.id}:before`,
        kind: "FACT",
        text: before,
        itemType: "ITEM",
      });
    }
    const after = stage.notesAfter?.trim();
    if (after) {
      items.push({
        id: `interview-notes:${stage.id}:after`,
        kind: "FACT",
        text: after,
        itemType: "ITEM",
      });
    }
  }
  return items;
}

function seekerStatedFactsForCoach(input: {
  profile: ReturnType<typeof parseCandidateProfile>;
  campaignId: string;
  learnedNotes: string | null | undefined;
  stages: Array<{ id: string; notesBefore: string | null; notesAfter: string | null }>;
}): SeekerStatedFactPayload[] {
  const facts: SeekerStatedFactPayload[] = [];
  for (const item of input.profile.seekerStatedFacts) {
    const text = item.text.trim();
    if (!text) continue;
    facts.push({
      id: item.id || SEEKER_STATED_FACT_ID,
      kind: "FACT",
      text,
      source: "added_background",
    });
  }
  const learned = input.learnedNotes?.trim();
  if (learned) {
    facts.push({
      id: `learned-notes:${input.campaignId}`,
      kind: "FACT",
      text: learned,
      source: "interview_learning",
    });
  }
  for (const item of interviewNotesEvidence(input.stages)) {
    facts.push({
      id: item.id,
      kind: "FACT",
      text: item.text,
      source: "interview_learning",
    });
  }
  return facts;
}

function profileFirstName(
  profile: ReturnType<typeof parseCandidateProfile>,
): string | null {
  return seekerFirstName(profile.identity.name?.text);
}

function consultationPlanQualityIssues(input: {
  briefing: {
    overall: string;
    strongestAngles: string[];
    importantGaps: string[];
    storyPlan: string[];
  };
  commentary: string;
  closingNote: string | null;
  questions: QuestionRoundPlan["questions"];
  assessments: EvidenceAssessment[];
  dropped: QuestionRoundPlan["dropped"];
  firstName: string | null;
  profileItems?: ReturnType<typeof profileEvidenceItems>;
}): string[] {
  const issues: string[] = [];
  const droppedGaps = input.dropped.filter(
    (item) =>
      item.targetKey !== "chronology" && item.reason !== "already-asked",
  );
  if (droppedGaps.length > 0) {
    issues.push(
      "Write one question for every remaining gap, most important first.",
    );
  }
  for (const question of input.questions) {
    if (!question.whoCaresNote.trim()) {
      issues.push(
        "whoCaresNote is required on every question: name the Hiring Team role and what that person needs to hear.",
      );
    }
    const assessment = input.assessments.find(
      (item) => item.key === question.targetKey,
    );
    if (
      assessment &&
      questionNeedsRoleSource({
        gapText: assessment.text,
        profileItems: input.profileItems,
      }) &&
      !/which roles?/i.test(question.text)
    ) {
      issues.push(
        "When a seeker-stated background fact is not tied to roles, that gap's question must ask which roles that background came from, in your own words.",
      );
    }
  }
  const texts = [
    input.commentary,
    input.briefing.overall,
    ...input.briefing.strongestAngles,
    ...input.briefing.importantGaps,
    ...input.briefing.storyPlan,
    input.closingNote ?? "",
    ...input.questions.map((question) => question.text),
    ...input.assessments.map((assessment) => assessment.explanation),
  ];
  for (const text of texts) {
    issues.push(
      ...harperCoachingVoiceViolations({
        text,
        firstName: input.firstName,
      }),
      ...seekerPrepInstructionViolations(text),
    );
  }
  return [...new Set(issues)];
}

function followUpBody(coaching: string | null | undefined, question: string): string {
  const note = coaching?.trim() ?? "";
  const ask = question.trim();
  if (note && ask && note !== ask) return `${note}\n\n${ask}`;
  return note || ask;
}

async function planAndStoreRound(input: {
  organizationId: string;
  campaignId: string;
  sessionId: string;
  askedKeys: Set<string>;
  skippedKeys: Set<string>;
  profile: ReturnType<typeof parseCandidateProfile>;
  requirement: {
    seniority: string | null;
    title: string | null;
    seekerLearnedNotes?: string | null;
  };
  targets: EvidenceTarget[];
  roles: CoachHiringTeamRole[];
  focusTargetKey?: string | null;
  focusGuidance?: string[];
  interviewerPrep?: InterviewerPrepPayload | null;
}): Promise<QuestionRoundPlan["questions"]> {
  await prisma.consultationSession.update({
    where: { id: input.sessionId },
    data: { generationStatus: "GENERATING", generationError: null },
  });
  const [existingTurns, interviewStages, companyResearch] = await Promise.all([
    loadSessionTurns(input.sessionId),
    prisma.interviewStage.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
      },
      select: { id: true, notesBefore: true, notesAfter: true },
    }),
    loadCoachCompanyResearch(input.organizationId, input.campaignId),
  ]);
  const askedQuestions = askedQuestionsFromTurns(existingTurns);
  const seekerStatedFacts = seekerStatedFactsForCoach({
    profile: input.profile,
    campaignId: input.campaignId,
    learnedNotes: input.requirement.seekerLearnedNotes,
    stages: interviewStages,
  });
  const profileItems = [
    ...profileEvidenceItems(input.profile),
    ...learnedNotesEvidence(input.campaignId, input.requirement.seekerLearnedNotes),
    ...interviewNotesEvidence(interviewStages),
  ];
  const chronologyRequested = seniorityWarrantsChronology({
    seniority: input.requirement.seniority,
    title: input.requirement.title,
  });
  let lastFailure: string = consultationConversationCopy.planUnusable;
  let qualityFeedback = [...(input.focusGuidance ?? [])];
  const firstName = profileFirstName(input.profile);
  let accepted:
    | {
        plan: Extract<
          Awaited<ReturnType<typeof planConsultationWithModel>>,
          { ok: true }
        >;
        assessments: EvidenceAssessment[];
        questions: QuestionRoundPlan["questions"];
      }
    | null = null;
  for (
    let attempt = 0;
    attempt <= consultationConfig.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const plan = await planConsultationWithModel({
      targets: input.targets,
      profileItems,
      seekerStatedFacts,
      askedQuestions,
      hiringTeam: input.roles,
      companyResearch,
      usage: consultationUsage(
        input.organizationId,
        input.campaignId,
        "CONSULTATION",
      ),
      chronologyRequested,
      coveredTargetKeys: [
        ...new Set(
          [...input.askedKeys, ...input.skippedKeys].filter(
            (key) => key !== input.focusTargetKey,
          ),
        ),
      ],
      focusTargetKey: input.focusTargetKey ?? null,
      interviewerPrep: input.interviewerPrep ?? null,
      qualityFeedback,
    });
    if (!plan.ok) {
      lastFailure = plan.message;
      continue;
    }
    const previousAssessments = (
      await prisma.consultationAssessment.findMany({
        where: { sessionId: input.sessionId },
      })
    ).map(storedAssessment);
    const assessments = verifyModelAssessments({
      targets: input.targets,
      profileItems,
      assessments: plan.data.assessments,
      asOf: new Date(),
      previousAssessments,
    });
    const planned = planQuestionRound({
      assessments,
      modelQuestions: plan.data.questions,
      hiringTeam: input.roles,
      askedKeys: input.askedKeys,
      skippedKeys: input.skippedKeys,
      includeChronology: chronologyRequested,
      chronologyAsked: input.askedKeys.has("chronology"),
      askedQuestions,
      focusTargetKey: input.focusTargetKey ?? null,
      profileItems,
    });
    const issues = consultationPlanQualityIssues({
      briefing: plan.data.briefing,
      commentary: plan.data.commentary,
      closingNote: plan.data.closingNote,
      questions: planned.questions,
      assessments,
      dropped: planned.dropped,
      firstName,
      profileItems,
    });
    const lastAttempt = attempt === consultationConfig.qualityRegenerationAttempts;
    if (issues.length > 0 && !lastAttempt) {
      qualityFeedback = [
        ...qualityFeedback,
        ...issues,
        "Write one question for every remaining gap, most important first. Speak to the person as you. Never write instructions to close a gap or prepare a story.",
      ];
      lastFailure = consultationConversationCopy.planUnusable;
      continue;
    }
    accepted = { plan, assessments, questions: planned.questions };
    break;
  }
  if (!accepted) {
    await failGeneration(input.sessionId, lastFailure);
    throw new Error(lastFailure);
  }
  const { plan, assessments, questions } = accepted;
  const voicedAssessments = assessments.map((assessment) => ({
    ...assessment,
  }));
  const voicedQuestions = questions
    .filter((question) => !questionDuplicatesAsked(question.text, askedQuestions))
    .slice(
      0,
      Math.max(0, consultationConfig.applicationQuestionLimit - askedQuestions.length),
    );
  const briefing = {
    overall: plan.data.briefing.overall,
    strongestAngles: plan.data.briefing.strongestAngles,
    importantGaps: plan.data.briefing.importantGaps,
    storyPlan: [],
  };
  await saveAssessments(input.organizationId, input.sessionId, voicedAssessments);
  for (const question of voicedQuestions) {
    await addTurn({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      speaker: "CONSULTANT",
      body: question.text,
      targetKey: question.targetKey,
      followUp: question.followUp,
      questionContext: {
        requirementInterpretation: question.requirementInterpretation,
        hiringTeamRoleId: question.hiringTeamRoleId,
        whoCaresNote: question.whoCaresNote,
      },
    });
  }
  await prisma.consultationSession.update({
    where: { id: input.sessionId },
    data: {
      coachNote: plan.data.commentary.trim() || null,
      briefingJson: briefing as Prisma.InputJsonValue,
      promptVersion: CONSULTATION_PROMPT_VERSION,
      generationStatus: "READY",
      generationError: null,
    },
  });
  const remainingGaps = voicedAssessments.filter(
    (assessment) =>
      isStandingRequirement(assessment) && assessment.strength !== "STRONG",
  );
  const alreadyClosed = await prisma.consultationTurn.findFirst({
    where: { sessionId: input.sessionId, intent: "CLOSING" },
    select: { id: true },
  });
  if (
    voicedQuestions.length === 0 &&
    remainingGaps.length === 0 &&
    !alreadyClosed &&
    plan.data.closingNote?.trim()
  ) {
    await addTurn({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      speaker: "CONSULTANT",
      body: plan.data.closingNote.trim(),
      targetKey: null,
      intent: "CLOSING",
    });
  }
  return voicedQuestions;
}

async function finishIfPlanningIsComplete(
  sessionId: string,
  questions: QuestionRoundPlan["questions"],
): Promise<void> {
  if (questions.length > 0) return;
  const [session, stored, skipped] = await Promise.all([
    prisma.consultationSession.findUnique({
      where: { id: sessionId },
      select: { generationStatus: true },
    }),
    prisma.consultationAssessment.findMany({
      where: { sessionId },
    }),
    prisma.consultationTurn.findMany({
      where: { sessionId, speaker: "SEEKER", skipped: true },
      select: { targetKey: true },
    }),
  ]);
  const covered = gapsAreCovered(
    stored.map(storedAssessment),
    new Set(skipped.map((turn) => turn.targetKey).filter((key): key is string => Boolean(key))),
  );
  const { view } = await loadSessionQaView(sessionId);
  if (consultationHasUnansweredQuestions(view)) return;
  if (covered && session?.generationStatus === "READY") {
    await prisma.consultationSession.update({
      where: { id: sessionId },
      data: { status: "DONE" },
    });
    await queueAssetsWhenConsultationEnds(sessionId);
  }
}

async function queueAssetsWhenConsultationEnds(
  sessionId: string,
): Promise<void> {
  const session = await prisma.consultationSession.findUnique({
    where: { id: sessionId },
    select: {
      organizationId: true,
      campaignId: true,
      campaign: { select: { ownerUserId: true } },
    },
  });
  if (!session) return;
  const { enqueueAssetsAfterConsultation } = await import(
    "@/lib/application-assets/plan-service"
  );
  await enqueueAssetsAfterConsultation({
    organizationId: session.organizationId,
    campaignId: session.campaignId,
    userId: session.campaign.ownerUserId,
  });
}

async function queueAssetsForCampaign(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { ownerUserId: true },
  });
  if (!campaign) return;
  const { enqueueAssetsAfterConsultation } = await import(
    "@/lib/application-assets/plan-service"
  );
  await enqueueAssetsAfterConsultation({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    userId: campaign.ownerUserId,
  });
}

function askedAndSkipped(
  turns: Array<{
    speaker: "CONSULTANT" | "SEEKER";
    targetKey: string | null;
    skipped: boolean;
    analysisJson?: unknown;
  }>,
) {
  const askedKeys = new Set<string>();
  const skippedKeys = new Set<string>();
  for (const turn of turns) {
    if (turn.speaker === "CONSULTANT" && turn.targetKey) askedKeys.add(turn.targetKey);
    if (turn.speaker === "SEEKER" && turn.skipped && turn.targetKey) {
      const declinedFollowUp =
        turn.analysisJson &&
        typeof turn.analysisJson === "object" &&
        (turn.analysisJson as { followUpDeclined?: unknown })
          .followUpDeclined === true;
      if (!declinedFollowUp) skippedKeys.add(turn.targetKey);
    }
    if (
      turn.speaker === "SEEKER" &&
      turn.analysisJson &&
      typeof turn.analysisJson === "object"
    ) {
      const demonstrated = (turn.analysisJson as {
        demonstratedTargets?: unknown;
      }).demonstratedTargets;
      if (Array.isArray(demonstrated)) {
        for (const item of demonstrated) {
          if (!item || typeof item !== "object") continue;
          const targetKey = (item as { targetKey?: unknown }).targetKey;
          if (typeof targetKey === "string" && targetKey) {
            askedKeys.add(targetKey);
          }
        }
      }
    }
  }
  return { askedKeys, skippedKeys };
}

function resolveConsultationTargets(input: {
  requirement: {
    requiredItems: unknown;
    preferredItems: unknown;
    scorecardJson: unknown;
  };
  focusTargetKey?: string | null;
  focusNote?: string | null;
  interviewerPrep?: InterviewerPrepPayload | null;
}): { targets: EvidenceTarget[]; focusTargetKey: string | null } {
  const targets = targetsFromRequirement(input.requirement);
  let focusTargetKey = matchConsultationFocus({
    focusTargetKey: input.focusTargetKey,
    focusNote: input.focusNote,
    targets,
  });
  const note = input.focusNote?.trim() ?? "";
  const personPrepKey = input.focusTargetKey?.trim() ?? "";
  if (input.interviewerPrep || personPrepKey.startsWith("person-prep:")) {
    focusTargetKey = personPrepKey || personPrepTargetKey(input.interviewerPrep?.contactId ?? "");
  } else if (!focusTargetKey && note) {
    focusTargetKey = "interview-note-focus";
  }
  return { targets, focusTargetKey };
}

export async function startConsultation(input: {
  organizationId: string;
  campaignId: string;
  focusNote?: string | null;
  focusTargetKey?: string | null;
  interviewerPrep?: InterviewerPrepPayload | null;
  forceReassess?: boolean;
}): Promise<void> {
  await prepareExistingConsultationSession({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
  const { campaign, requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const hasFocus = Boolean(
    input.focusNote?.trim() ||
      input.focusTargetKey?.trim() ||
      input.interviewerPrep,
  );
  const { targets, focusTargetKey } = resolveConsultationTargets({
    requirement,
    focusTargetKey: input.focusTargetKey,
    focusNote: input.focusNote,
    interviewerPrep: input.interviewerPrep,
  });
  const existing = await prisma.consultationSession.findUnique({
    where: { campaignId: input.campaignId },
  });
  if (existing?.status === "DONE" && !hasFocus && !input.forceReassess) return;
  if (existing?.status === "DONE" && (hasFocus || input.forceReassess)) {
    await prisma.consultationSession.update({
      where: { id: existing.id },
      data: { status: "IN_PROGRESS", generationStatus: "READY" },
    });
  }
  const hasBriefing =
    existing?.briefingJson != null &&
    existing.generationStatus === "READY" &&
    existing.status === "IN_PROGRESS";
  if (hasBriefing && !hasFocus && !input.forceReassess) return;
  const session =
    existing ??
    (await prisma.consultationSession.create({
      data: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        productId: campaign.productId,
        status: "IN_PROGRESS",
        promptVersion: CONSULTATION_PROMPT_VERSION,
      },
    }));
  const turns = existing ? await loadSessionTurns(existing.id) : [];
  const { askedKeys, skippedKeys } = askedAndSkipped(turns);
  markWhyThisCompanyAsked(askedKeys, {
    campaignId: campaign.id,
    whyThisCompany: campaign.whyThisCompany,
    profile,
  });
  const roles = await loadCoachHiringTeam(input.organizationId, input.campaignId);
  try {
    await planAndStoreRound({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sessionId: session.id,
      askedKeys,
      skippedKeys,
      profile,
      requirement,
      targets,
      roles,
      focusTargetKey,
      interviewerPrep: input.interviewerPrep,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Consultation could not start.";
    await failGeneration(session.id, message);
    throw error;
  }
}

export async function reassessConsultationStanding(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  await startConsultation({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    forceReassess: true,
  });
}

async function processAnswerGeneration(input: {
  organizationId: string;
  campaignId: string;
  sessionId: string;
  turnId: string;
  resultTurnId?: string;
  supersedeTurnIds?: string[];
  answerContext: string;
  question: string;
  target: EvidenceTarget | null;
  targets: EvidenceTarget[];
  profile: ReturnType<typeof parseCandidateProfile>;
  replyToTurnId?: string | null;
  allowFollowUp?: boolean;
}): Promise<
  | {
      ok: true;
      followUpQuestion: string | null;
      coaching: string | null;
      missingStarElements: string[];
      wroteResult: boolean;
      gapDecision: "evidence" | "no_evidence" | "incomplete";
      companyMotivation: string | null;
    }
  | { ok: false }
> {
  const replyUsage = consultationUsage(
    input.organizationId,
    input.campaignId,
    "CONSULTATION_REPLY",
  );
  const profileItems = profileEvidenceItems(input.profile);
  const storedAssessment = input.target
    ? await prisma.consultationAssessment.findFirst({
        where: { sessionId: input.sessionId, targetKey: input.target.key },
      })
    : null;
  const targetStrength =
    storedAssessment?.strength === "STRONG" ||
    storedAssessment?.strength === "PARTIAL" ||
    storedAssessment?.strength === "NONE"
      ? storedAssessment.strength
      : null;
  const supportingEvidence = storedAssessment
    ? profileItems
        .filter((item) =>
          parseStringArray(storedAssessment.supportingFactIds).includes(item.id),
        )
        .map((item) => item.text)
    : [];
  const extracted = await extractAnswerWithQuality({
    answer: input.answerContext,
    question: input.question,
    target: input.target,
    targets: input.targets,
    profileItems,
    targetStrength,
    supportingEvidence,
    usage: replyUsage,
  });
  if (!extracted.ok) {
    await failGeneration(input.sessionId, extracted.message);
    return { ok: false };
  }
  if (extracted.data.replyType === "feedback") {
    if (!isConsultationExtractFeedback(extracted.data)) {
      await failGeneration(input.sessionId, consultationConversationCopy.generationFailed);
      return { ok: false };
    }
    const revisedQuestion = extracted.data.revisedQuestion.trim();
    if (!revisedQuestion) {
      await failGeneration(input.sessionId, consultationConversationCopy.generationFailed);
      return { ok: false };
    }
    const questionTurnId = input.replyToTurnId;
    if (!questionTurnId) {
      await failGeneration(input.sessionId, consultationConversationCopy.generationFailed);
      return { ok: false };
    }
    await prisma.$transaction([
      prisma.consultationTurn.update({
        where: { id: questionTurnId },
        data: { body: revisedQuestion },
      }),
      prisma.consultationTurn.update({
        where: { id: input.turnId },
        data: {
          analysisJson: {
            status: "READY",
            replyType: "feedback",
            ...(questionTurnId ? { replyToTurnId: questionTurnId } : {}),
          },
        },
      }),
      prisma.consultationStatement.deleteMany({
        where: {
          sessionId: input.sessionId,
          turnId: { in: [input.turnId, input.resultTurnId ?? input.turnId] },
          kind: { in: ["INTERVIEW_ANSWER", "RESUME_BULLET"] },
        },
      }),
      prisma.consultationSession.update({
        where: { id: input.sessionId },
        data: { generationStatus: "READY", generationError: null },
      }),
    ]);
    return {
      ok: true,
      followUpQuestion: null,
      coaching: null,
      missingStarElements: [],
      wroteResult: false,
      gapDecision: "incomplete",
      companyMotivation: null,
    };
  }
  if (!isConsultationExtractAnswer(extracted.data)) {
    await failGeneration(input.sessionId, consultationConversationCopy.generationFailed);
    return { ok: false };
  }
  const verified = proposalsFromExtraction({
    answer: input.answerContext,
    turnId: input.turnId,
    extracted: extracted.data,
    targets: input.targets,
    profile: input.profile,
  });
  const storyProposal = verified.proposals.find(
    (proposal) => proposal.kind === "STORY" && proposal.story,
  );
  const story =
    storyProposal?.story ??
    verified.partialStory ??
    extracted.data.story ??
    null;
  const gapDecision = answerDeniesGapExperience(input.answerContext)
    ? "no_evidence"
    : extracted.data.gapDecision === "incomplete" ||
        isThinIncompleteAnswer(input.answerContext, extracted.data)
      ? "incomplete"
      : extracted.data.gapDecision;
  const followUpQuestion =
    gapDecision === "no_evidence" ? null : verified.followUpQuestion;
  const incomplete = gapDecision === "incomplete";
  const coaching =
    gapDecision === "no_evidence"
      ? null
      : extracted.data.coaching?.trim() || null;
  const analysisJson = {
    status: "READY",
    ...(input.replyToTurnId ? { replyToTurnId: input.replyToTurnId } : {}),
    answerContext: input.answerContext,
    story: storyProposal?.story ?? verified.partialStory ?? extracted.data.story,
    dropped: verified.droppedDetails,
    missingStarElements: verified.missingStarElements,
    demonstratedTargets: extracted.data.demonstratedTargets,
    gapDecision,
    companyMotivation: companyMotivationFromExtract(extracted.data.companyMotivation),
  };
  if (incomplete) {
    if (
      (input.allowFollowUp ?? true) &&
      (!coaching || !followUpQuestion?.trim())
    ) {
      await failGeneration(
        input.sessionId,
        consultationConversationCopy.generationFailed,
      );
      return { ok: false };
    }
    await prisma.$transaction([
      prisma.consultationProposal.deleteMany({
        where: { turnId: input.turnId, status: "PENDING" },
      }),
      prisma.consultationTurn.update({
        where: { id: input.turnId },
        data: {
          analysisJson: {
            ...analysisJson,
            gapDecision: "incomplete",
          },
        },
      }),
      prisma.consultationStatement.deleteMany({
        where: {
          sessionId: input.sessionId,
          turnId: { in: [input.turnId, input.resultTurnId ?? input.turnId] },
          kind: { in: ["INTERVIEW_ANSWER", "RESUME_BULLET"] },
        },
      }),
      prisma.consultationSession.update({
        where: { id: input.sessionId },
        data: { generationStatus: "READY", generationError: null },
      }),
    ]);
    return {
      ok: true,
      followUpQuestion: (input.allowFollowUp ?? true) ? followUpQuestion : null,
      coaching,
      missingStarElements: verified.missingStarElements,
      wroteResult: false,
      gapDecision: "incomplete",
      companyMotivation: analysisJson.companyMotivation,
    };
  }
  const confirmedGap = gapDecision === "no_evidence";
  const polished = await polishAnswerWithQuality({
    answer: input.answerContext,
    story: {
      situation: story?.situation ?? null,
      task: story?.task ?? null,
      action: story?.action ?? null,
      result: story?.result ?? null,
    },
    sources: polishingSources({
      answer: input.answerContext,
      turnId: input.turnId,
    }),
    declinedFollowUp: false,
    confirmedGap,
    strengtheningNeeds: verified.missingStarElements,
    seekerAnswers: input.answerContext
      .split("\n")
      .map((answer) => answer.trim())
      .filter(Boolean),
    firstName: profileFirstName(input.profile),
    profileItems,
    target: input.target,
    targetStrength,
    supportingEvidence,
    usage: replyUsage,
  });
  if (!polished.ok) {
    await failGeneration(input.sessionId, polished.message);
    return { ok: false };
  }
  const interviewText = polished.data.interviewAnswer.trim();
  const bulletText = polished.data.resumeBullet?.trim() ?? "";
  if (!interviewText || (!confirmedGap && !bulletText)) {
    await failGeneration(input.sessionId, consultationConversationCopy.generationFailed);
    return { ok: false };
  }
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.consultationProposal.deleteMany({
      where: { turnId: input.turnId, status: "PENDING" },
    }),
    prisma.consultationTurn.update({
      where: { id: input.turnId },
      data: {
        analysisJson: {
          ...analysisJson,
          gapDecision: confirmedGap ? "no_evidence" : "evidence",
        },
      },
    }),
    prisma.consultationSession.update({
      where: { id: input.sessionId },
      data: { generationStatus: "READY", generationError: null },
    }),
    ...verified.proposals.map((proposal) =>
      prisma.consultationProposal.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          turnId: input.turnId,
          kind: proposal.kind,
          text: proposal.text,
          storyJson:
            (proposal.story as Prisma.InputJsonValue | null) ?? undefined,
          competencyLinks:
            (proposal.story?.competencyLinks as Prisma.InputJsonValue | null) ??
            undefined,
          profileItemId: proposal.profileItemId,
        },
      }),
    ),
  ];
  const statements = [
    {
      kind: "INTERVIEW_ANSWER" as const,
      content: interviewText,
      note: polished.data.strengtheningNote?.trim() || null,
    },
    ...(confirmedGap || !polished.data.resumeBullet || !bulletText
      ? []
      : [
          {
            kind: "RESUME_BULLET" as const,
            content: bulletText,
            note: null,
          },
        ]),
  ];
  const resultTurnId = input.resultTurnId ?? input.turnId;
  const supersedeTurnIds = (input.supersedeTurnIds ?? []).filter(
    (turnId) => turnId && turnId !== resultTurnId,
  );
  if (supersedeTurnIds.length > 0) {
    operations.push(
      prisma.consultationStatement.deleteMany({
        where: {
          sessionId: input.sessionId,
          turnId: { in: supersedeTurnIds },
          kind: { in: ["INTERVIEW_ANSWER", "RESUME_BULLET"] },
        },
      }),
    );
  }
  operations.push(
    ...statements.map((statement) =>
      prisma.consultationStatement.upsert({
        where: {
          turnId_kind: { turnId: resultTurnId, kind: statement.kind },
        },
        create: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          turnId: resultTurnId,
          kind: statement.kind,
          content: statement.content,
          strengtheningNote: statement.note,
          groundingJson: [],
          promptVersion: CONSULTATION_PROMPT_VERSION,
        },
        update: {
          status: "DRAFT",
          content: statement.content,
          strengtheningNote: statement.note,
          groundingJson: [],
          promptVersion: CONSULTATION_PROMPT_VERSION,
          generation: { increment: 1 },
          approvedAt: null,
        },
      }),
    ),
  );
  if (confirmedGap) {
    operations.push(
      prisma.consultationStatement.deleteMany({
        where: {
          sessionId: input.sessionId,
          turnId: input.resultTurnId ?? input.turnId,
          kind: "RESUME_BULLET",
        },
      }),
    );
  }
  await prisma.$transaction(operations);
  return {
    ok: true,
    followUpQuestion: null,
    coaching,
    missingStarElements: verified.missingStarElements,
    wroteResult: true,
    gapDecision: confirmedGap ? "no_evidence" : "evidence",
    companyMotivation: analysisJson.companyMotivation,
  };
}

export async function retryConsultationGeneration(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const session = await prisma.consultationSession.findFirst({
    where: {
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
  });
  if (!session || session.generationStatus !== "FAILED") {
    throw new TenantError("Consultation is not waiting for a generation retry.");
  }
  const turns = await loadSessionTurns(session.id);
  const failedAnswer = [...turns].reverse().find((turn) => {
    if (turn.speaker !== "SEEKER" || !turn.targetKey) return false;
    if (!turn.analysisJson || typeof turn.analysisJson !== "object") return false;
    return (turn.analysisJson as { status?: unknown }).status === "FAILED";
  });
  if (failedAnswer?.targetKey) {
    const replyToTurnId =
      replyToTurnIdFromAnalysis(failedAnswer.analysisJson) ??
      [...turns]
        .reverse()
        .find(
          (turn) =>
            turn.speaker === "CONSULTANT" &&
            turn.sequence < failedAnswer.sequence &&
            (turn.targetKey === failedAnswer.targetKey ||
              turn.id === replyToTurnIdFromAnalysis(failedAnswer.analysisJson)),
        )?.id;
    const question = replyToTurnId
      ? turns.find(
          (turn) => turn.id === replyToTurnId && turn.speaker === "CONSULTANT",
        )
      : [...turns]
          .reverse()
          .find(
            (turn) =>
              turn.speaker === "CONSULTANT" &&
              turn.targetKey === failedAnswer.targetKey &&
              turn.sequence < failedAnswer.sequence,
          );
    if (!question) {
      throw new TenantError(consultationConversationCopy.generationFailed);
    }
    const { requirement, profile } = await requireApplication(
      input.organizationId,
      input.campaignId,
    );
    const targets = targetsFromRequirement(requirement);
    const target = targets.find((item) => item.key === question.targetKey);
    const answerContext = turns
      .filter(
        (turn) =>
          turn.speaker === "SEEKER" &&
          !turn.skipped &&
          turn.sequence <= failedAnswer.sequence &&
          (replyToTurnIdFromAnalysis(turn.analysisJson) === question.id ||
            turn.targetKey === failedAnswer.targetKey),
      )
      .map((turn) => turn.body)
      .filter(Boolean)
      .join("\n");
    const processed = await processAnswerGeneration({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sessionId: session.id,
      turnId: failedAnswer.id,
      answerContext,
      question: question.body,
      target: target ?? null,
      targets,
      profile,
      replyToTurnId: question.id,
    });
    if (!processed.ok) {
      throw new Error(consultationConversationCopy.generationFailed);
    }
    if (processed.followUpQuestion) {
      const followUpCount = consultationFollowUpCount(
        toQaTurns(turns),
        question.id,
      );
      if (followUpCount < consultationConfig.maxFollowUpsPerTarget) {
        await addTurn({
          organizationId: input.organizationId,
          sessionId: session.id,
          speaker: "CONSULTANT",
          body: followUpBody(processed.coaching, processed.followUpQuestion),
          targetKey: question.targetKey ?? failedAnswer.targetKey,
          followUp: true,
          analysisJson: { replyToTurnId: question.id },
        });
        return;
      }
    }
    return;
  }
  await startConsultation(input);
}

async function setStatus(input: {
  organizationId: string;
  campaignId: string;
  command: "pause" | "resume" | "skip" | "done";
}) {
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session) throw new TenantError("Start the consultation before changing it.");
  let status;
  try {
    status = nextConsultationStatus(session.status, input.command);
  } catch (error) {
    throw new TenantError(
      error instanceof Error ? error.message : "That consultation change is not available.",
    );
  }
  await prisma.consultationSession.update({
    where: { id: session.id },
    data: { status },
  });
}

export async function pauseConsultation(input: {
  organizationId: string;
  campaignId: string;
}) {
  await setStatus({ ...input, command: "pause" });
}

export async function resumeConsultation(input: {
  organizationId: string;
  campaignId: string;
}) {
  await setStatus({ ...input, command: "resume" });
}

export async function skipConsultation(input: {
  organizationId: string;
  campaignId: string;
}) {
  const existing = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!existing) {
    const { campaign } = await requireApplication(
      input.organizationId,
      input.campaignId,
    );
    await prisma.consultationSession.create({
      data: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        productId: campaign.productId,
        status: "SKIPPED",
        promptVersion: CONSULTATION_PROMPT_VERSION,
      },
    });
    await queueAssetsForCampaign(input);
    return;
  }
  await setStatus({ ...input, command: "skip" });
  await queueAssetsForCampaign(input);
}

export async function completeConsultation(input: {
  organizationId: string;
  campaignId: string;
}) {
  await setStatus({ ...input, command: "done" });
  await queueAssetsForCampaign(input);
}

async function loadSessionTurns(sessionId: string) {
  return prisma.consultationTurn.findMany({
    where: { sessionId },
    orderBy: { sequence: "asc" },
  });
}

function toQaTurns(
  turns: Array<{
    id: string;
    speaker: "CONSULTANT" | "SEEKER";
    body: string;
    targetKey: string | null;
    followUp: boolean;
    sequence: number;
    analysisJson?: unknown;
    intent?: string | null;
  }>,
): QaTurn[] {
  return turns.map((turn) => ({
    id: turn.id,
    speaker: turn.speaker,
    body: turn.body,
    targetKey: turn.targetKey,
    followUp: turn.followUp,
    sequence: turn.sequence,
    analysisJson: turn.analysisJson,
    intent: turn.intent,
  }));
}

function toQaStatements(
  statements: Array<{
    id: string;
    turnId: string;
    kind: "INTERVIEW_ANSWER" | "RESUME_BULLET";
    status: string;
    content: string;
    strengtheningNote: string | null;
    createdAt?: Date;
  }>,
): QaStatement[] {
  return statements.map((statement) => ({
    id: statement.id,
    turnId: statement.turnId,
    kind: statement.kind,
    status: statement.status,
    content: statement.content,
    strengtheningNote: statement.strengtheningNote,
    createdAt: statement.createdAt ?? null,
  }));
}

async function loadSessionQaView(sessionId: string) {
  const [turns, statements] = await Promise.all([
    loadSessionTurns(sessionId),
    prisma.consultationStatement.findMany({
      where: { sessionId },
      orderBy: [{ turnId: "asc" }, { kind: "asc" }],
    }),
  ]);
  return {
    turns,
    statements,
    view: buildConsultationQaView({
      turns: toQaTurns(turns),
      statements: toQaStatements(statements),
    }),
  };
}

function consultantForQaItem(
  turns: Awaited<ReturnType<typeof loadSessionTurns>>,
  item: ConsultationQaItem,
) {
  const followUpId = item.followUp?.turnId;
  const followUp = followUpId
    ? turns.find((turn) => turn.id === followUpId && turn.speaker === "CONSULTANT")
    : null;
  const primary = turns.find(
    (turn) => turn.id === item.questionTurnId && turn.speaker === "CONSULTANT",
  );
  return followUp ?? primary ?? null;
}

function replyCouldNotBeRecorded(): never {
  throw new TenantError(consultationConversationCopy.replyFailed);
}

function analysisIsComplete(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  return status !== "FAILED" && status !== "PENDING";
}

async function recordGapShareReply(input: {
  organizationId: string;
  sessionId: string;
  targetKey: string;
  answer: string;
  intent?: string | null;
}): Promise<{
  sessionId: string;
  targetKey: string;
  turnId: string;
  questionTurnId: string;
} | null> {
  const assessment = await prisma.consultationAssessment.findFirst({
    where: { sessionId: input.sessionId, targetKey: input.targetKey },
  });
  if (!assessment) return null;
  const turns = await loadSessionTurns(input.sessionId);
  const existing = [...turns].reverse().find(
    (turn) =>
      turn.speaker === "SEEKER" &&
      turn.body === input.answer &&
      !analysisIsComplete(turn.analysisJson) &&
      turn.targetKey === input.targetKey,
  );
  if (existing) {
    await prisma.consultationSession.update({
      where: { id: input.sessionId },
      data: { generationStatus: "GENERATING", generationError: null },
    });
    return {
      sessionId: input.sessionId,
      targetKey: input.targetKey,
      turnId: existing.id,
      questionTurnId: "",
    };
  }
  const seekerTurn = await addTurn({
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    speaker: "SEEKER",
    body: input.answer,
    targetKey: input.targetKey,
    seekerAuthored: true,
    intent: input.intent ?? "REPLY",
    analysisJson: { status: "PENDING" },
  });
  await prisma.consultationSession.update({
    where: { id: input.sessionId },
    data: { generationStatus: "GENERATING", generationError: null },
  });
  return {
    sessionId: input.sessionId,
    targetKey: input.targetKey,
    turnId: seekerTurn.id,
    questionTurnId: "",
  };
}

export async function recordConsultationReply(input: {
  organizationId: string;
  campaignId: string;
  targetKey?: string | null;
  answer: string;
  intent?: string | null;
}): Promise<{
  sessionId: string;
  targetKey: string;
  turnId: string;
  questionTurnId: string;
}> {
  const answer = input.answer.trim();
  if (!answer) throw new TenantError("Write an answer, or skip the question.");
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session || session.status === "SKIPPED" || session.status === "PAUSED") {
    throw new TenantError(consultationConversationCopy.notAcceptingReplies);
  }
  if (session.status === "DONE") {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { status: "IN_PROGRESS" },
    });
  }
  const { turns, view } = await loadSessionQaView(session.id);
  const requested = input.targetKey?.trim() ?? "";
  const item = requested.startsWith("question:")
    ? findConsultationQaItem(view, requested)
    : resolveReplyableQaItem(view, requested) ??
      (!requested
        ? view.questions.find(consultationQuestionAcceptsReply) ?? null
        : null);
  if (!item && requested && !requested.startsWith("question:")) {
    const shared = await recordGapShareReply({
      organizationId: input.organizationId,
      sessionId: session.id,
      targetKey: requested,
      answer,
      intent: input.intent,
    });
    if (shared) return shared;
  }
  const question = item ? consultantForQaItem(turns, item) : null;
  if (!item || !question) replyCouldNotBeRecorded();
  const targetKey =
    question.targetKey ?? `question:${item.questionTurnId}`;
  const existing = [...turns]
    .reverse()
    .find(
      (turn) =>
        turn.speaker === "SEEKER" &&
        turn.body === answer &&
        !analysisIsComplete(turn.analysisJson) &&
        (replyToTurnIdFromAnalysis(turn.analysisJson) === item.questionTurnId ||
          turn.targetKey === targetKey),
    );
  if (existing) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { generationStatus: "GENERATING", generationError: null },
    });
    return {
      sessionId: session.id,
      targetKey,
      turnId: existing.id,
      questionTurnId: item.questionTurnId,
    };
  }
  const seekerTurn = await addTurn({
    organizationId: input.organizationId,
    sessionId: session.id,
    speaker: "SEEKER",
    body: answer,
    targetKey,
    seekerAuthored: true,
    intent: input.intent ?? "REPLY",
    analysisJson: {
      status: "PENDING",
      replyToTurnId: item.followUp?.turnId ?? item.questionTurnId,
    },
  });
  await prisma.consultationSession.update({
    where: { id: session.id },
    data: { generationStatus: "GENERATING", generationError: null },
  });
  return {
    sessionId: session.id,
    targetKey,
    turnId: seekerTurn.id,
    questionTurnId: item.questionTurnId,
  };
}

export async function answerConsultationQuestion(input: {
  organizationId: string;
  campaignId: string;
  targetKey: string;
  answer: string;
  intent?: string | null;
}): Promise<void> {
  const recorded = await recordConsultationReply(input);
  await processConsultationReply({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sessionId: recorded.sessionId,
    turnId: recorded.turnId,
    targetKey: recorded.targetKey,
    questionTurnId: recorded.questionTurnId,
    answer: input.answer,
    intent: input.intent,
  });
}

export async function processConsultationReply(input: {
  organizationId: string;
  campaignId: string;
  sessionId?: string;
  turnId?: string;
  targetKey?: string;
  questionTurnId?: string;
  answer?: string;
  intent?: string | null;
  forceDecision?: boolean;
}): Promise<void> {
  const answer = input.answer?.trim() ?? "";
  const session = await prisma.consultationSession.findFirst({
    where: {
      organizationId: input.organizationId,
      ...(input.sessionId
        ? { id: input.sessionId }
        : { campaignId: input.campaignId }),
    },
  });
  if (!session || session.status === "SKIPPED" || session.status === "PAUSED") {
    throw new TenantError(consultationConversationCopy.notAcceptingReplies);
  }
  let { turns, view } = await loadSessionQaView(session.id);
  let seekerTurn = input.turnId
    ? turns.find((turn) => turn.id === input.turnId)
    : [...turns].reverse().find(
        (turn) =>
          turn.speaker === "SEEKER" &&
          !turn.skipped &&
          (!input.targetKey ||
            turn.targetKey === input.targetKey ||
            replyToTurnIdFromAnalysis(turn.analysisJson) ===
              parseConsultationReplyTarget(input.targetKey).questionTurnId) &&
          !analysisIsComplete(turn.analysisJson),
      );
  let targetKey = seekerTurn?.targetKey ?? input.targetKey ?? "";
  let questionTurnId =
    input.questionTurnId ??
    replyToTurnIdFromAnalysis(seekerTurn?.analysisJson) ??
    parseConsultationReplyTarget(input.targetKey ?? "").questionTurnId ??
    "";
  if (!seekerTurn) {
    if (!answer) throw new TenantError("Write an answer, or skip the question.");
    const recorded = await recordConsultationReply({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      targetKey: input.targetKey || input.questionTurnId || null,
      answer,
      intent: input.intent,
    });
    targetKey = recorded.targetKey;
    questionTurnId = recorded.questionTurnId;
    const reloaded = await loadSessionQaView(session.id);
    turns = reloaded.turns;
    view = reloaded.view;
    seekerTurn = turns.find((turn) => turn.id === recorded.turnId);
  }
  if (!seekerTurn) replyCouldNotBeRecorded();
  const item =
    view.questions.find((question) => question.questionTurnId === questionTurnId) ??
    resolveReplyableQaItem(
      view,
      questionTurnId
        ? `question:${questionTurnId}`
        : targetKey || input.targetKey || "",
    );
  const question = item
    ? consultantForQaItem(turns, item)
    : turns.find((turn) => turn.id === questionTurnId && turn.speaker === "CONSULTANT") ??
      [...turns]
        .reverse()
        .find(
          (turn) =>
            turn.speaker === "CONSULTANT" &&
            turn.sequence < seekerTurn.sequence &&
            (turn.id === questionTurnId ||
              turn.targetKey === (seekerTurn.targetKey ?? targetKey)),
        );
  const resolvedItem =
    item ??
    (question
      ? view.questions.find(
          (questionItem) => questionItem.questionTurnId === question.id,
        ) ?? null
      : view.questions.find(
          (questionItem) =>
            questionItem.targetKey ===
            (targetKey.startsWith("question:") ? "" : targetKey),
        ) ?? null);
  if (question) {
    questionTurnId = resolvedItem?.questionTurnId ?? question.id;
  }
  const assessmentKey =
    question?.targetKey ??
    resolvedItem?.targetKey ??
    (targetKey.startsWith("question:") ? "" : targetKey);
  if (!question && !assessmentKey) {
    await failGeneration(session.id, consultationConversationCopy.generationFailed);
    throw new Error(consultationConversationCopy.generationFailed);
  }
  const seekerTurnId = seekerTurn.id;
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const targets = targetsFromRequirement(requirement);
  const target = assessmentKey
    ? targets.find((entry) => entry.key === assessmentKey)
    : undefined;
  const recordedAnswer =
    ("body" in seekerTurn && typeof seekerTurn.body === "string"
      ? seekerTurn.body
      : answer) || answer;
  const priorOnCard =
    resolvedItem?.seekerAnswers
      .filter((entry) => entry.id !== seekerTurnId)
      .map((entry) => entry.body) ??
    turns
      .filter(
        (turn) =>
          turn.speaker === "SEEKER" &&
          !turn.skipped &&
          turn.id !== seekerTurnId &&
          replyToTurnIdFromAnalysis(turn.analysisJson) === questionTurnId,
      )
      .map((turn) => turn.body);
  const answerContext = [...priorOnCard, recordedAnswer]
    .filter(Boolean)
    .join("\n");
  const askedTurnId = replyToTurnIdFromAnalysis(seekerTurn.analysisJson);
  const askedTurn = askedTurnId
    ? turns.find(
        (turn) => turn.id === askedTurnId && turn.speaker === "CONSULTANT",
      )
    : null;
  const resultTurnId =
    resolvedItem?.seekerAnswers.at(-1)?.id ?? seekerTurnId;
  const supersedeTurnIds =
    resolvedItem?.seekerAnswers
      .map((entry) => entry.id)
      .filter((turnId) => turnId !== resultTurnId) ?? [];
  const followUpCount = questionTurnId
    ? consultationFollowUpCount(toQaTurns(turns), questionTurnId)
    : turns.filter(
        (turn) =>
          turn.speaker === "CONSULTANT" &&
          turn.followUp &&
          turn.targetKey === assessmentKey,
      ).length;
  const allowFollowUp =
    !input.forceDecision &&
    assessmentKey !== "chronology" &&
    followUpCount < consultationConfig.maxFollowUpsPerTarget;
  const processed = await processAnswerGeneration({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sessionId: session.id,
    turnId: seekerTurnId,
    resultTurnId,
    supersedeTurnIds,
    answerContext,
    question:
      askedTurn?.body ??
      resolvedItem?.followUp?.text ??
      question?.body ??
      target?.text ??
      assessmentKey,
    target: target ?? null,
    targets,
    profile,
    replyToTurnId: questionTurnId || null,
    allowFollowUp,
  });
  if (!processed.ok) {
    throw new Error(consultationConversationCopy.generationFailed);
  }
  if (assessmentKey === WHY_THIS_COMPANY_TARGET_KEY) {
    await persistWhyThisCompany({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      companyMotivation: processed.companyMotivation,
    });
  }
  const askFollowUp =
    !processed.wroteResult &&
    Boolean(processed.followUpQuestion) &&
    allowFollowUp;
  const askedQuestions = askedQuestionsFromTurns(turns);
  if (
    askFollowUp &&
    processed.followUpQuestion &&
    askedQuestions.length < consultationConfig.applicationQuestionLimit &&
    !questionDuplicatesAsked(processed.followUpQuestion, askedQuestions)
  ) {
    await addTurn({
      organizationId: input.organizationId,
      sessionId: session.id,
      speaker: "CONSULTANT",
      body: followUpBody(processed.coaching, processed.followUpQuestion),
      targetKey: assessmentKey || targetKey,
      followUp: true,
      analysisJson: {
        replyToTurnId: questionTurnId,
      },
    });
  }
}

function declinedPolishInput(value: unknown): {
  answerContext: string;
  story: {
    situation: string | null;
    task: string | null;
    action: string | null;
    result: string | null;
  };
  missingStarElements: string[];
  gapDecision: "evidence" | "no_evidence" | "incomplete" | null;
  analysis: Record<string, unknown>;
} | null {
  if (!value || typeof value !== "object") return null;
  const analysis = value as Record<string, unknown>;
  if (typeof analysis.answerContext !== "string") return null;
  const row =
    analysis.story && typeof analysis.story === "object"
      ? (analysis.story as Record<string, unknown>)
      : {};
  const part = (name: string) =>
    typeof row[name] === "string" && row[name].trim()
      ? row[name].trim()
      : null;
  const missingStarElements = Array.isArray(analysis.missingStarElements)
    ? analysis.missingStarElements.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const gapDecision =
    analysis.gapDecision === "evidence" ||
    analysis.gapDecision === "no_evidence" ||
    analysis.gapDecision === "incomplete"
      ? analysis.gapDecision
      : null;
  if (missingStarElements.length === 0 && !gapDecision) return null;
  return {
    answerContext: analysis.answerContext,
    story: {
      situation: part("situation"),
      task: part("task"),
      action: part("action"),
      result: part("result"),
    },
    missingStarElements,
    gapDecision,
    analysis,
  };
}

async function declineConsultationFollowUp(input: {
  organizationId: string;
  campaignId: string;
  sessionId: string;
  question: {
    sequence: number;
    targetKey: string | null;
  };
  turns: Awaited<ReturnType<typeof loadSessionTurns>>;
}): Promise<void> {
  const priorAnswer = [...input.turns]
    .reverse()
    .find(
      (turn) =>
        turn.speaker === "SEEKER" &&
        !turn.skipped &&
        turn.targetKey === input.question.targetKey &&
        turn.sequence < input.question.sequence,
    );
  const analyzed = declinedPolishInput(priorAnswer?.analysisJson);
  if (!priorAnswer || !analyzed || !input.question.targetKey) {
    throw new TenantError(
      "The answer behind this follow-up could not be prepared. Answer the follow-up or retry.",
    );
  }
  const { profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const confirmedGap =
    analyzed.gapDecision === "no_evidence" ||
    (!analyzed.story.result && analyzed.gapDecision !== "evidence");
  const polished = await polishAnswerWithQuality({
    answer: analyzed.answerContext,
    story: analyzed.story,
    sources: polishingSources({
      answer: analyzed.answerContext,
      turnId: priorAnswer.id,
    }),
    seekerAnswers: analyzed.answerContext
      .split("\n")
      .map((answer) => answer.trim())
      .filter(Boolean),
    declinedFollowUp: true,
    confirmedGap,
    firstName: profileFirstName(profile),
    strengtheningNeeds: analyzed.missingStarElements,
    profileItems: profileEvidenceItems(profile),
    usage: consultationUsage(
      input.organizationId,
      input.campaignId,
      "CONSULTATION_REPLY",
    ),
  });
  if (!polished.ok) throw new TenantError(polished.message);
  const nextSequence =
    input.turns.reduce(
      (maximum, turn) => Math.max(maximum, turn.sequence),
      0,
    ) + 1;
  const statements: Array<{
    kind: "INTERVIEW_ANSWER" | "RESUME_BULLET";
    value: { text: string };
    strengtheningNote: string | null;
  }> = [];
  if (polished.data.interviewAnswer.trim()) {
    statements.push({
      kind: "INTERVIEW_ANSWER",
      value: { text: polished.data.interviewAnswer.trim() },
      strengtheningNote: polished.data.strengtheningNote?.trim() || null,
    });
  }
  if (!confirmedGap && polished.data.resumeBullet?.trim()) {
    statements.push({
      kind: "RESUME_BULLET",
      value: { text: polished.data.resumeBullet.trim() },
      strengtheningNote: null,
    });
  }
  await prisma.$transaction([
    prisma.consultationTurn.create({
      data: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sequence: nextSequence,
        speaker: "SEEKER",
        body: "",
        targetKey: input.question.targetKey,
        skipped: true,
        seekerAuthored: true,
        analysisJson: { followUpDeclined: true },
      },
    }),
    prisma.consultationTurn.update({
      where: { id: priorAnswer.id },
      data: {
        analysisJson: {
          ...analyzed.analysis,
          followUpDeclined: true,
          gapDecision: confirmedGap ? "no_evidence" : "evidence",
          strengtheningNote: polished.data.strengtheningNote,
        } as Prisma.InputJsonValue,
      },
    }),
    prisma.consultationSession.update({
      where: { id: input.sessionId },
      data: { generationStatus: "READY", generationError: null },
    }),
    ...statements.map((statement) =>
      prisma.consultationStatement.upsert({
        where: {
          turnId_kind: { turnId: priorAnswer.id, kind: statement.kind },
        },
        create: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          turnId: priorAnswer.id,
          kind: statement.kind,
          content: statement.value.text.trim(),
          strengtheningNote: statement.strengtheningNote,
          groundingJson: [],
          promptVersion: CONSULTATION_PROMPT_VERSION,
        },
        update: {
          status: "DRAFT",
          content: statement.value.text.trim(),
          strengtheningNote: statement.strengtheningNote,
          groundingJson: [],
          promptVersion: CONSULTATION_PROMPT_VERSION,
          generation: { increment: 1 },
          approvedAt: null,
        },
      }),
    ),
  ]);
}

export async function skipConsultationQuestion(input: {
  organizationId: string;
  campaignId: string;
  targetKey: string;
}): Promise<void> {
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session || session.status !== "IN_PROGRESS") {
    throw new TenantError(consultationConversationCopy.notAcceptingReplies);
  }
  const { turns, view } = await loadSessionQaView(session.id);
  const item = resolveReplyableQaItem(view, input.targetKey);
  const question = item ? consultantForQaItem(turns, item) : null;
  if (!item || !question) replyCouldNotBeRecorded();
  if (question.followUp || item.followUp) {
    await declineConsultationFollowUp({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sessionId: session.id,
      question,
      turns,
    });
    return;
  }
  await addTurn({
    organizationId: input.organizationId,
    sessionId: session.id,
    speaker: "SEEKER",
    body: "",
    targetKey: question.targetKey ?? input.targetKey,
    skipped: true,
    seekerAuthored: true,
    analysisJson: {
      status: "READY",
      replyToTurnId: item.questionTurnId,
    },
  });
  const refreshed = await loadSessionQaView(session.id);
  if (consultationHasUnansweredQuestions(refreshed.view)) return;
  const { campaign, requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const stored = await prisma.consultationAssessment.findMany({
    where: { sessionId: session.id },
  });
  const assessments = stored.map(storedAssessment);
  const { askedKeys, skippedKeys } = askedAndSkipped(refreshed.turns);
  markWhyThisCompanyAsked(askedKeys, {
    campaignId: campaign.id,
    whyThisCompany: campaign.whyThisCompany,
    profile,
  });
  if (gapsAreCovered(assessments, skippedKeys)) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { status: "DONE" },
    });
    await queueAssetsWhenConsultationEnds(session.id);
    return;
  }
  const roles = await loadCoachHiringTeam(input.organizationId, input.campaignId);
  const next = await planAndStoreRound({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sessionId: session.id,
    askedKeys,
    skippedKeys,
    profile,
    requirement,
    targets: targetsFromRequirement(requirement),
    roles,
  });
  await finishIfPlanningIsComplete(session.id, next);
}

function completeStoryFromAnalysis(value: unknown): {
  answerContext: string;
  story: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  missingStarElements: string[];
  followUpDeclined: boolean;
  gapDecision: "evidence" | "no_evidence" | "incomplete" | null;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    answerContext?: unknown;
    story?: unknown;
    missingStarElements?: unknown;
    followUpDeclined?: unknown;
    gapDecision?: unknown;
  };
  if (typeof row.answerContext !== "string" || !row.story || typeof row.story !== "object") {
    return null;
  }
  const story = row.story as Record<string, unknown>;
  if (
    typeof story.situation !== "string" ||
    typeof story.task !== "string" ||
    typeof story.action !== "string" ||
    typeof story.result !== "string"
  ) {
    return null;
  }
  return {
    answerContext: row.answerContext,
    story: {
      situation: story.situation,
      task: story.task,
      action: story.action,
      result: story.result,
    },
    missingStarElements: Array.isArray(row.missingStarElements)
      ? row.missingStarElements.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    followUpDeclined: row.followUpDeclined === true,
    gapDecision:
      row.gapDecision === "evidence" ||
      row.gapDecision === "no_evidence" ||
      row.gapDecision === "incomplete"
        ? row.gapDecision
        : null,
  };
}

export async function regenerateConsultationStatement(input: {
  organizationId: string;
  statementId: string;
}): Promise<void> {
  const statement = await prisma.consultationStatement.findFirst({
    where: { id: input.statementId, organizationId: input.organizationId },
    include: { turn: true, session: true },
  });
  if (!statement) throw new TenantError("That polished statement was not found.");
  const analyzed = completeStoryFromAnalysis(statement.turn.analysisJson);
  const answer =
    analyzed?.answerContext.trim() ||
    statement.turn.body.trim();
  if (!answer) {
    throw new TenantError(consultationConversationCopy.generationFailed);
  }
  const { profile } = await requireApplication(
    input.organizationId,
    statement.session.campaignId,
  );
  const confirmedGap = analyzed?.gapDecision === "no_evidence";
  const polished = await polishAnswerWithQuality({
    answer,
    story: analyzed?.story ?? {
      situation: null,
      task: null,
      action: null,
      result: null,
    },
    sources: polishingSources({
      answer,
      turnId: statement.turnId,
    }),
    seekerAnswers: answer
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean),
    declinedFollowUp: analyzed?.followUpDeclined ?? false,
    confirmedGap,
    firstName: profileFirstName(profile),
    strengtheningNeeds: analyzed?.missingStarElements ?? [],
    profileItems: profileEvidenceItems(profile),
    usage: consultationUsage(
      input.organizationId,
      statement.session.campaignId,
      "CONSULTATION_REPLY",
    ),
  });
  if (!polished.ok) throw new TenantError(polished.message);
  const value =
    statement.kind === "INTERVIEW_ANSWER"
      ? polished.data.interviewAnswer
      : polished.data.resumeBullet;
  if (!value?.trim()) {
    throw new TenantError(consultationConversationCopy.generationFailed);
  }
  const story = await prisma.profileStory.findFirst({
    where: {
      organizationId: input.organizationId,
      consultationTurnId: statement.turnId,
    },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.consultationStatement.update({
      where: { id: statement.id },
      data: {
        status: "DRAFT",
        content: value.trim(),
        strengtheningNote:
          statement.kind === "INTERVIEW_ANSWER"
            ? polished.data.strengtheningNote?.trim() || null
            : null,
        groundingJson: [],
        promptVersion: CONSULTATION_PROMPT_VERSION,
        generation: { increment: 1 },
        approvedAt: null,
      },
    }),
    ...(story
      ? [
          prisma.profileStory.update({
            where: { id: story.id },
            data:
              statement.kind === "INTERVIEW_ANSWER"
                ? {
                    interviewAnswer: null,
                    interviewAnswerApprovedAt: null,
                  }
                : { resumeBullet: null, resumeBulletApprovedAt: null },
          }),
        ]
      : []),
  ]);
}

export async function approveConsultationQaResult(input: {
  organizationId: string;
  statementIds: string[];
}): Promise<void> {
  if (input.statementIds.length === 0) {
    throw new TenantError("That polished statement was not found.");
  }
  for (const statementId of input.statementIds) {
    const statement = await prisma.consultationStatement.findFirst({
      where: { id: statementId, organizationId: input.organizationId },
      select: { content: true },
    });
    if (!statement) throw new TenantError("That polished statement was not found.");
    await approveConsultationStatement({
      organizationId: input.organizationId,
      statementId,
      content: statement.content,
    });
  }
}

export async function regenerateConsultationQaResult(input: {
  organizationId: string;
  statementIds: string[];
}): Promise<void> {
  if (input.statementIds.length === 0) {
    throw new TenantError("That polished statement was not found.");
  }
  for (const statementId of input.statementIds) {
    await regenerateConsultationStatement({
      organizationId: input.organizationId,
      statementId,
    });
  }
}

export async function approveConsultationStatement(input: {
  organizationId: string;
  statementId: string;
  content: string;
}): Promise<void> {
  const content = input.content.trim();
  if (!content) throw new TenantError("A polished statement cannot be empty.");
  const statement = await prisma.consultationStatement.findFirst({
    where: { id: input.statementId, organizationId: input.organizationId },
    include: { turn: true, session: true },
  });
  if (!statement) throw new TenantError("That polished statement was not found.");
  const analyzed = completeStoryFromAnalysis(statement.turn.analysisJson);
  const { product } = await requireApplication(
    input.organizationId,
    statement.session.campaignId,
  );
  const proposal = await prisma.consultationProposal.findFirst({
    where: { turnId: statement.turnId, kind: "STORY" },
    orderBy: { createdAt: "desc" },
    select: { competencyLinks: true },
  });
  const existingStory = await prisma.profileStory.findFirst({
    where: {
      organizationId: input.organizationId,
      consultationTurnId: statement.turnId,
    },
  });
  const now = new Date();
  const polishedFields =
    statement.kind === "INTERVIEW_ANSWER"
      ? {
          interviewAnswer: content,
          interviewAnswerApprovedAt: now,
        }
      : {
          resumeBullet: content,
          resumeBulletApprovedAt: now,
        };
  await prisma.$transaction([
    prisma.consultationStatement.update({
      where: { id: statement.id },
      data: {
        status: "APPROVED",
        content,
        groundingJson: [],
        approvedAt: now,
      },
    }),
    existingStory
      ? prisma.profileStory.update({
          where: { id: existingStory.id },
          data: {
            verbatimAnswer: analyzed?.answerContext ?? statement.turn.body,
            ...polishedFields,
          },
        })
      : prisma.profileStory.create({
          data: {
            organizationId: input.organizationId,
            productId: product.id,
            situation: analyzed?.story.situation ?? "",
            task: analyzed?.story.task ?? "",
            action: analyzed?.story.action ?? "",
            result: analyzed?.story.result ?? content,
            competencyLinks:
              (proposal?.competencyLinks as Prisma.InputJsonValue | null) ?? [],
            consultationTurnId: statement.turnId,
            seekerAuthored: true,
            verbatimAnswer: analyzed?.answerContext ?? statement.turn.body,
            ...polishedFields,
          },
        }),
  ]);
}

export async function resolveConsultationStatementFlag(input: {
  organizationId: string;
  statementId: string;
  claimId: string;
  action: "KEPT" | "REMOVED";
}): Promise<void> {
  const statement = await prisma.consultationStatement.findFirst({
    where: { id: input.statementId, organizationId: input.organizationId },
  });
  if (!statement) throw new TenantError("That polished statement was not found.");
  if (input.action === "REMOVED") {
    await prisma.consultationStatement.delete({ where: { id: statement.id } });
    return;
  }
}

export async function saveEditedConsultationStatement(input: {
  organizationId: string;
  statementId: string;
  content: string;
}): Promise<void> {
  const content = input.content.trim();
  if (!content) throw new TenantError("A polished statement cannot be empty.");
  const statement = await prisma.consultationStatement.findFirst({
    where: { id: input.statementId, organizationId: input.organizationId },
  });
  if (!statement) throw new TenantError("That polished statement was not found.");
  await prisma.consultationStatement.update({
    where: { id: statement.id },
    data: {
      content,
    },
  });
}

export async function editConsultationAnswer(input: {
  organizationId: string;
  campaignId: string;
  turnId: string;
  answer: string;
}): Promise<void> {
  const body = input.answer.trim();
  if (!body) throw new TenantError("Write an answer, or skip the question.");
  const turn = await prisma.consultationTurn.findFirst({
    where: {
      id: input.turnId,
      organizationId: input.organizationId,
      speaker: "SEEKER",
      skipped: false,
    },
    include: { session: true },
  });
  if (!turn || turn.session.campaignId !== input.campaignId) {
    throw new TenantError(consultationConversationCopy.replyFailed);
  }
  if (turn.session.status === "SKIPPED" || turn.session.status === "PAUSED") {
    throw new TenantError(consultationConversationCopy.notAcceptingReplies);
  }
  await prisma.consultationTurn.update({
    where: { id: turn.id },
    data: { body },
  });
  await processConsultationReply({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sessionId: turn.sessionId,
    turnId: turn.id,
    questionTurnId: replyToTurnIdFromAnalysis(turn.analysisJson) ?? undefined,
    targetKey: turn.targetKey ?? consultationReplyTargetKey(
      replyToTurnIdFromAnalysis(turn.analysisJson) ?? "",
    ),
    answer: body,
  });
}

export async function repairConsultationResults(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const session = await prisma.consultationSession.findFirst({
    where: {
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
  });
  if (!session) return;
  const { view } = await loadSessionQaView(session.id);
  const broken = view.questions.filter(consultationItemNeedsResultRepair);
  for (const item of broken) {
    const latest = item.seekerAnswers.at(-1);
    if (!latest) continue;
    await processConsultationReply({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sessionId: session.id,
      turnId: latest.id,
      questionTurnId: item.questionTurnId,
      targetKey: consultationReplyTargetKey(item.questionTurnId),
      forceDecision: true,
    });
  }
  const { view: refreshed } = await loadSessionQaView(session.id);
  for (const item of refreshed.questions) {
    const latest = item.seekerAnswers.at(-1);
    if (!latest) continue;
    const staleTurnIds = item.seekerAnswers
      .map((answer) => answer.id)
      .filter((turnId) => turnId !== latest.id);
    if (staleTurnIds.length === 0) continue;
    await prisma.consultationStatement.deleteMany({
      where: {
        sessionId: session.id,
        turnId: { in: staleTurnIds },
        kind: { in: ["INTERVIEW_ANSWER", "RESUME_BULLET"] },
      },
    });
  }
}

export async function confirmConsultationProposal(input: {
  organizationId: string;
  proposalId: string;
  text: string;
  situation: string | null;
  task: string | null;
  action: string | null;
  result: string | null;
}): Promise<void> {
  const proposal = await prisma.consultationProposal.findFirst({
    where: { id: input.proposalId, organizationId: input.organizationId },
    include: { session: true, turn: true },
  });
  if (!proposal) throw new TenantError("That proposed item was not found.");
  if (proposal.status !== "PENDING") {
    throw new TenantError("That item has already been confirmed or dismissed.");
  }
  const text = input.text.trim();
  if (!text) throw new TenantError("Confirmed text cannot be empty.");
  const { product, profile } = await requireApplication(
    input.organizationId,
    proposal.session.campaignId,
  );
  if (proposal.kind === "FACT") {
    const next = appendConfirmedFact(profile, {
      id: proposal.profileItemId ?? `consult_${proposal.turnId}_fact`,
      text,
      turnId: proposal.turnId,
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { profileJson: next },
    });
  } else {
    const situation = input.situation?.trim() || "";
    const task = input.task?.trim() || "";
    const action = input.action?.trim() || "";
    const result = input.result?.trim() || "";
    if (!situation || !task || !action || !result) {
      throw new TenantError("A story needs a situation, task, action, and result.");
    }
    const links = Array.isArray(proposal.competencyLinks)
      ? proposal.competencyLinks
      : [];
    const existingStory = await prisma.profileStory.findFirst({
      where: {
        organizationId: input.organizationId,
        consultationTurnId: proposal.turnId,
      },
    });
    const analyzed = completeStoryFromAnalysis(proposal.turn.analysisJson);
    if (existingStory) {
      await prisma.profileStory.update({
        where: { id: existingStory.id },
        data: {
          situation,
          task,
          action,
          result,
          competencyLinks: links,
          verbatimAnswer:
            analyzed?.answerContext ?? existingStory.verbatimAnswer,
        },
      });
    } else {
      await prisma.profileStory.create({
        data: {
          organizationId: input.organizationId,
          productId: product.id,
          situation,
          task,
          action,
          result,
          competencyLinks: links,
          consultationTurnId: proposal.turnId,
          seekerAuthored: true,
          verbatimAnswer: analyzed?.answerContext ?? proposal.turn.body,
        },
      });
    }
  }
  await prisma.consultationProposal.update({
    where: { id: proposal.id },
    data: { status: "CONFIRMED", text },
  });
  const prepContactId = contactIdFromPersonPrepTarget(proposal.turn.targetKey);
  if (prepContactId) {
    const { appendPersonPrepAnswer } = await import("@/lib/interview/person-prep");
    await appendPersonPrepAnswer({
      organizationId: input.organizationId,
      campaignId: proposal.session.campaignId,
      contactId: prepContactId,
      text,
      turnId: proposal.turnId,
    });
  }
  const assessments = await prisma.consultationAssessment.findMany({
    where: { sessionId: proposal.sessionId },
  });
  const skipped = await prisma.consultationTurn.findMany({
    where: { sessionId: proposal.sessionId, speaker: "SEEKER", skipped: true },
    select: { targetKey: true },
  });
  const covered = gapsAreCovered(
    assessments.map(storedAssessment),
    new Set(skipped.map((turn) => turn.targetKey).filter((key): key is string => Boolean(key))),
  );
  if (covered && proposal.session.status === "IN_PROGRESS") {
    await prisma.consultationSession.update({
      where: { id: proposal.sessionId },
      data: { status: "DONE" },
    });
    await queueAssetsWhenConsultationEnds(proposal.sessionId);
  }
}

export async function confirmConsultationResult(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session) throw new TenantError("The consultation has not started.");
  const drafts = await prisma.consultationStatement.findMany({
    where: { sessionId: session.id, status: "DRAFT" },
    orderBy: { createdAt: "asc" },
  });
  if (drafts.length === 0) {
    throw new TenantError("There is no polished result to use yet.");
  }
  const turnId = drafts[0]!.turnId;
  const proposals = await prisma.consultationProposal.findMany({
    where: { sessionId: session.id, turnId, status: "PENDING" },
  });
  for (const proposal of proposals) {
    const story =
      proposal.storyJson && typeof proposal.storyJson === "object"
        ? (proposal.storyJson as {
            situation?: unknown;
            task?: unknown;
            action?: unknown;
            result?: unknown;
          })
        : null;
    await confirmConsultationProposal({
      organizationId: input.organizationId,
      proposalId: proposal.id,
      text: proposal.text,
      situation: typeof story?.situation === "string" ? story.situation : null,
      task: typeof story?.task === "string" ? story.task : null,
      action: typeof story?.action === "string" ? story.action : null,
      result: typeof story?.result === "string" ? story.result : null,
    });
  }
  for (const statement of drafts) {
    await approveConsultationStatement({
      organizationId: input.organizationId,
      statementId: statement.id,
      content: statement.content,
    });
  }
}

export async function continueConsultationPlanning(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session) throw new TenantError("The consultation has not started.");
  if (session.status === "SKIPPED" || session.status === "PAUSED") return;
  if (session.status === "DONE") {
    await queueAssetsWhenConsultationEnds(session.id);
    return;
  }
  const { turns, view } = await loadSessionQaView(session.id);
  if (consultationHasUnansweredQuestions(view)) return;
  const { campaign, requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const stored = await prisma.consultationAssessment.findMany({
    where: { sessionId: session.id },
  });
  const assessments = stored.map(storedAssessment);
  const { askedKeys, skippedKeys } = askedAndSkipped(turns);
  markWhyThisCompanyAsked(askedKeys, {
    campaignId: campaign.id,
    whyThisCompany: campaign.whyThisCompany,
    profile,
  });
  if (gapsAreCovered(assessments, skippedKeys)) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { status: "DONE" },
    });
    await queueAssetsWhenConsultationEnds(session.id);
    return;
  }
  const roles = await loadCoachHiringTeam(input.organizationId, input.campaignId);
  const next = await planAndStoreRound({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sessionId: session.id,
    askedKeys,
    skippedKeys,
    profile,
    requirement,
    targets: targetsFromRequirement(requirement),
    roles,
  });
  await finishIfPlanningIsComplete(session.id, next);
}

export async function reviseConsultationResult(input: {
  organizationId: string;
  campaignId: string;
  instruction: string;
}): Promise<void> {
  const instruction = input.instruction.trim();
  if (!instruction) throw new TenantError("Write what should change.");
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session) throw new TenantError("The consultation has not started.");
  const draft = await prisma.consultationStatement.findFirst({
    where: { sessionId: session.id, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
  });
  if (!draft) {
    throw new TenantError("There is no polished result to change yet.");
  }
  const turn = await prisma.consultationTurn.findUnique({
    where: { id: draft.turnId },
  });
  if (!turn?.targetKey) {
    throw new TenantError("There is no polished result to change yet.");
  }
  const seekerTurn = await addTurn({
    organizationId: input.organizationId,
    sessionId: session.id,
    speaker: "SEEKER",
    body: instruction,
    targetKey: turn.targetKey,
    seekerAuthored: true,
    intent: "CHANGE",
  });
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const targets = targetsFromRequirement(requirement);
  const question = await prisma.consultationTurn.findFirst({
    where: {
      sessionId: session.id,
      speaker: "CONSULTANT",
      targetKey: turn.targetKey,
    },
    orderBy: { sequence: "asc" },
  });
  if (!question) {
    throw new TenantError("The question for this story was not found.");
  }
  const prior = await prisma.consultationTurn.findMany({
    where: {
      sessionId: session.id,
      speaker: "SEEKER",
      targetKey: turn.targetKey,
      skipped: false,
    },
    orderBy: { sequence: "asc" },
  });
  await processAnswerGeneration({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sessionId: session.id,
    turnId: seekerTurn.id,
    answerContext: prior.map((item) => item.body).filter(Boolean).join("\n"),
    question: question.body,
    target: targets.find((item) => item.key === turn.targetKey) ?? null,
    targets,
    profile,
  });
}

export async function flagConsultationInaccuracy(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session) throw new TenantError("The consultation has not started.");
  const draft = await prisma.consultationStatement.findFirst({
    where: { sessionId: session.id, status: "DRAFT" },
    include: { turn: true },
    orderBy: { createdAt: "desc" },
  });
  if (!draft?.turn.targetKey) {
    throw new TenantError("There is no polished result to correct yet.");
  }
  const flaggedAt = new Date();
  await prisma.consultationStatement.updateMany({
    where: {
      sessionId: session.id,
      turnId: draft.turnId,
      status: "DRAFT",
    },
    data: { inaccuracyFlaggedAt: flaggedAt },
  });
  const turns = await loadSessionTurns(session.id);
  const { askedKeys, skippedKeys } = askedAndSkipped(turns);
  askedKeys.delete(draft.turn.targetKey);
  const { campaign, requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  markWhyThisCompanyAsked(askedKeys, {
    campaignId: campaign.id,
    whyThisCompany: campaign.whyThisCompany,
    profile,
  });
  askedKeys.delete(draft.turn.targetKey);
  const roles = await loadCoachHiringTeam(input.organizationId, input.campaignId);
  await planAndStoreRound({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sessionId: session.id,
    askedKeys,
    skippedKeys,
    profile,
    requirement,
    targets: targetsFromRequirement(requirement),
    roles,
    focusTargetKey: draft.turn.targetKey,
    focusGuidance: [
      "The seeker said the last polished result was not accurate. Ask what is wrong before rewriting.",
    ],
  });
}

export async function replyConsultation(input: {
  organizationId: string;
  campaignId: string;
  answer: string;
}): Promise<void> {
  const answer = input.answer.trim();
  if (!answer) throw new TenantError("Write a reply.");
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session || session.status !== "IN_PROGRESS") {
    throw new TenantError(consultationConversationCopy.notAcceptingReplies);
  }
  const { view } = await loadSessionQaView(session.id);
  const open = view.questions.find(consultationQuestionAcceptsReply);
  if (open) {
    await answerConsultationQuestion({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      targetKey: `question:${open.questionTurnId}`,
      answer,
      intent: "REPLY",
    });
    return;
  }
  const drafts = await prisma.consultationStatement.count({
    where: { sessionId: session.id, status: "DRAFT" },
  });
  if (drafts > 0) {
    await reviseConsultationResult({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      instruction: answer,
    });
    return;
  }
  throw new TenantError(consultationConversationCopy.replyFailed);
}

export async function dismissConsultationProposal(input: {
  organizationId: string;
  proposalId: string;
}): Promise<void> {
  const proposal = await prisma.consultationProposal.findFirst({
    where: { id: input.proposalId, organizationId: input.organizationId, status: "PENDING" },
  });
  if (!proposal) throw new TenantError("That proposed item was not found.");
  await prisma.consultationProposal.update({
    where: { id: proposal.id },
    data: { status: "DISMISSED" },
  });
}

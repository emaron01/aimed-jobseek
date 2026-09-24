import { Prisma } from "@prisma/client";
import type { JobScorecard, ScorecardItem } from "@/lib/job-requirement/types";
import {
  planConsultationWithModel,
  extractWithModel,
  polishAnswerWithModel,
  groundStatementWithModel,
} from "@/lib/consultation/ai";
import {
  evidenceTargets,
  gapsAreCovered,
  profileEvidenceItems,
  verifyModelAssessments,
  type EvidenceAssessment,
  type EvidenceTarget,
} from "@/lib/consultation/assess";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  matchConsultationFocus,
  planQuestionRound,
  seniorityWarrantsChronology,
} from "@/lib/consultation/questions";
import {
  bannedPhraseHits,
  validateGroundedStatement,
  validateInterviewAnswerQuality,
  type GroundingSource,
} from "@/lib/consultation/output-quality";
import { nextConsultationStatus } from "@/lib/consultation/state";
import {
  appendConfirmedFact,
  proposalsFromExtraction,
} from "@/lib/consultation/write-back";
import { prisma } from "@/lib/prisma";
import { consultationConfig, vocab } from "@/lib/product-config";
import {
  emptyCandidateProfile,
  parseCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
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
    select: { id: true, productId: true },
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
  return { campaign, requirement, product, profile: parsed.profile };
}

function targetsFromRequirement(requirement: {
  requiredItems: unknown;
  preferredItems: unknown;
  scorecardJson: unknown;
}): EvidenceTarget[] {
  return evidenceTargets({
    requiredItems: parseStringArray(requirement.requiredItems),
    preferredItems: parseStringArray(requirement.preferredItems),
    scorecard: readScorecard(requirement.scorecardJson),
  });
}

async function hiringTeam(
  organizationId: string,
  campaignId: string,
) {
  const roles = await prisma.persona.findMany({
    where: { organizationId, campaignId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      targetTitles: true,
      whyThisPersonaMatters: true,
      profileJson: true,
    },
  });
  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    likelyTitles: parseStringArray(role.targetTitles),
    whyThisRoleMatters: role.whyThisPersonaMatters,
    personaContext: role.profileJson,
  }));
}

async function saveAssessments(
  organizationId: string,
  sessionId: string,
  assessments: EvidenceAssessment[],
) {
  for (const assessment of assessments) {
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
  questionContext?: {
    requirementInterpretation: string | null;
    hiringTeamRoleId: string;
    whoCaresNote: string;
  };
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
      questionContextJson:
        (input.questionContext as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
}

const INTERNAL_SYSTEM_STATE =
  /\b(?:research (?:status|is|isn't|has|hasn't|not|pending|incomplete|unavailable)|confidence(?: score)?|ambiguit(?:y|ies)|ambiguous|missing (?:data|information|context)|internal (?:state|system)|prompt|model (?:output|behavior|generation)|not configured)\b/i;

function extractionReferencesInternalState(extracted: {
  demonstratedTargets: Array<{ explanation: string }>;
  followUpQuestion: string | null;
}): boolean {
  return [
    ...extracted.demonstratedTargets.map((item) => item.explanation),
    extracted.followUpQuestion ?? "",
  ].some((text) => INTERNAL_SYSTEM_STATE.test(text));
}

function polishingSources(input: {
  answer: string;
  turnId: string;
  profile: ReturnType<typeof parseCandidateProfile>;
}): GroundingSource[] {
  return [
    { id: `answer:${input.turnId}`, text: input.answer },
    ...profileEvidenceItems(input.profile)
      .filter((item) => item.kind === "FACT")
      .map((item) => ({ id: item.id, text: item.text })),
  ];
}

async function extractAnswerWithQuality(input: {
  answer: string;
  question: string;
  target: EvidenceTarget | null;
  targets: EvidenceTarget[];
}) {
  let feedback: string[] = [];
  for (
    let attempt = 0;
    attempt <= consultationConfig.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const extracted = await extractWithModel({
      ...input,
      qualityFeedback: feedback,
    });
    if (!extracted.ok) return extracted;
    const narrative = [
      ...extracted.data.demonstratedTargets.map((item) => item.explanation),
      extracted.data.followUpQuestion ?? "",
    ];
    const errors: string[] = [];
    if (extractionReferencesInternalState(extracted.data)) {
      errors.push("Remove references to internal system state.");
    }
    const banned = bannedPhraseHits(
      narrative,
      consultationConfig.bannedPhrases,
    );
    if (banned.length > 0) {
      errors.push(`Remove banned language: ${banned.join(", ")}.`);
    }
    if (errors.length === 0) return extracted;
    feedback = errors;
  }
  return {
    ok: false as const,
    message:
      "Consultation answer analysis did not pass quality checks. Retry consultation.",
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
  strengtheningNeeds: string[];
}) {
  let feedback: string[] = [];
  for (
    let attempt = 0;
    attempt <= consultationConfig.qualityRegenerationAttempts;
    attempt += 1
  ) {
    const polished = await polishAnswerWithModel({
      ...input,
      qualityFeedback: feedback,
    });
    if (!polished.ok) return polished;
    const interviewErrors = validateGroundedStatement({
      statement: polished.data.interviewAnswer,
      sources: input.sources,
      bannedPhrases: consultationConfig.bannedPhrases,
      requireSentenceClaims: true,
    });
    interviewErrors.push(
      ...validateInterviewAnswerQuality({
        text: polished.data.interviewAnswer.text,
        maxWords: consultationConfig.interviewAnswerMaxWords,
        bannedPhrases: consultationConfig.interviewAnswerBannedPhrases,
      }),
    );
    const note = polished.data.strengtheningNote?.trim() || null;
    if (input.declinedFollowUp) {
      if (!note) {
        interviewErrors.push(
          "The declined follow-up needs a concise strengthening note.",
        );
      } else {
        const namedNeed = input.strengtheningNeeds.some((need) =>
          note.toLowerCase().includes(need.toLowerCase()),
        );
        if (!namedNeed) {
          interviewErrors.push(
            "The strengthening note must name the STAR part that needs detail.",
          );
        }
        const noteBanned = bannedPhraseHits(
          [note],
          consultationConfig.bannedPhrases,
        );
        if (noteBanned.length > 0 || INTERNAL_SYSTEM_STATE.test(note)) {
          interviewErrors.push(
            "The strengthening note used prohibited or internal language.",
          );
        }
      }
    } else if (note) {
      interviewErrors.push(
        "A complete answer must not include a strengthening note.",
      );
    }
    const bulletErrors = validateGroundedStatement({
      statement: polished.data.resumeBullet,
      sources: input.sources,
      bannedPhrases: consultationConfig.bannedPhrases,
      requireSentenceClaims: false,
    });
    if (/[\r\n]/.test(polished.data.resumeBullet.text)) {
      bulletErrors.push("The resume bullet must be one line.");
    }
    const bulletClaim = polished.data.resumeBullet.claims[0];
    if (
      polished.data.resumeBullet.claims.length !== 1 ||
      !bulletClaim ||
      bulletClaim.text.trim() !== polished.data.resumeBullet.text.trim()
    ) {
      bulletErrors.push(
        "The resume bullet must be returned as one fully grounded claim.",
      );
    }
    const errors = [...new Set([...interviewErrors, ...bulletErrors])];
    if (errors.length === 0) return polished;
    feedback = errors;
  }
  return {
    ok: false as const,
    message:
      "Consultation statements did not pass grounding checks. Retry consultation.",
  };
}

async function failGeneration(sessionId: string, message: string): Promise<void> {
  await prisma.consultationSession.update({
    where: { id: sessionId },
    data: {
      generationStatus: "FAILED",
      generationError: message,
    },
  });
}

async function planAndStoreRound(input: {
  organizationId: string;
  sessionId: string;
  askedKeys: Set<string>;
  skippedKeys: Set<string>;
  profile: ReturnType<typeof parseCandidateProfile>;
  requirement: { seniority: string | null; title: string | null };
  targets: EvidenceTarget[];
  roles: Awaited<ReturnType<typeof hiringTeam>>;
  focusTargetKey?: string | null;
}): Promise<ReturnType<typeof planQuestionRound>> {
  await prisma.consultationSession.update({
    where: { id: input.sessionId },
    data: { generationStatus: "GENERATING", generationError: null },
  });
  const profileItems = profileEvidenceItems(input.profile);
  const chronologyRequested = seniorityWarrantsChronology({
    seniority: input.requirement.seniority,
    title: input.requirement.title,
  });
  let feedback: string[] = [];
  let accepted:
    | {
        plan: Extract<
          Awaited<ReturnType<typeof planConsultationWithModel>>,
          { ok: true }
        >;
        assessments: EvidenceAssessment[];
        questions: ReturnType<typeof planQuestionRound>;
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
      hiringTeam: input.roles,
      chronologyRequested,
      coveredTargetKeys: [...new Set([...input.askedKeys, ...input.skippedKeys])],
      focusTargetKey: input.focusTargetKey ?? null,
      qualityFeedback: feedback,
    });
    if (!plan.ok) {
      await failGeneration(input.sessionId, plan.message);
      return [];
    }
    const allNarrative = [
      plan.data.commentary,
      ...plan.data.assessments.flatMap((item) => [item.explanation, item.strategy]),
      ...plan.data.questions.flatMap((item) => [
        item.text,
        item.requirementInterpretation ?? "",
        item.whoCaresNote,
      ]),
    ];
    const errors: string[] = [];
    if (allNarrative.some((text) => INTERNAL_SYSTEM_STATE.test(text))) {
      errors.push("Remove references to internal system state.");
    }
    const banned = bannedPhraseHits(
      allNarrative,
      consultationConfig.bannedPhrases,
    );
    if (banned.length > 0) {
      errors.push(`Remove banned language: ${banned.join(", ")}.`);
    }
    let assessments: EvidenceAssessment[] = [];
    let questions: ReturnType<typeof planQuestionRound> = [];
    try {
      assessments = verifyModelAssessments({
        targets: input.targets,
        profileItems,
        assessments: plan.data.assessments,
        asOf: new Date(),
      });
      questions = planQuestionRound({
        assessments,
        modelQuestions: plan.data.questions,
        hiringTeam: input.roles,
        askedKeys: input.askedKeys,
        skippedKeys: input.skippedKeys,
        includeChronology: chronologyRequested,
        chronologyAsked: input.askedKeys.has("chronology"),
        focusTargetKey: input.focusTargetKey ?? null,
      });
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Consultation output validation failed.",
      );
    }
    if (errors.length === 0) {
      accepted = { plan, assessments, questions };
      break;
    }
    feedback = errors;
  }
  if (!accepted) {
    await failGeneration(
      input.sessionId,
      "Consultation output did not pass quality checks. Retry consultation.",
    );
    return [];
  }
  const { plan, assessments, questions } = accepted;
  await saveAssessments(input.organizationId, input.sessionId, assessments);
  for (const question of questions) {
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
      generationStatus: "READY",
      generationError: null,
    },
  });
  return questions;
}

async function finishIfPlanningIsComplete(
  sessionId: string,
  questions: ReturnType<typeof planQuestionRound>,
): Promise<void> {
  if (questions.length > 0) return;
  const session = await prisma.consultationSession.findUnique({
    where: { id: sessionId },
    select: { generationStatus: true },
  });
  if (session?.generationStatus === "READY") {
    await prisma.consultationSession.update({
      where: { id: sessionId },
      data: { status: "DONE" },
    });
  }
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
}): { targets: EvidenceTarget[]; focusTargetKey: string | null } {
  const targets = targetsFromRequirement(input.requirement);
  let focusTargetKey = matchConsultationFocus({
    focusTargetKey: input.focusTargetKey,
    focusNote: input.focusNote,
    targets,
  });
  const note = input.focusNote?.trim() ?? "";
  if (!focusTargetKey && note) {
    focusTargetKey = "interview-note-focus";
    targets.unshift({
      key: focusTargetKey,
      kind: "COMPETENCY",
      text: note,
    });
  }
  return { targets, focusTargetKey };
}

export async function startConsultation(input: {
  organizationId: string;
  campaignId: string;
  focusNote?: string | null;
  focusTargetKey?: string | null;
}): Promise<void> {
  const { campaign, requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const hasFocus = Boolean(
    input.focusNote?.trim() || input.focusTargetKey?.trim(),
  );
  const { targets, focusTargetKey } = resolveConsultationTargets({
    requirement,
    focusTargetKey: input.focusTargetKey,
    focusNote: input.focusNote,
  });
  const existing = await prisma.consultationSession.findUnique({
    where: { campaignId: input.campaignId },
  });
  if (existing?.status === "DONE" && !hasFocus) return;
  if (existing?.status === "DONE" && hasFocus) {
    await prisma.consultationSession.update({
      where: { id: existing.id },
      data: { status: "IN_PROGRESS", generationStatus: "READY" },
    });
  }
  if (
    existing?.status === "IN_PROGRESS" &&
    existing.generationStatus !== "FAILED" &&
    !hasFocus
  ) {
    return;
  }
  if (existing) {
    const turns = await loadSessionTurns(existing.id);
    const { askedKeys, skippedKeys } = askedAndSkipped(turns);
    const roles = await hiringTeam(input.organizationId, input.campaignId);
    await planAndStoreRound({
      organizationId: input.organizationId,
      sessionId: existing.id,
      askedKeys,
      skippedKeys,
      profile,
      requirement,
      targets,
      roles,
      focusTargetKey,
    });
    return;
  }
  const session = await prisma.consultationSession.create({
    data: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      productId: campaign.productId,
      status: "IN_PROGRESS",
      promptVersion: CONSULTATION_PROMPT_VERSION,
    },
  });
  const roles = await hiringTeam(input.organizationId, input.campaignId);
  await planAndStoreRound({
    organizationId: input.organizationId,
    sessionId: session.id,
    askedKeys: new Set(),
    skippedKeys: new Set(),
    profile,
    requirement,
    targets,
    roles,
    focusTargetKey,
  });
}

async function processAnswerGeneration(input: {
  organizationId: string;
  sessionId: string;
  turnId: string;
  answerContext: string;
  question: string;
  target: EvidenceTarget | null;
  targets: EvidenceTarget[];
  profile: ReturnType<typeof parseCandidateProfile>;
}): Promise<
  | {
      ok: true;
      followUpQuestion: string | null;
      missingStarElements: string[];
    }
  | { ok: false }
> {
  const extracted = await extractAnswerWithQuality({
    answer: input.answerContext,
    question: input.question,
    target: input.target,
    targets: input.targets,
  });
  if (!extracted.ok) {
    await prisma.consultationTurn.update({
      where: { id: input.turnId },
      data: {
        analysisJson: { status: "FAILED", message: extracted.message },
      },
    });
    await failGeneration(input.sessionId, extracted.message);
    return { ok: false };
  }
  const verified = proposalsFromExtraction({
    answer: input.answerContext,
    turnId: input.turnId,
    extracted: extracted.data,
    targets: input.targets,
  });
  const storyProposal = verified.proposals.find(
    (proposal) => proposal.kind === "STORY" && proposal.story,
  );
  let polished: Awaited<ReturnType<typeof polishAnswerWithQuality>> | null =
    null;
  if (!verified.followUpQuestion && verified.missingStarElements.length === 0) {
    if (!storyProposal?.story) {
      const message =
        "Consultation answer analysis did not return a fully grounded story. Retry consultation.";
      await prisma.consultationTurn.update({
        where: { id: input.turnId },
        data: { analysisJson: { status: "FAILED", message } },
      });
      await failGeneration(input.sessionId, message);
      return { ok: false };
    }
    polished = await polishAnswerWithQuality({
      answer: input.answerContext,
      story: {
        situation: storyProposal.story.situation,
        task: storyProposal.story.task,
        action: storyProposal.story.action,
        result: storyProposal.story.result,
      },
      sources: polishingSources({
        answer: input.answerContext,
        turnId: input.turnId,
        profile: input.profile,
      }),
      declinedFollowUp: false,
      strengtheningNeeds: [],
    });
    if (!polished.ok) {
      await prisma.consultationTurn.update({
        where: { id: input.turnId },
        data: {
          analysisJson: { status: "FAILED", message: polished.message },
        },
      });
      await failGeneration(input.sessionId, polished.message);
      return { ok: false };
    }
  }
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.consultationProposal.deleteMany({
      where: { turnId: input.turnId, status: "PENDING" },
    }),
    prisma.consultationTurn.update({
      where: { id: input.turnId },
      data: {
        analysisJson: {
          status: "READY",
          answerContext: input.answerContext,
          story: extracted.data.story,
          dropped: verified.dropped,
          missingStarElements: verified.missingStarElements,
          demonstratedTargets: extracted.data.demonstratedTargets,
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
  if (polished?.ok) {
    const statements = [
      {
        kind: "INTERVIEW_ANSWER" as const,
        value: polished.data.interviewAnswer,
      },
      {
        kind: "RESUME_BULLET" as const,
        value: polished.data.resumeBullet,
      },
    ];
    operations.push(
      ...statements.map((statement) =>
        prisma.consultationStatement.upsert({
          where: {
            turnId_kind: { turnId: input.turnId, kind: statement.kind },
          },
          create: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            turnId: input.turnId,
            kind: statement.kind,
            content: statement.value.text.trim(),
            strengtheningNote:
              statement.kind === "INTERVIEW_ANSWER"
                ? polished.data.strengtheningNote?.trim() || null
                : null,
            groundingJson: statement.value.claims,
            promptVersion: CONSULTATION_PROMPT_VERSION,
          },
          update: {
            status: "DRAFT",
            content: statement.value.text.trim(),
            strengtheningNote:
              statement.kind === "INTERVIEW_ANSWER"
                ? polished.data.strengtheningNote?.trim() || null
                : null,
            groundingJson: statement.value.claims,
            promptVersion: CONSULTATION_PROMPT_VERSION,
            generation: { increment: 1 },
            approvedAt: null,
          },
        }),
      ),
    );
  }
  await prisma.$transaction(operations);
  return {
    ok: true,
    followUpQuestion: verified.followUpQuestion,
    missingStarElements: verified.missingStarElements,
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
    const question = [...turns]
      .reverse()
      .find(
        (turn) =>
          turn.speaker === "CONSULTANT" &&
          turn.targetKey === failedAnswer.targetKey &&
          turn.sequence < failedAnswer.sequence,
      );
    if (!question) {
      throw new TenantError("The question for the failed answer was not found.");
    }
    const { requirement, profile } = await requireApplication(
      input.organizationId,
      input.campaignId,
    );
    const targets = targetsFromRequirement(requirement);
    const target = targets.find((item) => item.key === failedAnswer.targetKey);
    const answerContext = turns
      .filter(
        (turn) =>
          turn.speaker === "SEEKER" &&
          turn.targetKey === failedAnswer.targetKey &&
          !turn.skipped &&
          turn.sequence <= failedAnswer.sequence,
      )
      .map((turn) => turn.body)
      .filter(Boolean)
      .join("\n");
    const processed = await processAnswerGeneration({
      organizationId: input.organizationId,
      sessionId: session.id,
      turnId: failedAnswer.id,
      answerContext,
      question: question.body,
      target: target ?? null,
      targets,
      profile,
    });
    if (!processed.ok) return;
    if (processed.followUpQuestion) {
      const followUpCount = turns.filter(
        (turn) =>
          turn.speaker === "CONSULTANT" &&
          turn.targetKey === failedAnswer.targetKey &&
          turn.followUp,
      ).length;
      if (followUpCount < consultationConfig.maxFollowUpsPerTarget) {
        await addTurn({
          organizationId: input.organizationId,
          sessionId: session.id,
          speaker: "CONSULTANT",
          body: processed.followUpQuestion,
          targetKey: failedAnswer.targetKey,
          followUp: true,
        });
        return;
      }
    }
    await continueAfterAnsweredRound({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sessionId: session.id,
    });
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
    return;
  }
  await setStatus({ ...input, command: "skip" });
}

export async function completeConsultation(input: {
  organizationId: string;
  campaignId: string;
}) {
  await setStatus({ ...input, command: "done" });
}

async function loadSessionTurns(sessionId: string) {
  return prisma.consultationTurn.findMany({
    where: { sessionId },
    orderBy: { sequence: "asc" },
  });
}

function unanswered(
  turns: Array<{
    id: string;
    sequence: number;
    speaker: "CONSULTANT" | "SEEKER";
    targetKey: string | null;
    followUp: boolean;
    body: string;
  }>,
  targetKey: string,
) {
  const questions = turns.filter(
    (turn) => turn.speaker === "CONSULTANT" && turn.targetKey === targetKey,
  );
  const latest = questions.at(-1);
  if (!latest) return null;
  const answered = turns.some(
    (turn) =>
      turn.speaker === "SEEKER" &&
      turn.targetKey === targetKey &&
      turn.sequence > latest.sequence,
  );
  return answered ? null : latest;
}

async function continueAfterAnsweredRound(input: {
  organizationId: string;
  campaignId: string;
  sessionId: string;
}): Promise<void> {
  const refreshed = await loadSessionTurns(input.sessionId);
  const open = refreshed.some((turn) => {
    if (turn.speaker !== "CONSULTANT" || !turn.targetKey) return false;
    return unanswered(refreshed, turn.targetKey) != null;
  });
  if (open) return;
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const stored = await prisma.consultationAssessment.findMany({
    where: { sessionId: input.sessionId },
  });
  const assessments = stored.map(storedAssessment);
  const { askedKeys, skippedKeys } = askedAndSkipped(refreshed);
  if (gapsAreCovered(assessments, skippedKeys)) {
    await prisma.consultationSession.update({
      where: { id: input.sessionId },
      data: { status: "DONE" },
    });
    return;
  }
  const roles = await hiringTeam(input.organizationId, input.campaignId);
  const next = await planAndStoreRound({
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    askedKeys,
    skippedKeys,
    profile,
    requirement,
    targets: targetsFromRequirement(requirement),
    roles,
  });
  await finishIfPlanningIsComplete(input.sessionId, next);
}

export async function answerConsultationQuestion(input: {
  organizationId: string;
  campaignId: string;
  targetKey: string;
  answer: string;
}): Promise<void> {
  const answer = input.answer.trim();
  if (!answer) throw new TenantError("Write an answer, or skip the question.");
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session || session.status !== "IN_PROGRESS") {
    throw new TenantError("The consultation is not waiting for an answer.");
  }
  const turns = await loadSessionTurns(session.id);
  const question = unanswered(turns, input.targetKey);
  if (!question) throw new TenantError("That question is not open.");
  const seekerTurn = await addTurn({
    organizationId: input.organizationId,
    sessionId: session.id,
    speaker: "SEEKER",
    body: answer,
    targetKey: input.targetKey,
    seekerAuthored: true,
  });
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const targets = targetsFromRequirement(requirement);
  const target = targets.find((item) => item.key === input.targetKey);
  const answerContext = [
    ...turns
      .filter(
        (turn) =>
          turn.speaker === "SEEKER" &&
          turn.targetKey === input.targetKey &&
          !turn.skipped,
      )
      .map((turn) => turn.body),
    answer,
  ]
    .filter(Boolean)
    .join("\n");
  const processed = await processAnswerGeneration({
    organizationId: input.organizationId,
    sessionId: session.id,
    turnId: seekerTurn.id,
    answerContext,
    question: question.body,
    target: target ?? null,
    targets,
    profile,
  });
  if (!processed.ok) return;
  const followUpCount = turns.filter(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      turn.targetKey === input.targetKey &&
      turn.followUp,
  ).length;
  if (
    processed.followUpQuestion &&
    input.targetKey !== "chronology" &&
    followUpCount < consultationConfig.maxFollowUpsPerTarget
  ) {
    await addTurn({
      organizationId: input.organizationId,
      sessionId: session.id,
      speaker: "CONSULTANT",
      body: processed.followUpQuestion,
      targetKey: input.targetKey,
      followUp: true,
    });
    return;
  }
  await continueAfterAnsweredRound({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sessionId: session.id,
  });
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
  analysis: Record<string, unknown>;
} | null {
  if (!value || typeof value !== "object") return null;
  const analysis = value as Record<string, unknown>;
  if (
    typeof analysis.answerContext !== "string" ||
    !analysis.story ||
    typeof analysis.story !== "object" ||
    !Array.isArray(analysis.missingStarElements)
  ) {
    return null;
  }
  const row = analysis.story as Record<string, unknown>;
  const part = (name: string) =>
    typeof row[name] === "string" && row[name].trim()
      ? row[name].trim()
      : null;
  const missingStarElements = analysis.missingStarElements.filter(
    (item): item is string => typeof item === "string",
  );
  if (missingStarElements.length === 0) return null;
  return {
    answerContext: analysis.answerContext,
    story: {
      situation: part("situation"),
      task: part("task"),
      action: part("action"),
      result: part("result"),
    },
    missingStarElements,
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
  const polished = await polishAnswerWithQuality({
    answer: analyzed.answerContext,
    story: analyzed.story,
    sources: polishingSources({
      answer: analyzed.answerContext,
      turnId: priorAnswer.id,
      profile,
    }),
    declinedFollowUp: true,
    strengtheningNeeds: analyzed.missingStarElements,
  });
  if (!polished.ok) throw new TenantError(polished.message);
  const nextSequence =
    input.turns.reduce(
      (maximum, turn) => Math.max(maximum, turn.sequence),
      0,
    ) + 1;
  const statements = [
    {
      kind: "INTERVIEW_ANSWER" as const,
      value: polished.data.interviewAnswer,
      strengtheningNote: polished.data.strengtheningNote?.trim() || null,
    },
    {
      kind: "RESUME_BULLET" as const,
      value: polished.data.resumeBullet,
      strengtheningNote: null,
    },
  ];
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
          groundingJson: statement.value.claims,
          promptVersion: CONSULTATION_PROMPT_VERSION,
        },
        update: {
          status: "DRAFT",
          content: statement.value.text.trim(),
          strengtheningNote: statement.strengtheningNote,
          groundingJson: statement.value.claims,
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
    throw new TenantError("The consultation is not waiting for an answer.");
  }
  const turns = await loadSessionTurns(session.id);
  const question = unanswered(turns, input.targetKey);
  if (!question) {
    throw new TenantError("That question is not open.");
  }
  if (question.followUp) {
    await declineConsultationFollowUp({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sessionId: session.id,
      question,
      turns,
    });
    await continueAfterAnsweredRound({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sessionId: session.id,
    });
    return;
  }
  await addTurn({
    organizationId: input.organizationId,
    sessionId: session.id,
    speaker: "SEEKER",
    body: "",
    targetKey: input.targetKey,
    skipped: true,
    seekerAuthored: true,
  });
  const refreshed = await loadSessionTurns(session.id);
  const stillOpen = refreshed.some(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      turn.targetKey &&
      unanswered(refreshed, turn.targetKey),
  );
  if (stillOpen) return;
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const stored = await prisma.consultationAssessment.findMany({
    where: { sessionId: session.id },
  });
  const assessments = stored.map(storedAssessment);
  const { askedKeys, skippedKeys } = askedAndSkipped(refreshed);
  if (gapsAreCovered(assessments, skippedKeys)) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { status: "DONE" },
    });
    return;
  }
  const roles = await hiringTeam(input.organizationId, input.campaignId);
  const next = await planAndStoreRound({
    organizationId: input.organizationId,
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
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    answerContext?: unknown;
    story?: unknown;
    missingStarElements?: unknown;
    followUpDeclined?: unknown;
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
  if (!analyzed) {
    throw new TenantError("That answer does not have a complete grounded story.");
  }
  const { profile } = await requireApplication(
    input.organizationId,
    statement.session.campaignId,
  );
  const polished = await polishAnswerWithQuality({
    answer: analyzed.answerContext,
    story: analyzed.story,
    sources: polishingSources({
      answer: analyzed.answerContext,
      turnId: statement.turnId,
      profile,
    }),
    declinedFollowUp: analyzed.followUpDeclined,
    strengtheningNeeds: analyzed.missingStarElements,
  });
  if (!polished.ok) throw new TenantError(polished.message);
  const value =
    statement.kind === "INTERVIEW_ANSWER"
      ? polished.data.interviewAnswer
      : polished.data.resumeBullet;
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
        content: value.text.trim(),
        strengtheningNote:
          statement.kind === "INTERVIEW_ANSWER"
            ? polished.data.strengtheningNote?.trim() || null
            : null,
        groundingJson: value.claims,
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

export async function approveConsultationStatement(input: {
  organizationId: string;
  statementId: string;
  content: string;
}): Promise<void> {
  const content = input.content.trim();
  if (!content) throw new TenantError("A polished statement cannot be empty.");
  const banned = bannedPhraseHits(
    [content],
    consultationConfig.bannedPhrases,
  );
  if (banned.length > 0) {
    throw new TenantError("Remove the flagged wording before approval.");
  }
  const statement = await prisma.consultationStatement.findFirst({
    where: { id: input.statementId, organizationId: input.organizationId },
    include: { turn: true, session: true },
  });
  if (!statement) throw new TenantError("That polished statement was not found.");
  if (statement.kind === "INTERVIEW_ANSWER") {
    const qualityErrors = validateInterviewAnswerQuality({
      text: content,
      maxWords: consultationConfig.interviewAnswerMaxWords,
      bannedPhrases: consultationConfig.interviewAnswerBannedPhrases,
    });
    if (qualityErrors.length > 0) {
      throw new TenantError(
        "Revise the interview answer to remove repetition or structural language.",
      );
    }
  } else if (/[\r\n]/.test(content)) {
    throw new TenantError("Keep the resume bullet to one line.");
  }
  const analyzed = completeStoryFromAnalysis(statement.turn.analysisJson);
  if (!analyzed) {
    throw new TenantError("That answer does not have a complete grounded story.");
  }
  const { product, profile } = await requireApplication(
    input.organizationId,
    statement.session.campaignId,
  );
  const sources = polishingSources({
    answer: analyzed.answerContext,
    turnId: statement.turnId,
    profile,
  });
  const grounding = await groundStatementWithModel({
    statement: content,
    kind: statement.kind,
    sources,
  });
  if (!grounding.ok) throw new TenantError(grounding.message);
  if (grounding.data.text.trim() !== content) {
    throw new TenantError("Statement verification altered the supplied wording.");
  }
  const errors = validateGroundedStatement({
    statement: grounding.data,
    sources,
    bannedPhrases: consultationConfig.bannedPhrases,
    requireSentenceClaims: statement.kind === "INTERVIEW_ANSWER",
  });
  if (
    statement.kind === "RESUME_BULLET" &&
    (grounding.data.claims.length !== 1 ||
      grounding.data.claims[0]?.text.trim() !== content)
  ) {
    errors.push("The resume bullet was not fully grounded.");
  }
  if (errors.length > 0) {
    throw new TenantError(
      "The statement contains content that is not supported by the answer or Personal Profile.",
    );
  }
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
        groundingJson: grounding.data.claims,
        approvedAt: now,
      },
    }),
    existingStory
      ? prisma.profileStory.update({
          where: { id: existingStory.id },
          data: {
            verbatimAnswer: analyzed.answerContext,
            ...polishedFields,
          },
        })
      : prisma.profileStory.create({
          data: {
            organizationId: input.organizationId,
            productId: product.id,
            situation: analyzed.story.situation,
            task: analyzed.story.task,
            action: analyzed.story.action,
            result: analyzed.story.result,
            competencyLinks:
              (proposal?.competencyLinks as Prisma.InputJsonValue | null) ?? [],
            consultationTurnId: statement.turnId,
            seekerAuthored: true,
            verbatimAnswer: analyzed.answerContext,
            ...polishedFields,
          },
        }),
  ]);
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
  }
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

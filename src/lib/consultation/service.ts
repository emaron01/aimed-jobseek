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
import {
  CONSULTATION_PROMPT_VERSION,
  WHY_THIS_COMPANY_TARGET_KEY,
} from "@/lib/consultation/contract";
import { isHiringTeamPersonaBuilt } from "@/lib/hiring-team/build";
import {
  matchConsultationFocus,
  planQuestionRound,
  seniorityWarrantsChronology,
  type QuestionRoundPlan,
} from "@/lib/consultation/questions";
import {
  mentionsInternalSystemState,
  validateGroundedStatement,
  validateInterviewAnswerQuality,
  type GroundingSource,
} from "@/lib/consultation/output-quality";
import {
  logQualityRejection,
  qualityIssue,
  qualityMessages,
  type QualityIssue,
} from "@/lib/generation/quality";
import { nextConsultationStatus } from "@/lib/consultation/state";
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
import { contactIdFromPersonPrepTarget } from "@/lib/interview/person-prep";
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
      setupStatus: true,
    },
  });
  return roles.map((role) => {
    const built = isHiringTeamPersonaBuilt(role);
    const profile =
      role.profileJson && typeof role.profileJson === "object"
        ? (role.profileJson as Record<string, unknown>)
        : {};
    return {
      id: role.id,
      name: role.name,
      likelyTitles: parseStringArray(role.targetTitles),
      whyThisRoleMatters: role.whyThisPersonaMatters,
      personaContext: built
        ? role.profileJson
        : {
            involvement: profile.involvement ?? "DIRECT",
            identification: profile.identification ?? null,
            built: false,
          },
    };
  });
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
      questionContextJson:
        (input.questionContext as Prisma.InputJsonValue | undefined) ?? undefined,
      intent: input.intent ?? null,
    },
  });
}

function extractionQualityIssues(extracted: {
  demonstratedTargets: Array<{ explanation: string }>;
  followUpQuestion: string | null;
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  extracted.demonstratedTargets.forEach((item, index) => {
    if (mentionsInternalSystemState(item.explanation)) {
      issues.push(
        qualityIssue({
          check: "internal_state",
          field: `demonstratedTargets.${index}.explanation`,
          text: item.explanation,
          message: "Remove references to internal system state.",
        }),
      );
    }
  });
  if (
    extracted.followUpQuestion &&
    mentionsInternalSystemState(extracted.followUpQuestion)
  ) {
    issues.push(
      qualityIssue({
        check: "internal_state",
        field: "followUpQuestion",
        text: extracted.followUpQuestion,
        message: "Remove references to internal system state.",
      }),
    );
  }
  return issues;
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
    const issues = extractionQualityIssues(extracted.data);
    if (issues.length === 0) return extracted;
    logQualityRejection({
      generator: "consultation.extract",
      attempt,
      issues,
    });
    if (attempt === consultationConfig.qualityRegenerationAttempts) {
      const failing = new Set(issues.map((issue) => issue.field));
      return {
        ok: true as const,
        data: {
          ...extracted.data,
          demonstratedTargets: extracted.data.demonstratedTargets.filter(
            (_, index) =>
              !failing.has(`demonstratedTargets.${index}.explanation`),
          ),
          followUpQuestion: failing.has("followUpQuestion")
            ? null
            : extracted.data.followUpQuestion,
        },
      };
    }
    feedback = qualityMessages(issues);
  }
  return {
    ok: false as const,
    message: consultationConversationCopy.generationQualityFailed,
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
    const interviewIssues = validateGroundedStatement({
      statement: polished.data.interviewAnswer,
      sources: input.sources,
      field: "interviewAnswer",
      requireSentenceClaims: true,
    });
    interviewIssues.push(
      ...validateInterviewAnswerQuality({
        text: polished.data.interviewAnswer.text,
        field: "interviewAnswer",
        maxWords: consultationConfig.interviewAnswerMaxWords,
        metaLanguagePhrases: consultationConfig.interviewAnswerMetaLanguage,
      }),
    );
    const note = polished.data.strengtheningNote?.trim() || null;
    if (input.declinedFollowUp) {
      if (!note) {
        interviewIssues.push(
          qualityIssue({
            check: "strengthening_note",
            field: "strengtheningNote",
            text: "",
            message: "The declined follow-up needs a concise strengthening note.",
          }),
        );
      } else {
        const namedNeed = input.strengtheningNeeds.some((need) =>
          note.toLowerCase().includes(need.toLowerCase()),
        );
        if (!namedNeed) {
          interviewIssues.push(
            qualityIssue({
              check: "strengthening_note",
              field: "strengtheningNote",
              text: note,
              message:
                "The strengthening note must name the STAR part that needs detail.",
            }),
          );
        }
        if (mentionsInternalSystemState(note)) {
          interviewIssues.push(
            qualityIssue({
              check: "internal_state",
              field: "strengtheningNote",
              text: note,
              message: "The strengthening note referenced internal system state.",
            }),
          );
        }
      }
    } else if (note) {
      interviewIssues.push(
        qualityIssue({
          check: "strengthening_note",
          field: "strengtheningNote",
          text: note,
          message: "A complete answer must not include a strengthening note.",
        }),
      );
    }
    const bulletIssues = validateGroundedStatement({
      statement: polished.data.resumeBullet,
      sources: input.sources,
      field: "resumeBullet",
      requireSentenceClaims: false,
    });
    if (/[\r\n]/.test(polished.data.resumeBullet.text)) {
      bulletIssues.push(
        qualityIssue({
          check: "structure",
          field: "resumeBullet",
          text: polished.data.resumeBullet.text,
          message: "The resume bullet must be one line.",
        }),
      );
    }
    const bulletClaim = polished.data.resumeBullet.claims[0];
    if (
      polished.data.resumeBullet.claims.length !== 1 ||
      !bulletClaim ||
      bulletClaim.text.trim() !== polished.data.resumeBullet.text.trim()
    ) {
      bulletIssues.push(
        qualityIssue({
          check: "grounding",
          field: "resumeBullet",
          text: polished.data.resumeBullet.text,
          message:
            "The resume bullet must be returned as one fully grounded claim.",
        }),
      );
    }
    const issues = [...interviewIssues, ...bulletIssues];
    if (issues.length === 0) return polished;
    logQualityRejection({
      generator: "consultation.polish",
      attempt,
      issues,
    });
    const failingFields = new Set(issues.map((issue) => issue.field));
    feedback = qualityMessages(
      issues.filter((issue) => failingFields.has(issue.field)),
    );
    if (attempt === consultationConfig.qualityRegenerationAttempts) {
      const answerIssues = interviewIssues.filter(
        (issue) => issue.field === "interviewAnswer",
      );
      const noteIssues = interviewIssues.filter(
        (issue) => issue.field === "strengtheningNote",
      );
      const keepInterview = answerIssues.length === 0;
      const keepBullet = bulletIssues.length === 0;
      if (keepInterview || keepBullet) {
        return {
          ok: true as const,
          data: {
            ...polished.data,
            interviewAnswer: keepInterview
              ? polished.data.interviewAnswer
              : { text: "", claims: [] },
            resumeBullet: keepBullet
              ? polished.data.resumeBullet
              : { text: "", claims: [] },
            strengtheningNote:
              keepInterview && noteIssues.length === 0
                ? polished.data.strengtheningNote
                : null,
          },
        };
      }
    }
  }
  return {
    ok: false as const,
    message: consultationConversationCopy.generationQualityFailed,
  };
}

async function persistWhyThisCompany(input: {
  organizationId: string;
  campaignId: string;
  answer: string;
}): Promise<void> {
  const text = input.answer.trim();
  if (!text) return;
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: { whyThisCompany: text },
  });
  const { product, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const next = appendConfirmedFact(profile, {
    id: whyThisCompanyFactId(input.campaignId),
    text,
    turnId: WHY_THIS_COMPANY_TARGET_KEY,
  });
  await prisma.product.update({
    where: { id: product.id },
    data: { profileJson: next },
  });
}

async function failGeneration(sessionId: string, message: string): Promise<void> {
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
  focusGuidance?: string[];
}): Promise<QuestionRoundPlan["questions"]> {
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
  let partialError: string | null = null;
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
      hiringTeam: input.roles,
      chronologyRequested,
      coveredTargetKeys: [
        ...new Set(
          [...input.askedKeys, ...input.skippedKeys].filter(
            (key) => key !== input.focusTargetKey,
          ),
        ),
      ],
      focusTargetKey: input.focusTargetKey ?? null,
      qualityFeedback: [...(input.focusGuidance ?? []), ...feedback],
    });
    if (!plan.ok) {
      await failGeneration(input.sessionId, plan.message);
      throw new Error(plan.message);
    }
    const issues: QualityIssue[] = [];
    const narrativeFields: Array<[string, string]> = [
      ["commentary", plan.data.commentary],
      ["briefing.overall", plan.data.briefing.overall],
      ...plan.data.briefing.strongestAngles.map(
        (text, index): [string, string] => [`briefing.strongestAngles.${index}`, text],
      ),
      ...plan.data.briefing.importantGaps.map(
        (text, index): [string, string] => [`briefing.importantGaps.${index}`, text],
      ),
      ...plan.data.briefing.storyPlan.map(
        (text, index): [string, string] => [`briefing.storyPlan.${index}`, text],
      ),
      ["closingNote", plan.data.closingNote ?? ""],
      ...plan.data.assessments.flatMap(
        (item, index): Array<[string, string]> => [
          [`assessments.${index}.explanation`, item.explanation],
          [`assessments.${index}.strategy`, item.strategy],
        ],
      ),
      ...plan.data.questions.flatMap(
        (item, index): Array<[string, string]> => [
          [`questions.${index}.text`, item.text],
          [`questions.${index}.requirementInterpretation`, item.requirementInterpretation ?? ""],
          [`questions.${index}.whoCaresNote`, item.whoCaresNote],
        ],
      ),
    ];
    for (const [field, text] of narrativeFields) {
      if (text && mentionsInternalSystemState(text)) {
        issues.push(
          qualityIssue({
            check: "internal_state",
            field,
            text,
            message: "Remove references to internal system state.",
          }),
        );
      }
    }
    let assessments: EvidenceAssessment[] = [];
    let questions: QuestionRoundPlan["questions"] = [];
    let droppedQuestions: QuestionRoundPlan["dropped"] = [];
    try {
      assessments = verifyModelAssessments({
        targets: input.targets,
        profileItems,
        assessments: plan.data.assessments,
        asOf: new Date(),
      });
      const planned = planQuestionRound({
        assessments,
        modelQuestions: plan.data.questions.filter(
          (item, index) =>
            !issues.some((issue) => issue.field.startsWith(`questions.${index}.`)),
        ),
        hiringTeam: input.roles,
        askedKeys: input.askedKeys,
        skippedKeys: input.skippedKeys,
        includeChronology: chronologyRequested,
        chronologyAsked: input.askedKeys.has("chronology"),
        focusTargetKey: input.focusTargetKey ?? null,
      });
      questions = planned.questions;
      droppedQuestions = planned.dropped;
    } catch (error) {
      issues.push(
        qualityIssue({
          check: "assessment_verification",
          field: "assessments",
          text:
            error instanceof Error
              ? error.message
              : "Consultation could not verify one of the requirement assessments.",
          message:
            error instanceof Error
              ? error.message
              : "Consultation could not verify one of the requirement assessments.",
        }),
      );
    }
    const questionIssues = droppedQuestions.map((drop) =>
      qualityIssue({
        check: "question_item",
        field: `questions.${drop.targetKey}`,
        text: drop.reason,
        message: drop.reason,
      }),
    );
    if (issues.length === 0 && (questionIssues.length === 0 || attempt === consultationConfig.qualityRegenerationAttempts)) {
      for (const drop of droppedQuestions) {
        console.info(
          JSON.stringify({
            event: "consultation_question_dropped",
            sessionId: input.sessionId,
            targetKey: drop.targetKey,
            reason: drop.reason,
            attempt,
          }),
        );
      }
      accepted = { plan, assessments, questions };
      break;
    }
    if (issues.length === 0 && questionIssues.length > 0) {
      logQualityRejection({
        generator: "consultation.plan",
        attempt,
        issues: questionIssues,
      });
      feedback = qualityMessages(questionIssues);
      continue;
    }
    logQualityRejection({
      generator: "consultation.plan",
      attempt,
      issues,
    });
    feedback = qualityMessages(issues);
    if (attempt === consultationConfig.qualityRegenerationAttempts) {
      const failing = new Set(issues.map((issue) => issue.field));
      const briefing = {
        ...plan.data.briefing,
        overall: failing.has("briefing.overall") ? "" : plan.data.briefing.overall,
        strongestAngles: plan.data.briefing.strongestAngles.filter(
          (_, index) => !failing.has(`briefing.strongestAngles.${index}`),
        ),
        importantGaps: plan.data.briefing.importantGaps.filter(
          (_, index) => !failing.has(`briefing.importantGaps.${index}`),
        ),
        storyPlan: plan.data.briefing.storyPlan.filter(
          (_, index) => !failing.has(`briefing.storyPlan.${index}`),
        ),
      };
      const hasBriefing = Boolean(
        briefing.overall.trim() ||
          briefing.strongestAngles.length ||
          briefing.importantGaps.length ||
          briefing.storyPlan.length,
      );
      if (hasBriefing || questions.length > 0) {
        accepted = {
          plan: {
            ...plan,
            data: {
              ...plan.data,
              briefing,
              commentary: failing.has("commentary") ? "" : plan.data.commentary,
            },
          },
          assessments: issues.some(
            (issue) => issue.check === "assessment_verification",
          )
            ? []
            : assessments,
          questions,
        };
        partialError = consultationConversationCopy.generationQualityFailed;
        break;
      }
    }
  }
  if (!accepted) {
    const message = consultationConversationCopy.generationQualityFailed;
    await failGeneration(input.sessionId, message);
    throw new Error(message);
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
      briefingJson: plan.data.briefing as Prisma.InputJsonValue,
      generationStatus: "READY",
      generationError: partialError,
    },
  });
  if (questions.length === 0 && plan.data.closingNote?.trim()) {
    await addTurn({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      speaker: "CONSULTANT",
      body: plan.data.closingNote.trim(),
      targetKey: null,
      intent: "CLOSING",
    });
  }
  return questions;
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
  if (covered && session?.generationStatus === "READY") {
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
  const personPrepKey = input.focusTargetKey?.trim() ?? "";
  if (personPrepKey.startsWith("person-prep:")) {
    focusTargetKey = personPrepKey;
    if (!targets.some((target) => target.key === focusTargetKey)) {
      targets.unshift({
        key: focusTargetKey,
        kind: "COMPETENCY",
        text: note || "Interview prep for this person",
      });
    }
  } else if (!focusTargetKey && note) {
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
  const hasBriefing =
    existing?.briefingJson != null &&
    existing.generationStatus === "READY" &&
    existing.status === "IN_PROGRESS";
  if (hasBriefing && !hasFocus) return;
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
  const roles = await hiringTeam(input.organizationId, input.campaignId);
  try {
    await planAndStoreRound({
      organizationId: input.organizationId,
      sessionId: session.id,
      askedKeys,
      skippedKeys,
      profile,
      requirement,
      targets,
      roles,
      focusTargetKey,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Consultation could not start.";
    await failGeneration(session.id, message);
    throw error;
  }
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
      coaching: string | null;
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
    ].filter((statement) => statement.value.text.trim());
    if (statements.length < 2) {
      operations.push(
        prisma.consultationSession.update({
          where: { id: input.sessionId },
          data: {
            generationStatus: "READY",
            generationError: consultationConversationCopy.generationQualityFailed,
          },
        }),
      );
    }
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
    coaching: extracted.data.coaching?.trim() || null,
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
    if (!processed.ok) {
      throw new Error("Consultation could not write coaching for that reply.");
    }
    if (processed.followUpQuestion) {
      const followUpCount = turns.filter(
        (turn) =>
          turn.speaker === "CONSULTANT" &&
          turn.targetKey === failedAnswer.targetKey &&
          turn.followUp,
      ).length;
      if (followUpCount < consultationConfig.maxFollowUpsPerTarget) {
        const coaching = processed.coaching?.trim();
        await addTurn({
          organizationId: input.organizationId,
          sessionId: session.id,
          speaker: "CONSULTANT",
          body: coaching
            ? `${coaching}\n\n${processed.followUpQuestion}`
            : processed.followUpQuestion,
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
  const pendingConfirmation = await prisma.consultationStatement.count({
    where: { sessionId: input.sessionId, status: "DRAFT" },
  });
  if (pendingConfirmation > 0) return;
  const { campaign, requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const stored = await prisma.consultationAssessment.findMany({
    where: { sessionId: input.sessionId },
  });
  const assessments = stored.map(storedAssessment);
  const { askedKeys, skippedKeys } = askedAndSkipped(refreshed);
  markWhyThisCompanyAsked(askedKeys, {
    campaignId: campaign.id,
    whyThisCompany: campaign.whyThisCompany,
    profile,
  });
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

function analysisIsComplete(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  return status !== "FAILED" && status !== "PENDING";
}

export async function recordConsultationReply(input: {
  organizationId: string;
  campaignId: string;
  targetKey?: string | null;
  answer: string;
  intent?: string | null;
}): Promise<{ sessionId: string; targetKey: string; turnId: string }> {
  const answer = input.answer.trim();
  if (!answer) throw new TenantError("Write an answer, or skip the question.");
  const session = await prisma.consultationSession.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!session || session.status !== "IN_PROGRESS") {
    throw new TenantError("The consultation is not waiting for an answer.");
  }
  const turns = await loadSessionTurns(session.id);
  const targetKey =
    input.targetKey?.trim() ||
    turns.find(
      (turn) =>
        turn.speaker === "CONSULTANT" &&
        turn.targetKey &&
        unanswered(turns, turn.targetKey) != null,
    )?.targetKey;
  if (!targetKey) throw new TenantError("That question is not open.");
  const question = unanswered(turns, targetKey);
  if (!question) throw new TenantError("That question is not open.");
  const existing = [...turns]
    .reverse()
    .find(
      (turn) =>
        turn.speaker === "SEEKER" &&
        turn.targetKey === targetKey &&
        turn.body === answer &&
        !analysisIsComplete(turn.analysisJson),
    );
  if (existing) {
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: { generationStatus: "GENERATING", generationError: null },
    });
    return { sessionId: session.id, targetKey, turnId: existing.id };
  }
  const seekerTurn = await addTurn({
    organizationId: input.organizationId,
    sessionId: session.id,
    speaker: "SEEKER",
    body: answer,
    targetKey,
    seekerAuthored: true,
    intent: input.intent ?? "REPLY",
  });
  await prisma.consultationSession.update({
    where: { id: session.id },
    data: { generationStatus: "GENERATING", generationError: null },
  });
  return { sessionId: session.id, targetKey, turnId: seekerTurn.id };
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
  answer?: string;
  intent?: string | null;
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
  if (!session || session.status !== "IN_PROGRESS") {
    throw new TenantError("The consultation is not waiting for an answer.");
  }
  const turns = await loadSessionTurns(session.id);
  let seekerTurn = input.turnId
    ? turns.find((turn) => turn.id === input.turnId)
    : [...turns].reverse().find(
        (turn) =>
          turn.speaker === "SEEKER" &&
          !turn.skipped &&
          (!input.targetKey || turn.targetKey === input.targetKey) &&
          !analysisIsComplete(turn.analysisJson),
      );
  let targetKey = seekerTurn?.targetKey ?? input.targetKey ?? "";
  if (!seekerTurn) {
    if (!answer) throw new TenantError("Write an answer, or skip the question.");
    const recorded = await recordConsultationReply({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      targetKey: targetKey || null,
      answer,
      intent: input.intent,
    });
    targetKey = recorded.targetKey;
    seekerTurn = { id: recorded.turnId } as (typeof turns)[number];
  }
  if (!targetKey) throw new TenantError("That question is not open.");
  const question = [...turns]
    .reverse()
    .find(
      (turn) =>
        turn.speaker === "CONSULTANT" &&
        turn.targetKey === targetKey &&
        turn.sequence < (turns.find((item) => item.id === seekerTurn!.id)?.sequence ?? Number.MAX_SAFE_INTEGER),
    ) ?? unanswered(turns, targetKey);
  if (!question) throw new TenantError("That question is not open.");
  const seekerTurnId = seekerTurn.id;
  const { requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const targets = targetsFromRequirement(requirement);
  const target = targets.find((item) => item.key === targetKey);
  const recordedAnswer =
    ("body" in seekerTurn && typeof seekerTurn.body === "string"
      ? seekerTurn.body
      : answer) || answer;
  const answerContext = [
    ...turns
      .filter(
        (turn) =>
          turn.speaker === "SEEKER" &&
          turn.targetKey === targetKey &&
          !turn.skipped &&
          turn.id !== seekerTurnId,
      )
      .map((turn) => turn.body),
    recordedAnswer,
  ]
    .filter(Boolean)
    .join("\n");
  const processed = await processAnswerGeneration({
    organizationId: input.organizationId,
    sessionId: session.id,
    turnId: seekerTurnId,
    answerContext,
    question: question.body,
    target: target ?? null,
    targets,
    profile,
  });
  if (!processed.ok) {
    throw new Error("Consultation could not write coaching for that reply.");
  }
  if (targetKey === WHY_THIS_COMPANY_TARGET_KEY) {
    await persistWhyThisCompany({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      answer: recordedAnswer,
    });
  }
  const followUpCount = turns.filter(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      turn.targetKey === targetKey &&
      turn.followUp,
  ).length;
  if (
    processed.followUpQuestion &&
    targetKey !== "chronology" &&
    followUpCount < consultationConfig.maxFollowUpsPerTarget
  ) {
    const coaching = processed.coaching?.trim();
    await addTurn({
      organizationId: input.organizationId,
      sessionId: session.id,
      speaker: "CONSULTANT",
      body: coaching
        ? `${coaching}\n\n${processed.followUpQuestion}`
        : processed.followUpQuestion,
      targetKey,
      followUp: true,
    });
    return;
  }
  const pendingStatements = await prisma.consultationStatement.count({
    where: {
      sessionId: session.id,
      turnId: seekerTurnId,
      status: "DRAFT",
    },
  });
  if (pendingStatements > 0) return;
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
  ].filter((statement) => statement.value.text.trim());
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
  const { campaign, requirement, profile } = await requireApplication(
    input.organizationId,
    input.campaignId,
  );
  const stored = await prisma.consultationAssessment.findMany({
    where: { sessionId: session.id },
  });
  const assessments = stored.map(storedAssessment);
  const { askedKeys, skippedKeys } = askedAndSkipped(refreshed);
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
  const statement = await prisma.consultationStatement.findFirst({
    where: { id: input.statementId, organizationId: input.organizationId },
    include: { turn: true, session: true },
  });
  if (!statement) throw new TenantError("That polished statement was not found.");
  if (statement.kind === "INTERVIEW_ANSWER") {
    const qualityErrors = validateInterviewAnswerQuality({
      text: content,
      field: "interviewAnswer",
      maxWords: consultationConfig.interviewAnswerMaxWords,
      metaLanguagePhrases: consultationConfig.interviewAnswerMetaLanguage,
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
  const contentUnchanged = statement.content.trim() === content;
  let groundingJson: Prisma.InputJsonValue = statement.groundingJson as Prisma.InputJsonValue;
  if (!contentUnchanged || !statement.groundingJson) {
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
      field: statement.kind === "INTERVIEW_ANSWER" ? "interviewAnswer" : "resumeBullet",
      requireSentenceClaims: statement.kind === "INTERVIEW_ANSWER",
    });
    if (
      statement.kind === "RESUME_BULLET" &&
      (grounding.data.claims.length !== 1 ||
        grounding.data.claims[0]?.text.trim() !== content)
    ) {
      errors.push(
        qualityIssue({
          check: "grounding",
          field: "resumeBullet",
          text: content,
          message: "The resume bullet was not fully grounded.",
        }),
      );
    }
    if (errors.length > 0) {
      logQualityRejection({
        generator: "consultation.approve",
        attempt: 0,
        issues: errors,
      });
      throw new TenantError(
        "The statement contains content that is not supported by the answer or Personal Profile.",
      );
    }
    groundingJson = grounding.data.claims as Prisma.InputJsonValue;
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
        groundingJson,
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
  await continueAfterAnsweredRound({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    sessionId: session.id,
  });
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
  await addTurn({
    organizationId: input.organizationId,
    sessionId: session.id,
    speaker: "SEEKER",
    body: "Not accurate.",
    targetKey: draft.turn.targetKey,
    seekerAuthored: true,
    intent: "NOT_ACCURATE",
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
    focusTargetKey: draft.turn.targetKey,
    focusGuidance: [
      "The seeker said the last polished result was not accurate. Ask what is wrong before rewriting.",
    ],
  });
  if (next.length === 0) {
    await failGeneration(
      session.id,
      "Consultation could not ask what was inaccurate. Retry consultation.",
    );
  }
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
    throw new TenantError("The consultation is not waiting for a reply.");
  }
  const turns = await loadSessionTurns(session.id);
  const open = turns.find(
    (turn) =>
      turn.speaker === "CONSULTANT" &&
      turn.targetKey &&
      unanswered(turns, turn.targetKey) != null,
  );
  if (open?.targetKey) {
    await answerConsultationQuestion({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      targetKey: open.targetKey,
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
  throw new TenantError("There is no open question to answer.");
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

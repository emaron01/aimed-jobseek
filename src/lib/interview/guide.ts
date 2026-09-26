import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  mentionsInternalSystemState,
  validateRepetitionAndMetaLanguage,
} from "@/lib/consultation/output-quality";
import {
  qualityMessages,
} from "@/lib/generation/quality";
import { prisma } from "@/lib/prisma-client";
import {
  consultationConfig,
  interviewConfig,
  sanitizeWorkspaceFailure,
} from "@/lib/product-config";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";
import { generateInterviewClarifyingQuestions, generateInterviewGuideWithModel } from "./ai";
import {
  INTERVIEW_GUIDE_PROMPT_VERSION,
  interviewGuideClaims,
  interviewGuideContentSchema,
  interviewGuideCoachingTexts,
  interviewGuideSections,
  interviewGuideTexts,
  type InterviewClaim,
  type InterviewClarifyingQuestions,
  type InterviewGuideContent,
} from "./contract";
import type { InterviewGuidePromptInput } from "./prompt";
import { detectInterviewNoteGap, requireOwnedCampaign } from "./stages";

export type InterviewGuideSource = {
  id: string;
  text: string;
  category: string;
};

export function missingGuideMaterial(input: {
  interviewerCount: number;
  notesBefore: string | null;
  priorNotes: string[];
  stageType: string;
  rolesMissingLeaveReason: Array<{ roleId: string; label: string }>;
}): string[] {
  const missing: string[] = [];
  if (input.interviewerCount === 0) {
    missing.push("who they are meeting");
  }
  if (!input.notesBefore?.trim() && input.priorNotes.length === 0) {
    missing.push("what they were told to expect");
  }
  if (input.stageType === "HIRING_MANAGER") {
    for (const role of input.rolesMissingLeaveReason) {
      missing.push(`why they left ${role.label}`);
    }
  }
  return missing;
}

export function rolesMissingLeaveReason(
  experience: Array<{
    id: string;
    employer: string | null;
    title: string | null;
    endDate: string | null;
    reasonForLeaving?: { text?: string | null } | null;
  }>,
): Array<{ roleId: string; label: string }> {
  return experience
    .filter((role) => role.endDate?.trim())
    .filter((role) => !role.reasonForLeaving?.text?.trim())
    .map((role) => ({
      roleId: role.id,
      label: [role.title, role.employer].filter(Boolean).join(" at ") || role.id,
    }));
}

function appendSource(
  sources: InterviewGuideSource[],
  id: string,
  text: string | null | undefined,
  category: string,
) {
  const cleaned = text?.trim();
  if (cleaned) sources.push({ id, text: cleaned, category });
}

async function loadGuideContext(input: {
  organizationId: string;
  campaignId: string;
  stageId: string;
}) {
  const stage = await prisma.interviewStage.findFirst({
    where: {
      id: input.stageId,
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
    include: {
      interviewers: {
        include: { contact: true },
        orderBy: { createdAt: "asc" },
      },
      guide: true,
      campaign: {
        include: {
          product: true,
          jobRequirement: {
            include: {
              company: {
                include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } },
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
        },
      },
    },
  });
  if (!stage) throw new TenantError("Interview stage was not found.");

  const priorStages = await prisma.interviewStage.findMany({
    where: {
      campaignId: input.campaignId,
      organizationId: input.organizationId,
      sortOrder: { lt: stage.sortOrder },
    },
    orderBy: { sortOrder: "asc" },
  });
  const turnIds = stage.campaign.consultationSession?.turns.map((turn) => turn.id) ?? [];
  const stories =
    turnIds.length > 0
      ? await prisma.profileStory.findMany({
          where: {
            organizationId: input.organizationId,
            consultationTurnId: { in: turnIds },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
  const profile = stage.campaign.product.profileJson
    ? parseCandidateProfileSafe(stage.campaign.product.profileJson)
    : null;
  const experience = profile?.ok ? profile.profile.experience : [];
  const memberships = await prisma.campaignContact.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: { in: stage.interviewers.map((row) => row.contactId) },
    },
    include: { chosenPersona: { select: { id: true, name: true } } },
  });
  const personaByContact = new Map(
    memberships.map((row) => [row.contactId, row.chosenPersona]),
  );
  const scorecard = stage.campaign.jobRequirement?.scorecardJson;
  const competencies = Array.isArray((scorecard as { competencies?: unknown })?.competencies)
    ? (
        (scorecard as { competencies: Array<{ id?: string; text?: string }> }).competencies
      )
        .filter((item) => item.id && item.text)
        .map((item) => ({ id: item.id!, text: item.text! }))
    : [];

  const sources: InterviewGuideSource[] = [];
  if (profile?.ok) {
    for (const role of profile.profile.experience) {
      appendSource(sources, `profile:${role.id}`, role.summary, "PROFILE_FACT");
      for (const achievement of role.achievements) {
        if (achievement.kind === "FACT") {
          appendSource(sources, `profile:${achievement.id}`, achievement.text, "PROFILE_FACT");
        }
      }
      if (role.reasonForLeaving?.kind === "FACT") {
        appendSource(
          sources,
          `profile:${role.reasonForLeaving.id}`,
          role.reasonForLeaving.text,
          "PROFILE_FACT",
        );
      }
    }
  }
  const requirement = stage.campaign.jobRequirement;
  if (requirement) {
    appendSource(sources, "job:title", requirement.title, "JOB_REQUIREMENT");
    appendSource(sources, "job:posting", requirement.rawText, "JOB_REQUIREMENT");
  }
  const research = requirement?.company?.research[0] ?? null;
  if (research) {
    appendSource(sources, "research:summary", research.companySummary, "COMPANY_RESEARCH");
  }
  for (const role of stage.campaign.hiringTeamRoles) {
    appendSource(sources, `persona:${role.id}:reason`, role.whyThisPersonaMatters, "PERSONA");
  }
  for (const membership of memberships) {
    if (membership.individualProfileJson) {
      appendSource(
        sources,
        `contact:${membership.contactId}:individual-profile`,
        JSON.stringify(membership.individualProfileJson),
        "PERSONA",
      );
    }
    if (membership.personPrepOpening) {
      appendSource(
        sources,
        `person-prep:${membership.contactId}:opening`,
        membership.personPrepOpening,
        "PERSON_PREP",
      );
    }
    if (Array.isArray(membership.personPrepAnswersJson)) {
      membership.personPrepAnswersJson.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const text = (item as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) {
          appendSource(
            sources,
            `person-prep:${membership.contactId}:answer:${index}`,
            text,
            "PERSON_PREP",
          );
        }
      });
    }
  }
  for (const statement of stage.campaign.consultationSession?.statements ?? []) {
    appendSource(sources, `statement:${statement.id}`, statement.content, "APPROVED_STATEMENT");
  }
  for (const story of stories) {
    appendSource(
      sources,
      `story:${story.id}`,
      [
        story.verbatimAnswer,
        story.interviewAnswerApprovedAt ? story.interviewAnswer : null,
        story.resumeBulletApprovedAt ? story.resumeBullet : null,
      ]
        .filter(Boolean)
        .join(" "),
      "APPROVED_STORY",
    );
  }
  for (const prior of priorStages) {
    appendSource(sources, `interview:${prior.id}:notesAfter`, prior.notesAfter, "APPLICATION");
  }
  appendSource(sources, `interview:${stage.id}:notesBefore`, stage.notesBefore, "APPLICATION");
  appendSource(sources, `interview:${stage.id}:notesAfter`, stage.notesAfter, "APPLICATION");
  const answers = parseClarifyingAnswers(stage.guide?.clarifyingAnswersJson);
  for (const answer of answers) {
    appendSource(sources, `clarify:${answer.id}`, answer.answer, "APPLICATION");
  }

  const fingerprint = {
    stage: [stage.id, stage.updatedAt.toISOString(), stage.type, stage.notesBefore, stage.notesAfter],
    interviewers: stage.interviewers.map((row) => [row.contactId, row.contact.updatedAt.toISOString()]),
    prior: priorStages.map((row) => [row.id, row.notesAfter, row.updatedAt.toISOString()]),
    answers,
    skipped: stage.guide?.clarifyingSkipped ?? false,
    assessments:
      stage.campaign.consultationSession?.assessments.map((item) => [
        item.id,
        item.updatedAt.toISOString(),
      ]) ?? [],
    statements:
      stage.campaign.consultationSession?.statements.map((item) => [
        item.id,
        item.updatedAt.toISOString(),
      ]) ?? [],
    stories: stories.map((story) => [story.id, story.updatedAt.toISOString()]),
  };
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(fingerprint))
    .digest("hex");

  return {
    stage,
    priorStages,
    experience,
    personaByContact,
    competencies,
    stories,
    sources,
    sourceHash,
    answers,
  };
}

export function parseClarifyingQuestions(
  value: unknown,
): InterviewClarifyingQuestions["questions"] {
  if (!value || typeof value !== "object") return [];
  const row = value as { questions?: unknown };
  if (!Array.isArray(row.questions)) return [];
  return row.questions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const question = item as { id?: unknown; text?: unknown };
    return typeof question.id === "string" && typeof question.text === "string"
      ? [{ id: question.id, text: question.text }]
      : [];
  });
}

export function parseClarifyingAnswers(
  value: unknown,
): Array<{ id: string; question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; question?: unknown; answer?: unknown };
    if (
      typeof row.id !== "string" ||
      typeof row.question !== "string" ||
      typeof row.answer !== "string"
    ) {
      return [];
    }
    return [{ id: row.id, question: row.question, answer: row.answer }];
  });
}

export function validateInterviewGuideContent(input: {
  content: InterviewGuideContent;
  sources: InterviewGuideSource[];
  stageType: string;
  interviewerIds: string[];
  experience: Array<{
    id: string;
    employer: string | null;
    title: string | null;
    endDate: string | null;
    reasonForLeaving?: { text?: string | null } | null;
  }>;
  priorNoteSourceIds: string[];
  approvedStatementIds: string[];
  approvedStoryIds: string[];
}): string[] {
  const errors: string[] = [];
  const texts = interviewGuideTexts(input.content);
  const coachingTexts = interviewGuideCoachingTexts(input.content);
  const firstPerson = /\b(I|I'm|I've|I'd|I'll|my|mine)\b/i;
  for (const text of coachingTexts) {
    if (firstPerson.test(text)) {
      errors.push(
        "Write the guide to the seeker in second person. Put first-person speech only in labeled example answers.",
      );
      break;
    }
  }
  for (const interviewer of input.content.interviewers) {
    for (const item of interviewer.likelyQuestions) {
      if (!/\b(I|I'm|I've|I'd|I'll|my|mine)\b/i.test(item.exampleAnswer.text)) {
        errors.push(
          "Write each example answer as first-person words the seeker would say aloud.",
        );
      }
    }
  }
  if (texts.some(mentionsInternalSystemState)) {
    errors.push("Remove references to internal system state.");
  }
  for (const section of interviewGuideSections(input.content)) {
    errors.push(
      ...qualityMessages(
        validateRepetitionAndMetaLanguage({
          text: section.text,
          field: section.name,
        }),
      ),
    );
  }
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  for (const claim of interviewGuideClaims(input.content)) {
    for (const support of claim.supports) {
      const source = sourceById.get(support.sourceId);
      if (!source) {
        errors.push(`Claim ${claim.id} cites unknown source "${support.sourceId}".`);
        continue;
      }
      if (!source.text.toLowerCase().includes(support.quote.trim().toLowerCase())) {
        errors.push(`Claim ${claim.id} cites words that are absent from its source.`);
      }
    }
  }
  const seenInterviewers = new Set<string>();
  for (const interviewer of input.content.interviewers) {
    if (!input.interviewerIds.includes(interviewer.contactId)) {
      errors.push("Guide referenced an interviewer who is not on this stage.");
    }
    if (seenInterviewers.has(interviewer.contactId)) {
      errors.push("Guide duplicated an interviewer.");
    }
    seenInterviewers.add(interviewer.contactId);
    for (const item of interviewer.likelyQuestions) {
      for (const statementId of item.statementIds) {
        if (!input.approvedStatementIds.includes(statementId)) {
          errors.push(`Answer material cited unknown statement ${statementId}.`);
        }
      }
      for (const storyId of item.storyIds) {
        if (!input.approvedStoryIds.includes(storyId)) {
          errors.push(`Answer material cited unknown story ${storyId}.`);
        }
      }
    }
  }
  if (input.stageType === "HIRING_MANAGER") {
    const walkthrough = input.content.chronologicalWalkthrough ?? [];
    if (walkthrough.length === 0) {
      errors.push("A hiring manager guide must include chronological walk-through preparation.");
    }
    const byRole = new Map(walkthrough.map((row) => [row.roleId, row]));
    for (const role of input.experience) {
      const entry = byRole.get(role.id);
      if (!entry) {
        errors.push(
          `Chronological preparation omitted role ${role.id}. Include every requiredWalkthroughRoleId.`,
        );
        continue;
      }
      const knownReason = role.reasonForLeaving?.text?.trim() ?? "";
      if (!knownReason) {
        if (entry.reasonForLeaving.trim()) {
          errors.push(
            `Do not invent a reason for leaving for ${role.id}. Set reasonUnknown true and reasonForLeaving to an empty string.`,
          );
        }
        if (!entry.reasonUnknown) {
          errors.push(
            `When the reason for leaving is unknown for ${role.id}, set reasonUnknown true instead of inventing one.`,
          );
        }
      }
    }
  }
  if (input.priorNoteSourceIds.length > 0) {
    const cited = interviewGuideClaims(input.content).some((claim) =>
      claim.supports.some((support) =>
        input.priorNoteSourceIds.includes(support.sourceId),
      ),
    );
    if (!cited) {
      errors.push(
        `This guide must use the notes from an earlier stage. Cite one of these source ids with a verbatim quote: ${input.priorNoteSourceIds.join(", ")}.`,
      );
    }
  }
  return [...new Set(errors)];
}

export function limitClarifyingQuestions(
  questions: InterviewClarifyingQuestions["questions"],
): InterviewClarifyingQuestions["questions"] {
  return questions.slice(0, interviewConfig.clarifyingQuestionLimit);
}

export async function requestInterviewGuide(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  stageId: string;
  answers?: Array<{ id: string; answer: string }>;
  skipQuestions?: boolean;
  regenerationInstruction?: string | null;
}): Promise<
  | { status: "NEEDS_CLARIFICATION"; questions: InterviewClarifyingQuestions["questions"] }
  | { status: "READY"; stale: boolean }
  | { status: "FAILED"; message: string }
> {
  await requireOwnedCampaign(input);
  const context = await loadGuideContext(input);
  const missing = missingGuideMaterial({
    interviewerCount: context.stage.interviewers.length,
    notesBefore: context.stage.notesBefore,
    priorNotes: context.priorStages
      .map((row) => row.notesAfter)
      .filter((text): text is string => Boolean(text?.trim())),
    stageType: context.stage.type,
    rolesMissingLeaveReason: rolesMissingLeaveReason(context.experience),
  });
  const alreadyResolved =
    Boolean(input.skipQuestions) ||
    Boolean(context.stage.guide?.clarifyingSkipped) ||
    (input.answers && input.answers.length > 0) ||
    parseClarifyingAnswers(context.stage.guide?.clarifyingAnswersJson).length > 0;

  let skipUnusableQuestions = false;
  if (missing.length > 0 && !alreadyResolved && !input.regenerationInstruction) {
    let questions: InterviewClarifyingQuestions["questions"] = [];
    let lastFailure: string | null = null;
    for (
      let attempt = 0;
      attempt <= consultationConfig.qualityRegenerationAttempts;
      attempt += 1
    ) {
      const generated = await generateInterviewClarifyingQuestions({
        missing,
        qualityFeedback: [],
      });
      if (!generated.ok) {
        lastFailure = generated.message;
        continue;
      }
      questions = limitClarifyingQuestions(generated.data.questions);
      break;
    }
    if (lastFailure && questions.length === 0) {
      return { status: "FAILED", message: lastFailure };
    }
    if (questions.length > 0) {
      await prisma.interviewStageGuide.upsert({
        where: { stageId: input.stageId },
        create: {
          organizationId: input.organizationId,
          stageId: input.stageId,
          status: "GENERATING",
          clarifyingQuestionsJson: { questions },
          promptVersion: INTERVIEW_GUIDE_PROMPT_VERSION,
        },
        update: {
          status: "GENERATING",
          clarifyingQuestionsJson: { questions },
          generationError: null,
          promptVersion: INTERVIEW_GUIDE_PROMPT_VERSION,
        },
      });
      return { status: "NEEDS_CLARIFICATION", questions };
    }
    skipUnusableQuestions = true;
  }

  const storedQuestions = parseClarifyingQuestions(
    context.stage.guide?.clarifyingQuestionsJson,
  );
  const clarifyingAnswers =
    input.answers?.map((answer) => ({
      id: answer.id,
      question:
        storedQuestions.find((question) => question.id === answer.id)?.text ?? "",
      answer: answer.answer.trim(),
    })) ?? parseClarifyingAnswers(context.stage.guide?.clarifyingAnswersJson);

  const promptInput = buildPromptInput(context, clarifyingAnswers);
  let feedback: string[] = [];
  if (input.regenerationInstruction?.trim()) {
    feedback = [input.regenerationInstruction.trim()];
  }
  await prisma.interviewStageGuide.upsert({
    where: { stageId: input.stageId },
    create: {
      organizationId: input.organizationId,
      stageId: input.stageId,
      status: "GENERATING",
      clarifyingAnswersJson: clarifyingAnswers,
      clarifyingSkipped:
        Boolean(input.skipQuestions) ||
        skipUnusableQuestions ||
        Boolean(context.stage.guide?.clarifyingSkipped),
      promptVersion: INTERVIEW_GUIDE_PROMPT_VERSION,
    },
    update: {
      status: "GENERATING",
      generationError: null,
      clarifyingAnswersJson: clarifyingAnswers,
      clarifyingSkipped:
        Boolean(input.skipQuestions) ||
        skipUnusableQuestions ||
        context.stage.guide?.clarifyingSkipped,
      promptVersion: INTERVIEW_GUIDE_PROMPT_VERSION,
    },
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generated = await generateInterviewGuideWithModel({
      ...promptInput,
      qualityFeedback: feedback,
    });
    if (!generated.ok) {
      console.error(
        JSON.stringify({
          event: "interview_guide_parse_failed",
          attempt: attempt + 1,
          errors: [generated.message],
        }),
      );
      if (attempt === 1) {
        await prisma.interviewStageGuide.update({
          where: { stageId: input.stageId },
          data: { status: "FAILED", generationError: generated.message },
        });
        return { status: "FAILED", message: generated.message };
      }
      continue;
    }
    await prisma.interviewStageGuide.update({
      where: { stageId: input.stageId },
      data: {
        status: "READY",
        contentJson: generated.data as unknown as Prisma.InputJsonValue,
        sourceHash: context.sourceHash,
        generationError: null,
        generatedAt: new Date(),
        promptVersion: INTERVIEW_GUIDE_PROMPT_VERSION,
      },
    });
    return { status: "READY", stale: false };
  }
  await prisma.interviewStageGuide.update({
    where: { stageId: input.stageId },
    data: {
      status: "FAILED",
      generationError: "The model did not return a usable interview guide.",
    },
  });
  return {
    status: "FAILED",
    message: "The model did not return a usable interview guide.",
  };
}

function buildPromptInput(
  context: Awaited<ReturnType<typeof loadGuideContext>>,
  clarifyingAnswers: Array<{ id: string; question: string; answer: string }>,
): InterviewGuidePromptInput {
  return {
    stageType: context.stage.type,
    format: context.stage.format,
    scheduledAt: context.stage.scheduledAt.toISOString(),
    notesBefore: context.stage.notesBefore,
    notesAfter: context.stage.notesAfter,
    expectedDecisionAt: context.stage.expectedDecisionAt?.toISOString() ?? null,
    interviewers: context.stage.interviewers.map((row) => ({
      contactId: row.contactId,
      firstName: row.contact.firstName,
      lastName: row.contact.lastName,
      title: row.contact.title,
      roleId: context.personaByContact.get(row.contactId)?.id ?? null,
      roleName: context.personaByContact.get(row.contactId)?.name ?? null,
    })),
    priorStageNotes: context.priorStages
      .filter((row) => row.notesAfter?.trim())
      .map((row) => ({
        stageId: row.id,
        type: row.type,
        notesAfter: row.notesAfter!,
      })),
    clarifyingAnswers,
    profileRoles: context.experience.map((role) => ({
      roleId: role.id,
      employer: role.employer,
      title: role.title,
      startDate: role.startDate,
      endDate: role.endDate,
      achievements: role.achievements
        .filter((item) => item.kind === "FACT")
        .map((item) => item.text),
      reasonForLeaving: role.reasonForLeaving?.text ?? null,
    })),
    approvedStatements:
      context.stage.campaign.consultationSession?.statements.map((statement) => ({
        id: statement.id,
        text: statement.content,
      })) ?? [],
    approvedStories: context.stories.map((story) => ({
      id: story.id,
      text:
        story.interviewAnswerApprovedAt && story.interviewAnswer
          ? story.interviewAnswer
          : story.verbatimAnswer ?? story.resumeBullet ?? "",
    })),
    scorecardCompetencies: context.competencies,
    consultationGaps:
      context.stage.campaign.consultationSession?.assessments
        .filter((item) => item.strength === "NONE")
        .map((item) => ({ targetKey: item.targetKey, text: item.text })) ?? [],
    personas: context.stage.campaign.hiringTeamRoles.map((role) => ({
      id: role.id,
      name: role.name,
      text: [role.whyThisPersonaMatters, ...parseStringArray(role.targetTitles)]
        .filter(Boolean)
        .join(". "),
    })),
    sources: context.sources,
    qualityFeedback: [],
  };
}

export async function getInterviewGuideView(input: {
  organizationId: string;
  campaignId: string;
  stageId: string;
}) {
  const context = await loadGuideContext(input);
  const parsed = context.stage.guide?.contentJson
    ? interviewGuideContentSchema.safeParse(context.stage.guide.contentJson)
    : null;
  return {
    stage: {
      ...context.stage,
      guide: context.stage.guide
        ? {
            ...context.stage.guide,
            generationError: sanitizeWorkspaceFailure(
              context.stage.guide.generationError,
            ),
          }
        : context.stage.guide,
    },
    priorStages: context.priorStages,
    content: parsed?.success ? parsed.data : null,
    questions: parseClarifyingQuestions(context.stage.guide?.clarifyingQuestionsJson),
    answers: context.answers,
    stale:
      context.stage.guide?.status === "READY" &&
      context.stage.guide.sourceHash !== context.sourceHash,
    sourceHash: context.sourceHash,
  };
}

export async function refreshConsultationOffer(input: {
  organizationId: string;
  campaignId: string;
  stageId: string;
}) {
  const context = await loadGuideContext(input);
  const notes = context.stage.notesAfter?.trim() ?? "";
  const gap = detectInterviewNoteGap({
    notesAfter: notes,
    assessments:
      context.stage.campaign.consultationSession?.assessments.map((item) => ({
        targetKey: item.targetKey,
        text: item.text,
        strength: item.strength,
      })) ?? [],
    scorecardCompetencies: context.competencies,
  });
  await prisma.interviewStage.update({
    where: { id: input.stageId },
    data: {
      consultationOfferJson: gap
        ? {
            targetKey: gap.targetKey,
            text: gap.text,
            offeredAt: new Date().toISOString(),
          }
        : Prisma.JsonNull,
    },
  });
  return gap;
}

export function parseGuideContent(value: unknown): InterviewGuideContent | null {
  const parsed = interviewGuideContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type { InterviewClaim, InterviewGuideContent };

/**
 * Ask Harper: one seeker-written General question, answered by the existing
 * role-expertise answers step. Drafts stay out of the Harper sections and the
 * Cheat Sheet until the seeker approves the suggested answer.
 */
import { isRealAskHarperQuestion } from "@/lib/consultation/ask-harper-answer";
import { ASK_HARPER_TARGET_PREFIX, CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import { deriveCareerStage } from "@/lib/consultation/career-stage";
import { profileEvidenceForApplication } from "@/lib/consultation/assess";
import {
  buildConsultationQaView,
  harperHasAskedQuestion,
  type ConsultationQaItem,
} from "@/lib/consultation/qa-view";
import {
  generateAskHarperSuggestedAnswer,
  storeRoleExpertiseQuestions,
  type RoleExpertiseJobInputs,
} from "@/lib/consultation/role-expertise";
import { prisma } from "@/lib/prisma-client";
import { consultationConversationCopy, vocab } from "@/lib/product-config";
import {
  emptyCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";
import { TenantError } from "@/lib/tenant/errors";

export function isAskHarperTargetKey(targetKey: string | null | undefined): boolean {
  return Boolean(targetKey?.startsWith(ASK_HARPER_TARGET_PREFIX));
}

export function askHarperDraftQuestions(
  questions: readonly ConsultationQaItem[],
): ConsultationQaItem[] {
  return questions.filter(
    (item) =>
      isAskHarperTargetKey(item.targetKey) &&
      item.talkingPoint?.status !== "APPROVED" &&
      item.resumeBullet?.status !== "APPROVED",
  );
}

export async function applicationHasHarperQuestion(input: {
  organizationId: string;
  campaignId: string;
}): Promise<boolean> {
  const turns = await prisma.consultationTurn.findMany({
    where: {
      organizationId: input.organizationId,
      speaker: "CONSULTANT",
      followUp: false,
      session: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
      },
    },
    select: { speaker: true, followUp: true, intent: true },
  });
  return harperHasAskedQuestion(turns);
}

export async function loadAskHarperDrafts(input: {
  organizationId: string;
  campaignId: string;
}): Promise<ConsultationQaItem[]> {
  const session = await prisma.consultationSession.findFirst({
    where: { organizationId: input.organizationId, campaignId: input.campaignId },
    select: {
      turns: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          speaker: true,
          body: true,
          targetKey: true,
          followUp: true,
          sequence: true,
          analysisJson: true,
          intent: true,
          questionContextJson: true,
        },
      },
      statements: {
        select: {
          id: true,
          turnId: true,
          kind: true,
          status: true,
          content: true,
          strengtheningNote: true,
          createdAt: true,
          groundingJson: true,
        },
      },
    },
  });
  if (!session) return [];
  const view = buildConsultationQaView({
    turns: session.turns.map((turn) => ({
      ...turn,
      speaker: turn.speaker,
    })),
    statements: session.statements,
  });
  return askHarperDraftQuestions(view.questions);
}

export async function askHarper(input: {
  organizationId: string;
  campaignId: string;
  question: string;
}): Promise<{ ok: true; targetKey: string; skipped: boolean } | { ok: false; message: string }> {
  const question = input.question.trim();
  if (!isRealAskHarperQuestion(question)) {
    return { ok: false, message: consultationConversationCopy.askHarperNotAQuestion };
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { id: true, productId: true, whyThisCompany: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: input.campaignId, organizationId: input.organizationId },
  });
  if (!requirement) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement yet.`,
    );
  }
  const product = await prisma.product.findFirst({
    where: { id: campaign.productId, organizationId: input.organizationId },
    select: { profileJson: true },
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

  const job: RoleExpertiseJobInputs = {
    title: requirement.title,
    companyName: requirement.companyName,
    seniority: requirement.seniority,
    location: requirement.location,
    workArrangement: requirement.workArrangement,
    requiredItems: requirement.requiredItems,
    preferredItems: requirement.preferredItems,
    responsibilities: requirement.responsibilities,
    scorecardJson: requirement.scorecardJson,
  };
  const generated = await generateAskHarperSuggestedAnswer({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    questionText: question,
    careerStage: deriveCareerStage(parsed.profile),
    job,
    profileItems: profileEvidenceForApplication(parsed.profile, {
      campaignId: input.campaignId,
      whyThisCompany: campaign.whyThisCompany,
    }),
  });
  if (!generated.ok) {
    return {
      ok: false,
      message: consultationConversationCopy.askHarperFailed,
    };
  }

  const session =
    (await prisma.consultationSession.findUnique({
      where: { campaignId: input.campaignId },
      select: { id: true },
    })) ??
    (await prisma.consultationSession.create({
      data: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        productId: campaign.productId,
        status: "IN_PROGRESS",
        promptVersion: CONSULTATION_PROMPT_VERSION,
      },
      select: { id: true },
    }));

  await storeRoleExpertiseQuestions({
    organizationId: input.organizationId,
    sessionId: session.id,
    questions: [generated.question],
  });

  return {
    ok: true,
    targetKey: generated.question.targetKey,
    skipped: generated.skipped,
  };
}

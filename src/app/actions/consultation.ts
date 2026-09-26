"use server";

import { revalidatePath } from "next/cache";
import {
  approveConsultationQaResult,
  approveConsultationStatement,
  completeConsultation,
  confirmConsultationProposal,
  dismissConsultationProposal,
  pauseConsultation,
  regenerateConsultationQaResult,
  regenerateConsultationStatement,
  resolveConsultationStatementFlag,
  saveEditedConsultationStatement,
  resumeConsultation,
  reviseConsultationResult,
  skipConsultation,
  skipConsultationQuestion,
  confirmConsultationResult,
  flagConsultationInaccuracy,
  recordConsultationReply,
} from "@/lib/consultation/service";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  applicationAssetConfig,
  consultationConversationCopy,
  isObsoleteWorkspaceFailure,
  vocab,
} from "@/lib/product-config";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { prisma } from "@/lib/prisma";
import { saveSeekerStatedBackground } from "@/lib/product-research/seeker-background";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";

export type ConsultationActionResult = { ok: boolean; message: string };

function seekerFacingActionMessage(message: string, fallback: string): string {
  const trimmed = message.trim();
  if (
    !trimmed ||
    isObsoleteWorkspaceFailure(trimmed) ||
    /that question is not open/i.test(trimmed) ||
    /there is no open question/i.test(trimmed) ||
    /not waiting for an answer/i.test(trimmed) ||
    /not waiting for a reply/i.test(trimmed) ||
    /that question was not found/i.test(trimmed)
  ) {
    return fallback;
  }
  return trimmed;
}

function fail(error: unknown, fallback: string): ConsultationActionResult {
  if (error instanceof TenantError) {
    return {
      ok: false,
      message: seekerFacingActionMessage(error.message, fallback),
    };
  }
  console.error(
    JSON.stringify({
      event: "consultation_action_failed",
      message: error instanceof Error ? error.message : "unknown",
    }),
  );
  return { ok: false, message: fallback };
}

function campaignIdFrom(formData: FormData): string {
  return String(formData.get("campaignId") ?? "").trim();
}

export async function startConsultationAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "start" },
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: consultationConversationCopy.starting };
  } catch (error) {
    return fail(error, "The consultation could not be started.");
  }
}

export async function retryConsultationAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "retry" },
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: consultationConversationCopy.starting };
  } catch (error) {
    return fail(error, "The consultation could not be retried.");
  }
}

export async function skipConsultationAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await skipConsultation({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      ok: true,
      message: `Skipped. Materials can still be generated from the ${vocab.product.singular} alone.`,
    };
  } catch (error) {
    return fail(error, "The consultation could not be skipped.");
  }
}

export async function pauseConsultationAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await pauseConsultation({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Paused. You can resume later." };
  } catch (error) {
    return fail(error, "The consultation could not be paused.");
  }
}

export async function resumeConsultationAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await resumeConsultation({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Consultation resumed." };
  } catch (error) {
    return fail(error, "The consultation could not be resumed.");
  }
}

export async function completeConsultationAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await completeConsultation({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Consultation marked done." };
  } catch (error) {
    return fail(error, "The consultation could not be completed.");
  }
}

export async function answerConsultationAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const targetKey = String(formData.get("targetKey") ?? "").trim();
    const answer = String(formData.get("answer") ?? "");
    if (!campaignId || !targetKey) {
      return { ok: false, message: consultationConversationCopy.replyFailed };
    }
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "answer", targetKey, answer },
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: consultationConversationCopy.typing };
  } catch (error) {
    return fail(error, "The answer could not be saved.");
  }
}

export async function skipConsultationQuestionAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const targetKey = String(formData.get("targetKey") ?? "").trim();
    if (!campaignId || !targetKey) {
      return { ok: false, message: consultationConversationCopy.replyFailed };
    }
    await skipConsultationQuestion({ organizationId, campaignId, targetKey });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Question skipped." };
  } catch (error) {
    return fail(error, "The question could not be skipped.");
  }
}

export async function confirmConsultationProposalAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const proposalId = String(formData.get("proposalId") ?? "").trim();
    if (!proposalId) return { ok: false, message: "That proposed item was not found." };
    await confirmConsultationProposal({
      organizationId,
      proposalId,
      text: String(formData.get("text") ?? ""),
      situation: String(formData.get("situation") ?? "") || null,
      task: String(formData.get("task") ?? "") || null,
      action: String(formData.get("action") ?? "") || null,
      result: String(formData.get("result") ?? "") || null,
    });
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: `Saved to the ${vocab.product.singular}.` };
  } catch (error) {
    return fail(error, "The item could not be saved.");
  }
}

export async function dismissConsultationProposalAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const proposalId = String(formData.get("proposalId") ?? "").trim();
    if (!proposalId) return { ok: false, message: "That proposed item was not found." };
    await dismissConsultationProposal({ organizationId, proposalId });
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Dismissed. Nothing was written to the profile." };
  } catch (error) {
    return fail(error, "The item could not be dismissed.");
  }
}

export async function approveConsultationStatementAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const statementId = String(formData.get("statementId") ?? "").trim();
    if (!statementId) {
      return { ok: false, message: "That polished statement was not found." };
    }
    await approveConsultationStatement({
      organizationId,
      statementId,
      content: String(formData.get("content") ?? ""),
    });
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Polished statement approved." };
  } catch (error) {
    return fail(error, "The polished statement could not be approved.");
  }
}

export async function regenerateConsultationStatementAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const statementId = String(formData.get("statementId") ?? "").trim();
    if (!statementId) {
      return { ok: false, message: "That polished statement was not found." };
    }
    await regenerateConsultationStatement({ organizationId, statementId });
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Polished statement regenerated." };
  } catch (error) {
    return fail(error, "The polished statement could not be regenerated.");
  }
}

export async function resolveConsultationStatementFlagAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const statementId = String(formData.get("statementId") ?? "").trim();
    const claimId = String(formData.get("claimId") ?? "").trim();
    const action = String(formData.get("flagAction") ?? "").trim();
    if (!statementId) {
      return { ok: false, message: "That polished statement was not found." };
    }
    if (action !== "KEPT" && action !== "REMOVED") {
      return { ok: false, message: "That flag action is not available." };
    }
    await resolveConsultationStatementFlag({
      organizationId,
      statementId,
      claimId,
      action,
    });
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    return {
      ok: true,
      message:
        "Saved.",
    };
  } catch (error) {
    return fail(error, "The claim flag could not be updated.");
  }
}

export async function saveEditedConsultationStatementAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const statementId = String(formData.get("statementId") ?? "").trim();
    if (!statementId) {
      return { ok: false, message: "That polished statement was not found." };
    }
    await saveEditedConsultationStatement({
      organizationId,
      statementId,
      content: String(formData.get("content") ?? ""),
    });
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: applicationAssetConfig.labels.saveNewVersion };
  } catch (error) {
    return fail(error, "The polished statement could not be saved.");
  }
}

export async function replyConsultationAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    const answer = String(formData.get("answer") ?? "").trim();
    if (!answer) {
      return { ok: false, message: consultationConversationCopy.threadReply };
    }
    const targetKey = String(formData.get("targetKey") ?? "").trim();
    const recorded = await recordConsultationReply({
      organizationId,
      campaignId,
      targetKey: targetKey || null,
      answer,
      intent: "REPLY",
    });
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: {
        operation: "process_reply",
        answer,
        targetKey: recorded.targetKey,
        turnId: recorded.turnId,
        questionTurnId: recorded.questionTurnId,
      },
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: consultationConversationCopy.thinking };
  } catch (error) {
    return fail(error, consultationConversationCopy.replyFailed);
  }
}

function statementIdsFrom(formData: FormData): string[] {
  return formData
    .getAll("statementId")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export async function approveConsultationQaResultAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const statementIds = statementIdsFrom(formData);
    if (statementIds.length === 0) {
      return { ok: false, message: "That polished statement was not found." };
    }
    await approveConsultationQaResult({ organizationId, statementIds });
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: consultationConversationCopy.confirmed };
  } catch (error) {
    return fail(error, "The result could not be approved.");
  }
}

export async function regenerateConsultationQaResultAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    const statementIds = statementIdsFrom(formData);
    if (statementIds.length === 0) {
      return { ok: false, message: "That polished statement was not found." };
    }
    await regenerateConsultationQaResult({ organizationId, statementIds });
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Polished statement regenerated." };
  } catch (error) {
    return fail(error, "The result could not be regenerated.");
  }
}

export async function useConsultationResultAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await confirmConsultationResult({ organizationId, campaignId });
    try {
      await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "CONSULTATION",
        payload: { operation: "continue" },
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "consultation_continue_enqueue_failed",
          campaignId,
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: consultationConversationCopy.confirmed };
  } catch (error) {
    return fail(error, "The result could not be used.");
  }
}

export async function reviseConsultationResultAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    const instruction = String(formData.get("instruction") ?? "").trim();
    if (!instruction) {
      return { ok: false, message: consultationConversationCopy.changePrompt };
    }
    await reviseConsultationResult({ organizationId, campaignId, instruction });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: consultationConversationCopy.changeSomething };
  } catch (error) {
    return fail(error, "The result could not be revised.");
  }
}

export async function flagConsultationInaccuracyAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await flagConsultationInaccuracy({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: consultationConversationCopy.notAccurate };
  } catch (error) {
    return fail(error, "The inaccuracy could not be recorded.");
  }
}

export async function saveWhatYouShouldKnowAboutMeAction(
  _prev: ConsultationActionResult | null,
  formData: FormData,
): Promise<ConsultationActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    const user = await requireCurrentUser();
    const campaignId = campaignIdFrom(formData);
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { productId: true },
    });
    if (!campaign) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await saveSeekerStatedBackground({
      organizationId,
      productId: campaign.productId,
      userId: user.id,
      campaignId,
      text: String(formData.get("background") ?? ""),
    });
    await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "CONSULTATION",
      payload: { operation: "reassess" },
    });
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/consultation`);
    revalidatePath(`/campaigns/${campaignId}/assets`);
    return { ok: true, message: consultationConversationCopy.knowAboutMeSaved };
  } catch (error) {
    return fail(error, consultationConversationCopy.knowAboutMeFailed);
  }
}

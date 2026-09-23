"use server";

import { revalidatePath } from "next/cache";
import {
  answerConsultationQuestion,
  completeConsultation,
  confirmConsultationProposal,
  dismissConsultationProposal,
  pauseConsultation,
  retryConsultationGeneration,
  resumeConsultation,
  skipConsultation,
  skipConsultationQuestion,
  startConsultation,
} from "@/lib/consultation/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { vocab } from "@/lib/product-config";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";

export type ConsultationActionResult = { ok: boolean; message: string };

function fail(error: unknown, fallback: string): ConsultationActionResult {
  if (error instanceof TenantError) return { ok: false, message: error.message };
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
    await startConsultation({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Consultation started." };
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
    await retryConsultationGeneration({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Consultation generation retried." };
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
      return { ok: false, message: "That question was not found." };
    }
    await answerConsultationQuestion({
      organizationId,
      campaignId,
      targetKey,
      answer,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Answer saved." };
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
      return { ok: false, message: "That question was not found." };
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

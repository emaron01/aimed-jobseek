"use server";

import { revalidatePath } from "next/cache";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import {
  answerCheatSheetCoachItem,
  approveCheatSheetSampleAnswer,
  resolveApplicationSummaryFlag,
  saveCheatSheetSampleDraft,
} from "@/lib/application-summary/service";
import { queueHiringTeamBuild } from "@/lib/hiring-team/build";
import {
  applicationSummaryConfig,
  consultationConversationCopy,
  vocab,
  workspaceProgressText,
} from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

export type ApplicationSummaryActionResult = {
  ok: boolean;
  message: string;
  jobId?: string;
};

export async function buildCheatSheetPersonaAction(
  _previous: ApplicationSummaryActionResult | null,
  formData: FormData,
): Promise<ApplicationSummaryActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const personaId = String(formData.get("personaId") ?? "").trim();
  if (!campaignId || !personaId) {
    return { ok: false, message: `${vocab.persona.Singular} was not found.` };
  }
  try {
    const organizationId = await requireOrganizationId();
    const user = await requireCurrentUser();
    const job = await queueHiringTeamBuild({
      organizationId,
      campaignId,
      personaId,
      initiatedByUserId: user.id,
    });
    revalidatePath(`/campaigns/${campaignId}/summary`);
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/interviews`);
    return {
      ok: true,
      message: workspaceProgressText("HIRING_TEAM_BUILD"),
      jobId: job.id,
    };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    console.error(
      JSON.stringify({
        event: "cheat_sheet_persona_build_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return {
      ok: false,
      message: `${vocab.persona.Singular} could not be built.`,
    };
  }
}

export async function generateApplicationSummaryAction(
  _previous: ApplicationSummaryActionResult | null,
  formData: FormData,
): Promise<ApplicationSummaryActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Application was not found." };
  try {
    const organizationId = await requireOrganizationId();
    const user = await requireCurrentUser();
    const sectionKey = String(formData.get("sectionKey") ?? "").trim() || undefined;
    const { applicationSummaryNothingToRebuild } = await import(
      "@/lib/application-summary/service"
    );
    if (
      await applicationSummaryNothingToRebuild({
        organizationId,
        campaignId,
        sectionKey,
      })
    ) {
      return {
        ok: true,
        message: sectionKey
          ? applicationSummaryConfig.actions.unchangedLikelyQuestions
          : applicationSummaryConfig.actions.unchanged,
      };
    }
    const job = await enqueueApplicationJob({
      organizationId,
      campaignId,
      type: "APPLICATION_SUMMARY",
      targetId: sectionKey ?? null,
      initiatedByUserId: user.id,
      payload: { userId: user.id, sectionKey },
    });
    revalidatePath(`/campaigns/${campaignId}/summary`);
    revalidatePath(`/campaigns/${campaignId}/interviews`);
    return {
      ok: true,
      message: sectionKey
        ? applicationSummaryConfig.actions.refreshingLikelyQuestions
        : workspaceProgressText("APPLICATION_SUMMARY"),
      jobId: job.id,
    };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    console.error(
      JSON.stringify({
        event: "application_summary_action_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return {
      ok: false,
      message: `${applicationSummaryConfig.title} could not be generated. Retry.`,
    };
  }
}

export async function answerCheatSheetCoachAction(
  _previous: ApplicationSummaryActionResult | null,
  formData: FormData,
): Promise<ApplicationSummaryActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const answer = String(formData.get("answer") ?? "");
  if (!campaignId) return { ok: false, message: "Application was not found." };
  if (!itemId) {
    return { ok: false, message: "That question was not found." };
  }
  try {
    const [organizationId, user] = await Promise.all([
      requireOrganizationId(),
      requireCurrentUser(),
    ]);
    const recorded = await answerCheatSheetCoachItem({
      organizationId,
      campaignId,
      userId: user.id,
      itemId,
      answer,
    });
    let jobId: string | undefined;
    if (!recorded.unchanged) {
      const job = await enqueueApplicationJob({
        organizationId,
        campaignId,
        type: "CONSULTATION",
        payload: { operation: "process_reply" },
      });
      jobId = job.id;
    }
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/summary`);
    revalidatePath(`/campaigns/${campaignId}/consultation`);
    return {
      ok: true,
      message: recorded.unchanged
        ? consultationConversationCopy.answerUnchanged
        : consultationConversationCopy.thinking,
      ...(jobId ? { jobId } : {}),
    };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    console.error(
      JSON.stringify({
        event: "cheat_sheet_coach_reply_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return { ok: false, message: consultationConversationCopy.replyFailed };
  }
}

export async function approveCheatSheetSampleAction(
  _previous: ApplicationSummaryActionResult | null,
  formData: FormData,
): Promise<ApplicationSummaryActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Application was not found." };
  if (!itemId) return { ok: false, message: "That question was not found." };
  try {
    const [organizationId, user] = await Promise.all([
      requireOrganizationId(),
      requireCurrentUser(),
    ]);
    await approveCheatSheetSampleAnswer({
      organizationId,
      campaignId,
      userId: user.id,
      itemId,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/summary`);
    revalidatePath(`/campaigns/${campaignId}/consultation`);
    return { ok: true, message: consultationConversationCopy.confirmed };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    console.error(
      JSON.stringify({
        event: "cheat_sheet_sample_approve_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return { ok: false, message: consultationConversationCopy.replyFailed };
  }
}

export async function saveCheatSheetSampleDraftAction(
  _previous: ApplicationSummaryActionResult | null,
  formData: FormData,
): Promise<ApplicationSummaryActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  if (!campaignId) return { ok: false, message: "Application was not found." };
  if (!itemId) return { ok: false, message: "That question was not found." };
  try {
    const [organizationId, user] = await Promise.all([
      requireOrganizationId(),
      requireCurrentUser(),
    ]);
    await saveCheatSheetSampleDraft({
      organizationId,
      campaignId,
      userId: user.id,
      itemId,
      content,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/summary`);
    revalidatePath(`/campaigns/${campaignId}/consultation`);
    return { ok: true, message: consultationConversationCopy.answerUnchanged };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    console.error(
      JSON.stringify({
        event: "cheat_sheet_sample_draft_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return { ok: false, message: consultationConversationCopy.replyFailed };
  }
}

export async function resolveApplicationSummaryFlagAction(
  _previous: ApplicationSummaryActionResult | null,
  formData: FormData,
): Promise<ApplicationSummaryActionResult> {
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const claimId = String(formData.get("claimId") ?? "").trim();
  const action = String(formData.get("flagAction") ?? "").trim();
  if (!campaignId) return { ok: false, message: "Application was not found." };
  if (action !== "KEPT" && action !== "REMOVED") {
    return { ok: false, message: "That flag action is not available." };
  }
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    await resolveApplicationSummaryFlag({
      organizationId,
      campaignId,
      claimId,
      action,
    });
    revalidatePath(`/campaigns/${campaignId}/summary`);
    return {
      ok: true,
      message:
        "Saved.",
    };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "The claim flag could not be updated." };
  }
}

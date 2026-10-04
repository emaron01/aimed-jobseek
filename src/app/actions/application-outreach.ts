"use server";

import type { EmailLength } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import {
  markApplicationApplied,
  markOutreachSent,
  saveOutreachMessageEdit,
} from "@/lib/application-assets/outreach";
import {
  isHiringTeamPersonaBuilt,
  queueHiringTeamBuild,
} from "@/lib/hiring-team/build";
import {
  resolveOutreachGeneratorKind,
} from "@/lib/application-assets/display";
import {
  applicationSummaryConfig,
  outreachConfig,
  outreachJobTargetId,
  vocab,
  workspaceProgressText,
} from "@/lib/product-config";
import { prisma } from "@/lib/prisma";
import {
  addApplicationContact,
  updateApplicationContactRole,
} from "@/lib/application/contacts";
import { saveLinkedInPaste } from "@/lib/contact-profile/service";
import { setApplicationProgress } from "@/lib/interview/stages";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

export type ApplicationOutreachActionResult = {
  jobId?: string;
  ok: boolean;
  message: string;
  assetId?: string;
  version?: number;
  contactId?: string;
  personaId?: string | null;
  violations?: string[];
  questions?: Array<{ id: string; text: string }>;
  needsPersonaBuild?: boolean;
  subject?: string | null;
  body?: string;
};

function campaignId(formData: FormData): string {
  const value = String(formData.get("campaignId") ?? "").trim();
  if (!value) throw new TenantError("Application is required.");
  return value;
}

function parseDate(value: string, fallback: Date): Date {
  const raw = value.trim();
  if (!raw) return fallback;
  const parsed = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new TenantError("Date is invalid.");
  }
  return parsed;
}

function revalidate(campaign: string) {
  revalidatePath(`/campaigns/${campaign}`);
  revalidatePath(`/campaigns/${campaign}`, "layout");
  revalidatePath(`/campaigns/${campaign}/summary`);
  revalidatePath(`/campaigns/${campaign}/contacts`);
  revalidatePath(`/campaigns/${campaign}/outreach`);
  revalidatePath(`/campaigns/${campaign}/hiring-team`);
  revalidatePath(`/campaigns/${campaign}/consultation`);
  revalidatePath(`/campaigns/${campaign}/interviews`);
  revalidatePath("/contacts");
  revalidatePath("/");
}

function errorResult(error: unknown): ApplicationOutreachActionResult {
  return {
    ok: false,
    message:
      error instanceof TenantError
        ? error.message
        : "The outreach action could not be completed. Retry.",
  };
}

export async function addApplicationContactAction(
  _previous: ApplicationOutreachActionResult | null,
  formData: FormData,
): Promise<ApplicationOutreachActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const personaId = String(formData.get("personaId") ?? "").trim();
    if (!personaId) {
      return { ok: false, message: `Choose ${vocab.persona.aSingular}.` };
    }
    const result = await addApplicationContact({
      organizationId,
      campaignId: id,
      userId: user.id,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      title: String(formData.get("title") ?? ""),
      email: String(formData.get("email") ?? "").trim() || null,
      linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
      personaId,
    });
    const pastedText = String(formData.get("linkedInProfileText") ?? "").trim();
    if (pastedText) {
      await saveLinkedInPaste({
        organizationId,
        campaignId: id,
        contactId: result.contactId,
        pastedText,
        personaId,
      });
    }
    revalidate(id);
    return {
      ok: true,
      message: "Contact added.",
      contactId: result.contactId,
      personaId: result.personaId,
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function updateApplicationContactRoleAction(
  _previous: ApplicationOutreachActionResult | null,
  formData: FormData,
): Promise<ApplicationOutreachActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    await updateApplicationContactRole({
      organizationId,
      campaignId: id,
      userId: user.id,
      contactId: String(formData.get("contactId") ?? "").trim(),
      personaId: String(formData.get("personaId") ?? "").trim(),
    });
    revalidate(id);
    return { ok: true, message: "Hiring Team role updated." };
  } catch (error) {
    return errorResult(error);
  }
}

export async function setApplicationProgressAction(
  _previous: ApplicationOutreachActionResult | null,
  formData: FormData,
): Promise<ApplicationOutreachActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    await setApplicationProgress({
      organizationId,
      campaignId: id,
      userId: user.id,
      progress: String(formData.get("progress") ?? "").trim(),
    });
    revalidate(id);
    return { ok: true, message: "Application status updated." };
  } catch (error) {
    return errorResult(error);
  }
}

export async function markApplicationAppliedAction(
  _previous: ApplicationOutreachActionResult | null,
  formData: FormData,
): Promise<ApplicationOutreachActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    await markApplicationApplied({
      organizationId,
      campaignId: id,
      userId: user.id,
      appliedAt: parseDate(String(formData.get("appliedAt") ?? ""), new Date()),
    });
    revalidate(id);
    return { ok: true, message: "Marked applied." };
  } catch (error) {
    return errorResult(error);
  }
}

export async function generateOutreachAssetAction(
  _previous: ApplicationOutreachActionResult | null,
  formData: FormData,
): Promise<ApplicationOutreachActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const kind = String(formData.get("kind") ?? formData.get("type") ?? "");
    let resolved;
    try {
      resolved = resolveOutreachGeneratorKind(kind);
    } catch {
      throw new TenantError("Outreach type is invalid.");
    }
    const type = resolved.type;
    const purposeRaw = String(formData.get("purpose") ?? "PROACTIVE");
    const purpose =
      resolved.purpose ??
      (purposeRaw === "FOLLOW_UP" ||
      purposeRaw === "THANK_YOU" ||
      purposeRaw === "CHECK_IN"
        ? purposeRaw
        : "PROACTIVE");
    if (purpose === "THANK_YOU" && !String(formData.get("interviewStageId") ?? "").trim()) {
      throw new TenantError(outreachConfig.labels.needInterviewStage);
    }
    const lengthRaw = String(formData.get("emailLength") ?? "MEDIUM");
    const emailLength: EmailLength =
      lengthRaw === "SHORT" || lengthRaw === "LONG" ? lengthRaw : "MEDIUM";
    const personaId = String(formData.get("personaId") ?? "").trim();
    if (personaId) {
      const persona = await prisma.persona.findFirst({
        where: { id: personaId, organizationId, campaignId: id, archivedAt: null },
      });
      if (persona && !isHiringTeamPersonaBuilt(persona)) {
        revalidate(id);
        return {
          ok: false,
          needsPersonaBuild: true,
          message: applicationSummaryConfig.sections.unbuiltPersona,
        };
      }
    }
    const contactId = String(formData.get("contactId") ?? "").trim() || null;
    const interviewStageId =
      String(formData.get("interviewStageId") ?? "").trim() || null;
    const followUpToAssetId =
      String(formData.get("followUpToAssetId") ?? "").trim() || null;
    const regenerationInstruction =
      String(formData.get("regenerationInstruction") ?? "").trim() || null;
    const skipThankYouQuestions =
      String(formData.get("skipThankYouQuestions") ?? "") === "1" ||
      (purpose === "THANK_YOU" && Boolean(regenerationInstruction));
    const thankYouAnswers = formData
      .getAll("thankYouAnswerId")
      .map((raw, index) => ({
        id: String(raw),
        answer: String(formData.getAll("thankYouAnswer")[index] ?? ""),
      }));
    const { outreachGenerateWouldSkip, outreachUnchangedSkipMessage } =
      await import("@/lib/application-assets/outreach");
    if (
      await outreachGenerateWouldSkip({
        organizationId,
        campaignId: id,
        userId: user.id,
        type,
        personaId,
        contactId,
        purpose,
        followUpToAssetId,
        interviewStageId,
        emailLength,
        regenerationInstruction,
        skipThankYouQuestions,
        thankYouAnswers,
      })
    ) {
      return { ok: true, message: outreachUnchangedSkipMessage(purpose) };
    }
    const job = await enqueueApplicationJob({
      organizationId,
      campaignId: id,
      type: "OUTREACH",
      targetId: outreachJobTargetId({
        type,
        personaId: personaId || null,
        contactId,
        purpose,
        interviewStageId,
      }),
      initiatedByUserId: user.id,
      payload: {
        userId: user.id,
        assetType: type,
        personaId,
        contactId: contactId || undefined,
        purpose,
        followUpToAssetId,
        interviewStageId,
        emailLength,
        regenerationInstruction,
        skipThankYouQuestions,
        thankYouAnswers,
      },
    });
    revalidate(id);
    return { ok: true, message: workspaceProgressText("OUTREACH"), jobId: job.id };
  } catch (error) {
    return errorResult(error);
  }
}

export async function buildOutreachPersonaThenGenerateAction(
  _previous: ApplicationOutreachActionResult | null,
  formData: FormData,
): Promise<ApplicationOutreachActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const kind = String(formData.get("kind") ?? formData.get("type") ?? "");
    let resolved;
    try {
      resolved = resolveOutreachGeneratorKind(kind);
    } catch {
      throw new TenantError("Outreach type is invalid.");
    }
    const type = resolved.type;
    const purposeRaw = String(formData.get("purpose") ?? "PROACTIVE");
    const purpose =
      resolved.purpose ??
      (purposeRaw === "FOLLOW_UP" ||
      purposeRaw === "THANK_YOU" ||
      purposeRaw === "CHECK_IN"
        ? purposeRaw
        : "PROACTIVE");
    if (purpose === "THANK_YOU" && !String(formData.get("interviewStageId") ?? "").trim()) {
      throw new TenantError(outreachConfig.labels.needInterviewStage);
    }
    const lengthRaw = String(formData.get("emailLength") ?? "MEDIUM");
    const emailLength: EmailLength =
      lengthRaw === "SHORT" || lengthRaw === "LONG" ? lengthRaw : "MEDIUM";
    const personaId = String(formData.get("personaId") ?? "").trim();
    if (!personaId) {
      throw new TenantError(`${vocab.persona.Singular} was not found.`);
    }
    const persona = await prisma.persona.findFirst({
      where: { id: personaId, organizationId, campaignId: id, archivedAt: null },
    });
    if (!persona) {
      throw new TenantError(`${vocab.persona.Singular} was not found.`);
    }
    const job = await queueHiringTeamBuild({
      organizationId,
      campaignId: id,
      personaId,
      initiatedByUserId: user.id,
      deferredOutreach: {
        userId: user.id,
        assetType: type,
        personaId,
        contactId: String(formData.get("contactId") ?? "").trim() || null,
        purpose,
        followUpToAssetId:
          String(formData.get("followUpToAssetId") ?? "").trim() || null,
        interviewStageId:
          String(formData.get("interviewStageId") ?? "").trim() || null,
        emailLength,
        regenerationInstruction:
          String(formData.get("regenerationInstruction") ?? "").trim() || null,
        skipThankYouQuestions:
          String(formData.get("skipThankYouQuestions") ?? "") === "1" ||
          (purpose === "THANK_YOU" &&
            Boolean(
              String(formData.get("regenerationInstruction") ?? "").trim(),
            )),
        thankYouAnswers: formData.getAll("thankYouAnswerId").map((raw, index) => ({
          id: String(raw),
          answer: String(formData.getAll("thankYouAnswer")[index] ?? ""),
        })),
      },
    });
    revalidate(id);
    return {
      ok: true,
      message: workspaceProgressText("HIRING_TEAM_BUILD"),
      jobId: job.id,
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function markOutreachSentAction(
  _previous: ApplicationOutreachActionResult | null,
  formData: FormData,
): Promise<ApplicationOutreachActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const assetId = String(formData.get("assetId") ?? "").trim();
    if (!assetId) throw new TenantError("Outreach message is required.");
    await markOutreachSent({
      organizationId,
      campaignId: id,
      userId: user.id,
      assetId,
      sentAt: parseDate(String(formData.get("sentAt") ?? ""), new Date()),
    });
    revalidate(id);
    return { ok: true, message: "Marked sent.", assetId };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveOutreachMessageEditAction(
  _previous: ApplicationOutreachActionResult | null,
  formData: FormData,
): Promise<ApplicationOutreachActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const assetId = String(formData.get("assetId") ?? "").trim();
    if (!assetId) throw new TenantError("Outreach message is required.");
    const saved = await saveOutreachMessageEdit({
      organizationId,
      campaignId: id,
      userId: user.id,
      assetId,
      subject: formData.has("subject")
        ? String(formData.get("subject") ?? "")
        : null,
      body: String(formData.get("body") ?? ""),
    });
    revalidate(id);
    return {
      ok: true,
      message: "Message saved.",
      assetId,
      subject: saved.subject,
      body: saved.body,
    };
  } catch (error) {
    return errorResult(error);
  }
}

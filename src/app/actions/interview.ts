"use server";

import { revalidatePath } from "next/cache";
import { startConsultation } from "@/lib/consultation/service";
import { requireCurrentUser } from "@/lib/auth/authz";
import {
  requestInterviewGuide,
} from "@/lib/interview/guide";
import { refreshConsultationOffer } from "@/lib/interview/guide";
import {
  addInterviewStageInterviewer,
  createInterviewStage,
  updateInterviewStage,
} from "@/lib/interview/stages";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

export type InterviewActionResult = {
  ok: boolean;
  message: string;
  questions?: Array<{ id: string; text: string }>;
  violations?: string[];
};

function campaignId(formData: FormData): string {
  const value = String(formData.get("campaignId") ?? "").trim();
  if (!value) throw new TenantError("Application is required.");
  return value;
}

function parseDateTime(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TenantError("Date is invalid.");
  }
  return parsed;
}

function parseOptionalDate(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;
  return parseDateTime(raw);
}

function revalidate(campaign: string, stageId?: string) {
  revalidatePath(`/campaigns/${campaign}`);
  revalidatePath(`/campaigns/${campaign}/summary`);
  if (stageId) revalidatePath(`/campaigns/${campaign}/interviews/${stageId}`);
  revalidatePath("/");
}

function errorResult(error: unknown): InterviewActionResult {
  return {
    ok: false,
    message:
      error instanceof TenantError
        ? error.message
        : "The interview action could not be completed. Retry.",
  };
}

export async function createInterviewStageAction(
  _previous: InterviewActionResult | null,
  formData: FormData,
): Promise<InterviewActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    await createInterviewStage({
      organizationId,
      campaignId: id,
      userId: user.id,
      type: String(formData.get("type") ?? ""),
      scheduledAt: parseDateTime(String(formData.get("scheduledAt") ?? "")),
      format: String(formData.get("format") ?? ""),
      notesBefore: String(formData.get("notesBefore") ?? ""),
      expectedDecisionAt: parseOptionalDate(
        String(formData.get("expectedDecisionAt") ?? ""),
      ),
    });
    revalidate(id);
    return { ok: true, message: "Interview stage added." };
  } catch (error) {
    return errorResult(error);
  }
}

export async function updateInterviewStageAction(
  _previous: InterviewActionResult | null,
  formData: FormData,
): Promise<InterviewActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const stageId = String(formData.get("stageId") ?? "").trim();
    if (!stageId) throw new TenantError("Interview stage is required.");
    await updateInterviewStage({
      organizationId,
      campaignId: id,
      userId: user.id,
      stageId,
      scheduledAt: formData.get("scheduledAt")
        ? parseDateTime(String(formData.get("scheduledAt")))
        : undefined,
      format: String(formData.get("format") ?? "").trim() || undefined,
      notesBefore: formData.has("notesBefore")
        ? String(formData.get("notesBefore") ?? "")
        : undefined,
      notesAfter: formData.has("notesAfter")
        ? String(formData.get("notesAfter") ?? "")
        : undefined,
      expectedDecisionAt: formData.has("expectedDecisionAt")
        ? parseOptionalDate(String(formData.get("expectedDecisionAt") ?? ""))
        : undefined,
      outcome: formData.has("outcome")
        ? String(formData.get("outcome") ?? "").trim() || null
        : undefined,
    });
    if (formData.has("notesAfter")) {
      await refreshConsultationOffer({
        organizationId,
        campaignId: id,
        stageId,
      });
    }
    revalidate(id, stageId);
    return { ok: true, message: "Interview stage updated." };
  } catch (error) {
    return errorResult(error);
  }
}

export async function addInterviewInterviewerAction(
  _previous: InterviewActionResult | null,
  formData: FormData,
): Promise<InterviewActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const stageId = String(formData.get("stageId") ?? "").trim();
    if (!stageId) throw new TenantError("Interview stage is required.");
    await addInterviewStageInterviewer({
      organizationId,
      campaignId: id,
      userId: user.id,
      stageId,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      title: String(formData.get("title") ?? ""),
      email: String(formData.get("email") ?? "").trim() || null,
      linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
      personaId: String(formData.get("personaId") ?? "").trim() || null,
    });
    revalidate(id, stageId);
    return { ok: true, message: "Interviewer added." };
  } catch (error) {
    return errorResult(error);
  }
}

export async function generateInterviewGuideAction(
  _previous: InterviewActionResult | null,
  formData: FormData,
): Promise<InterviewActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const stageId = String(formData.get("stageId") ?? "").trim();
    if (!stageId) throw new TenantError("Interview stage is required.");
    const skip = String(formData.get("skipQuestions") ?? "") === "1";
    const answers = formData.getAll("answerId").map((raw, index) => ({
      id: String(raw),
      answer: String(formData.getAll("answer")[index] ?? ""),
    }));
    const result = await requestInterviewGuide({
      organizationId,
      campaignId: id,
      userId: user.id,
      stageId,
      skipQuestions: skip,
      answers: answers.filter((row) => row.answer.trim()),
      regenerationInstruction:
        String(formData.get("regenerationInstruction") ?? "").trim() || null,
    });
    revalidate(id, stageId);
    if (result.status === "NEEDS_CLARIFICATION") {
      return {
        ok: true,
        message: "Answer or skip these questions, then generate the guide.",
        questions: result.questions,
      };
    }
    if (result.status === "FAILED") {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: "Guide generated." };
  } catch (error) {
    return errorResult(error);
  }
}

export async function startInterviewGapConsultationAction(
  _previous: InterviewActionResult | null,
  formData: FormData,
): Promise<InterviewActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    await startConsultation({
      organizationId,
      campaignId: id,
      focusNote: String(formData.get("focusNote") ?? "").trim() || null,
    });
    revalidate(id);
    return { ok: true, message: "Consultation started for this gap." };
  } catch (error) {
    return errorResult(error);
  }
}

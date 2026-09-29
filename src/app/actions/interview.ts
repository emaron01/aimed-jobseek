"use server";

import { revalidatePath } from "next/cache";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { startConsultation } from "@/lib/consultation/service";
import { requireCurrentUser } from "@/lib/auth/authz";
import { addCheatSheetInterviewNote } from "@/lib/application-summary/service";
import {
  addInterviewContact,
  addInterviewStageInterviewer,
  assignExistingInterviewStageInterviewer,
  createInterviewStage,
  startPersonPrepForContact,
  updateInterviewStage,
} from "@/lib/interview/stages";
import { workspaceProgressText } from "@/lib/product-config";
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
  revalidatePath(`/campaigns/${campaign}/consultation`);
  revalidatePath(`/campaigns/${campaign}/summary`);
  revalidatePath(`/campaigns/${campaign}/interviews`);
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
    const updated = await updateInterviewStage({
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
    if (updated.notesTextChanged) {
      const { enqueueLearningsReassessIfChanged } = await import(
        "@/lib/consultation/learnings"
      );
      await enqueueLearningsReassessIfChanged({
        organizationId,
        campaignId: id,
        userId: user.id,
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
      linkedInProfileText: String(formData.get("linkedInProfileText") ?? ""),
      personaId: String(formData.get("personaId") ?? "").trim() || null,
    });
    revalidate(id, stageId);
    return { ok: true, message: "Interviewer added." };
  } catch (error) {
    return errorResult(error);
  }
}

/** Harper: add a person expected to interview before any stage is scheduled. */
export async function addInterviewContactAction(
  _previous: InterviewActionResult | null,
  formData: FormData,
): Promise<InterviewActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    await addInterviewContact({
      organizationId,
      campaignId: id,
      userId: user.id,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      title: String(formData.get("title") ?? ""),
      email: String(formData.get("email") ?? "").trim() || null,
      linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
      linkedInProfileText: String(formData.get("linkedInProfileText") ?? ""),
      personaId: String(formData.get("personaId") ?? "").trim() || null,
    });
    revalidate(id);
    return { ok: true, message: "Interview contact added." };
  } catch (error) {
    return errorResult(error);
  }
}

/** Harper: start interviewer prep for an existing contact (existing paid paths). */
export async function startPersonPrepAction(
  _previous: InterviewActionResult | null,
  formData: FormData,
): Promise<InterviewActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const contactId = String(formData.get("contactId") ?? "").trim();
    if (!contactId) throw new TenantError("Choose a person first.");
    await startPersonPrepForContact({
      organizationId,
      campaignId: id,
      userId: user.id,
      contactId,
      personaId: String(formData.get("personaId") ?? "").trim() || null,
    });
    revalidate(id);
    return { ok: true, message: "Interviewer prep started." };
  } catch (error) {
    return errorResult(error);
  }
}

export async function assignExistingInterviewerAction(
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
    const contactId = String(formData.get("contactId") ?? "").trim();
    if (!stageId) throw new TenantError("Interview stage is required.");
    if (!contactId) throw new TenantError("Choose an interviewer.");
    await assignExistingInterviewStageInterviewer({
      organizationId,
      campaignId: id,
      userId: user.id,
      stageId,
      contactId,
      personaId: String(formData.get("personaId") ?? "").trim() || null,
    });
    revalidate(id, stageId);
    return { ok: true, message: "Interviewer saved." };
  } catch (error) {
    return errorResult(error);
  }
}

export async function addCheatSheetInterviewNoteAction(
  _previous: InterviewActionResult | null,
  formData: FormData,
): Promise<InterviewActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const contactId = String(formData.get("contactId") ?? "").trim();
    const stageId = String(formData.get("stageId") ?? "").trim();
    if (!contactId) throw new TenantError("Choose an interviewer first.");
    await addCheatSheetInterviewNote({
      organizationId,
      campaignId: id,
      userId: user.id,
      contactId,
      stageId: stageId || null,
      text: String(formData.get("note") ?? ""),
    });
    revalidate(id, stageId || undefined);
    return { ok: true, message: "Saved to the cheat sheet." };
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
    await enqueueApplicationJob({
      organizationId,
      campaignId: id,
      type: "INTERVIEW_GUIDE",
      targetId: stageId,
      initiatedByUserId: user.id,
      payload: {
        userId: user.id,
        stageId,
        skipQuestions: skip,
        answers: answers.filter((row) => row.answer.trim()),
        regenerationInstruction:
          String(formData.get("regenerationInstruction") ?? "").trim() || null,
      },
    });
    revalidate(id, stageId);
    return { ok: true, message: workspaceProgressText("INTERVIEW_GUIDE") };
  } catch (error) {
    return errorResult(error);
  }
}

export async function startInterviewGapConsultationAction(
  _previous: InterviewActionResult | null,
  formData: FormData,
): Promise<InterviewActionResult> {
  try {
    const [, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    await startConsultation({
      organizationId,
      campaignId: id,
      focusNote: String(formData.get("focusNote") ?? "").trim() || null,
      focusTargetKey: String(formData.get("focusTargetKey") ?? "").trim() || null,
    });
    revalidate(id);
    return { ok: true, message: "Consultation started for this gap." };
  } catch (error) {
    return errorResult(error);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import {
  addApplicationHiringTeamRole,
  addTemplateToApplication,
  approveApplicationHiringTeamRole,
  queueHiringTeamBuild,
  queueHiringTeamBuildDirect,
  removeApplicationHiringTeamRole,
  savePersonaAsTemplate,
  updateApplicationHiringTeamRole,
  moveApplicationHiringTeamRoleInvolvement,
} from "@/lib/hiring-team/build";
import { retryApplicationJob } from "@/lib/application-jobs/service";
import { addApplicationContact } from "@/lib/application/contacts";
import {
  queueIndividualProfileBuild,
  saveLinkedInPaste,
} from "@/lib/contact-profile/service";
import { hiringTeamConfig, workspaceProgressText } from "@/lib/product-config";
import {
  createPersonaTemplate,
  deletePersonaTemplate,
  updatePersonaTemplate,
} from "@/lib/hiring-team/templates";
import { requireCurrentUser } from "@/lib/auth/session";
import { vocab } from "@/lib/product-config";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";

export type HiringTeamActionResult = { ok: boolean; message: string };

function fail(error: unknown, fallback: string): HiringTeamActionResult {
  if (error instanceof TenantError) return { ok: false, message: error.message };
  console.error(
    JSON.stringify({
      event: "hiring_team_action_failed",
      message: error instanceof Error ? error.message : "unknown",
    }),
  );
  return { ok: false, message: fallback };
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function optional(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function savePersonaTemplateAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const templateId = String(formData.get("templateId") ?? "").trim();
    const fields = {
      organizationId,
      name: String(formData.get("name") ?? ""),
      likelyTitles: lines(formData.get("likelyTitles")),
      department: optional(formData.get("department")),
      whyThisRoleMatters: optional(formData.get("whyThisRoleMatters")),
      notes: optional(formData.get("notes")),
    };
    if (templateId) {
      await updatePersonaTemplate({ ...fields, templateId });
    } else {
      await createPersonaTemplate(fields);
    }
    revalidatePath("/settings/hiring-team");
    return { ok: true, message: "Template saved." };
  } catch (error) {
    return fail(error, "The template could not be saved.");
  }
}

export async function deletePersonaTemplateAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const templateId = String(formData.get("templateId") ?? "").trim();
    if (!templateId) return { ok: false, message: "That template was not found." };
    await deletePersonaTemplate({ organizationId, templateId });
    revalidatePath("/settings/hiring-team");
    return { ok: true, message: "Template deleted." };
  } catch (error) {
    return fail(error, "The template could not be deleted.");
  }
}

export async function addApplicationRoleAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await addApplicationHiringTeamRole({
      organizationId,
      campaignId,
      name: String(formData.get("name") ?? ""),
      likelyTitles: lines(formData.get("likelyTitles")),
      department: optional(formData.get("department")),
      whyThisRoleMatters: optional(formData.get("whyThisRoleMatters")),
      notes: optional(formData.get("notes")),
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: `${vocab.persona.Singular} added.` };
  } catch (error) {
    return fail(error, `The ${vocab.persona.singular} could not be added.`);
  }
}

export async function updateApplicationRoleAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const personaId = String(formData.get("personaId") ?? "").trim();
    if (!campaignId || !personaId) {
      return { ok: false, message: `${vocab.persona.Singular} was not found.` };
    }
    await updateApplicationHiringTeamRole({
      organizationId,
      campaignId,
      personaId,
      name: String(formData.get("name") ?? ""),
      likelyTitles: lines(formData.get("likelyTitles")),
      department: optional(formData.get("department")),
      whyThisRoleMatters: optional(formData.get("whyThisRoleMatters")),
      notes: optional(formData.get("notes")),
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: `${vocab.persona.Singular} updated.` };
  } catch (error) {
    return fail(error, `The ${vocab.persona.singular} could not be updated.`);
  }
}

export async function moveApplicationRoleInvolvementAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const personaId = String(formData.get("personaId") ?? "").trim();
    const involvement = String(formData.get("involvement") ?? "").trim();
    if (!campaignId || !personaId) {
      return { ok: false, message: `${vocab.persona.Singular} was not found.` };
    }
    if (involvement !== "DIRECT" && involvement !== "INDIRECT") {
      return { ok: false, message: "Choose Direct or Indirect." };
    }
    await moveApplicationHiringTeamRoleInvolvement({
      organizationId,
      campaignId,
      personaId,
      involvement,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/hiring-team`);
    return { ok: true, message: `${vocab.persona.Singular} moved.` };
  } catch (error) {
    return fail(error, `The ${vocab.persona.singular} could not be moved.`);
  }
}

export async function approveApplicationRoleAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const personaId = String(formData.get("personaId") ?? "").trim();
    if (!campaignId || !personaId) {
      return { ok: false, message: `${vocab.persona.Singular} was not found.` };
    }
    await approveApplicationHiringTeamRole({ organizationId, campaignId, personaId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: `${vocab.persona.Singular} approved.` };
  } catch (error) {
    return fail(error, `The ${vocab.persona.singular} could not be approved.`);
  }
}

export async function rebuildApplicationRoleAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const personaId = String(formData.get("personaId") ?? "").trim();
    if (!campaignId || !personaId) {
      return { ok: false, message: `${vocab.persona.Singular} was not found.` };
    }
    await queueHiringTeamBuild({ organizationId, campaignId, personaId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: hiringTeamConfig.queuedBuild };
  } catch (error) {
    return fail(error, `The ${vocab.persona.singular} could not be rebuilt.`);
  }
}

export async function addTemplateRoleAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const templateId = String(formData.get("templateId") ?? "").trim();
    if (!campaignId || !templateId) {
      return { ok: false, message: "Choose a saved template." };
    }
    await addTemplateToApplication({ organizationId, campaignId, templateId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: `${vocab.persona.Singular} added from the template.` };
  } catch (error) {
    return fail(error, `The ${vocab.persona.singular} could not be added.`);
  }
}

export async function removeApplicationRoleAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const personaId = String(formData.get("personaId") ?? "").trim();
    if (!campaignId || !personaId) {
      return { ok: false, message: `${vocab.persona.Singular} was not found.` };
    }
    await removeApplicationHiringTeamRole({ organizationId, campaignId, personaId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: `${vocab.persona.Singular} removed.` };
  } catch (error) {
    return fail(error, `The ${vocab.persona.singular} could not be removed.`);
  }
}

export async function buildApplicationRoleAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const personaId = String(formData.get("personaId") ?? "").trim();
    if (!campaignId || !personaId) {
      return { ok: false, message: `${vocab.persona.Singular} was not found.` };
    }
    await queueHiringTeamBuild({ organizationId, campaignId, personaId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: hiringTeamConfig.queuedBuild };
  } catch (error) {
    return fail(error, `The ${vocab.persona.singular} could not be started.`);
  }
}

export async function buildAllDirectRolesAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    if (!campaignId) {
      return { ok: false, message: `${vocab.campaign.Singular} was not found.` };
    }
    await queueHiringTeamBuildDirect({ organizationId, campaignId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: hiringTeamConfig.queuedBuildAllDirect };
  } catch (error) {
    return fail(error, "Direct role builds could not be started.");
  }
}

export async function retryApplicationJobAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const jobId = String(formData.get("jobId") ?? "").trim();
    if (!campaignId || !jobId) {
      return { ok: false, message: "That job was not found." };
    }
    await retryApplicationJob({ organizationId, campaignId, jobId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: hiringTeamConfig.actions.retry };
  } catch (error) {
    return fail(error, "The job could not be retried.");
  }
}

export async function addHiringTeamPersonAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    const user = await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const personaId = String(formData.get("personaId") ?? "").trim();
    if (!campaignId || !personaId) {
      return { ok: false, message: `${vocab.persona.Singular} was not found.` };
    }
    const added = await addApplicationContact({
      organizationId,
      campaignId,
      userId: user.id,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      title: String(formData.get("title") ?? ""),
      email: String(formData.get("email") ?? "").trim() || null,
      linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
      personaId,
      confirmRole: true,
    });
    const pastedText = String(formData.get("linkedInProfileText") ?? "").trim();
    if (pastedText) {
      await saveLinkedInPaste({
        organizationId,
        campaignId,
        contactId: added.contactId,
        pastedText,
        personaId,
      });
    }
    await queueIndividualProfileBuild({
      organizationId,
      campaignId,
      contactId: added.contactId,
    });
    const { offerPersonPrep } = await import("@/lib/interview/person-prep");
    await offerPersonPrep({
      organizationId,
      campaignId,
      contactId: added.contactId,
      personaId,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      ok: true,
      message: workspaceProgressText("CONTACT_PROFILE"),
    };
  } catch (error) {
    return fail(error, `${vocab.contact.Singular} could not be added.`);
  }
}

export async function saveRoleAsTemplateAction(
  _prev: HiringTeamActionResult | null,
  formData: FormData,
): Promise<HiringTeamActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const personaId = String(formData.get("personaId") ?? "").trim();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    if (!personaId) {
      return { ok: false, message: `${vocab.persona.Singular} was not found.` };
    }
    await savePersonaAsTemplate({ organizationId, personaId });
    revalidatePath("/settings/hiring-team");
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: "Saved as a template." };
  } catch (error) {
    return fail(error, "The template could not be saved.");
  }
}

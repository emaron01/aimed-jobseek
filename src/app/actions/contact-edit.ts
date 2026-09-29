"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { updateApplicationContact } from "@/lib/application/contacts";
import {
  workspaceApplicationContactsHref,
  workspaceContactEditHref,
} from "@/lib/application/workspace-links";
import { vocab, workspaceProgressText, unchangedContactProfileMessage } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

export type ContactEditActionResult = {
  ok: boolean;
  message: string;
};

function revalidateContact(contactId: string, campaignId: string | null) {
  revalidatePath("/contacts");
  revalidatePath(workspaceContactEditHref(contactId, campaignId));
  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/outreach`);
    revalidatePath(`/campaigns/${campaignId}/hiring-team`);
    revalidatePath(`/campaigns/${campaignId}/interviews`);
    revalidatePath(`/campaigns/${campaignId}/summary`);
    revalidatePath(workspaceApplicationContactsHref(campaignId));
  }
}

export async function updateApplicationContactAction(
  _previous: ContactEditActionResult | null,
  formData: FormData,
): Promise<ContactEditActionResult> {
  const contactId = String(formData.get("contactId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim() || null;
  if (!contactId) {
    return { ok: false, message: `${vocab.contact.Singular} was not found.` };
  }
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const result = await updateApplicationContact({
      organizationId,
      userId: user.id,
      contactId,
      campaignId,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      title: String(formData.get("title") ?? ""),
      email: String(formData.get("email") ?? "").trim() || null,
      linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
      personaId: String(formData.get("personaId") ?? "").trim() || null,
      pastedText: String(formData.get("linkedInProfileText") ?? ""),
    });
    revalidateContact(result.contactId, campaignId);
    return {
      ok: true,
      message: result.pasteQueued
        ? workspaceProgressText("CONTACT_PROFILE")
        : result.pasteUnchanged
          ? unchangedContactProfileMessage(result.pasteDisplayName)
          : "Saved.",
    };
  } catch (error) {
    if (error instanceof TenantError) {
      return { ok: false, message: error.message };
    }
    console.error(
      JSON.stringify({
        event: "contact_edit_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return {
      ok: false,
      message: `${vocab.contact.Singular} could not be saved.`,
    };
  }
}

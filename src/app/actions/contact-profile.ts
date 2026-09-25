"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  queueIndividualProfileBuild,
  saveLinkedInPaste,
} from "@/lib/contact-profile/service";
import { outreachConfig, vocab } from "@/lib/product-config";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";

export type ContactProfileActionResult = { ok: boolean; message: string };

function fail(error: unknown, fallback: string): ContactProfileActionResult {
  if (error instanceof TenantError) return { ok: false, message: error.message };
  console.error(
    JSON.stringify({
      event: "contact_profile_action_failed",
      message: error instanceof Error ? error.message : "unknown",
    }),
  );
  return { ok: false, message: fallback };
}

export async function saveLinkedInPasteAction(
  _prev: ContactProfileActionResult | null,
  formData: FormData,
): Promise<ContactProfileActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const contactId = String(formData.get("contactId") ?? "").trim();
    if (!campaignId || !contactId) {
      return { ok: false, message: `${vocab.contact.Singular} was not found.` };
    }
    await saveLinkedInPaste({
      organizationId,
      campaignId,
      contactId,
      pastedText: String(formData.get("linkedInProfileText") ?? ""),
      personaId: String(formData.get("personaId") ?? "").trim() || null,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: outreachConfig.labels.saveLinkedIn };
  } catch (error) {
    return fail(error, "The LinkedIn profile could not be saved.");
  }
}

export async function buildIndividualProfileAction(
  _prev: ContactProfileActionResult | null,
  formData: FormData,
): Promise<ContactProfileActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const campaignId = String(formData.get("campaignId") ?? "").trim();
    const contactId = String(formData.get("contactId") ?? "").trim();
    if (!campaignId || !contactId) {
      return { ok: false, message: `${vocab.contact.Singular} was not found.` };
    }
    await queueIndividualProfileBuild({ organizationId, campaignId, contactId });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: outreachConfig.labels.buildIndividual };
  } catch (error) {
    return fail(error, "The individual profile could not be started.");
  }
}

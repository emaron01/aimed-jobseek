"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgAdmin } from "@/lib/org/authz";
import { requireCurrentUser, requireVerifiedForAiSpend } from "@/lib/auth/authz";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";
import {
  cumulativeDisplayToPolicyGaps,
  policyToCumulativeDisplay,
  validateCumulativeCadenceInput,
} from "@/lib/cadence/display";
import { ensureOrganizationCadencePolicy } from "@/lib/cadence/defaults";
import { recomputeCampaignContactCadenceBatch } from "@/lib/cadence/recompute";
import {
  restoreSequenceForContact,
  stopSequenceForContact,
} from "@/lib/cadence/stop-sequence";
import {
  addFollowUpEmailAction,
  generateEmailDraftAction,
} from "@/app/actions/email";
import { getDueContactsForUser } from "@/lib/cadence/dashboard";
import { vocab } from "@/lib/product-config";

export type CadenceActionResult = { ok: boolean; message: string };

function toSafeCadenceError(error: unknown): string {
  if (error instanceof TenantError) return error.message;
  if (error instanceof Error && error.message.length <= 240) {
    return error.message;
  }
  return "Unable to update cadence settings. Please try again.";
}

function parseCumulativeForm(formData: FormData) {
  return {
    email2Day: Number(formData.get("email2Day")),
    email3Day: Number(formData.get("email3Day")),
    email4Day: Number(formData.get("email4Day")),
    repeatEveryDays: Number(formData.get("repeatEveryDays")),
  };
}

function parseMaxSequence(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "unlimited") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new TenantError(`Max ${vocab.sequence.singular} emails must be a positive integer or unlimited.`);
  }
  return n;
}

export async function updateOrganizationCadencePolicyAction(
  _prev: CadenceActionResult | null,
  formData: FormData,
): Promise<CadenceActionResult> {
  try {
    const { organization } = await requireOrgAdmin();
    const cumulative = parseCumulativeForm(formData);
    const validation = validateCumulativeCadenceInput(cumulative);
    if (validation) return { ok: false, message: validation };
    const gaps = cumulativeDisplayToPolicyGaps(cumulative);
    const maxSequenceEmails = parseMaxSequence(formData.get("maxSequenceEmails"));

    await prisma.organizationCadencePolicy.upsert({
      where: { organizationId: organization.id },
      update: {
        ...gaps,
        maxSequenceEmails,
      },
      create: {
        organizationId: organization.id,
        ...gaps,
        maxSequenceEmails,
      },
    });

    const contacts = await prisma.campaignContact.findMany({
      where: { organizationId: organization.id },
      select: { id: true },
    });
    await recomputeCampaignContactCadenceBatch(contacts.map((row) => row.id));

    revalidatePath("/settings/cadence");
    revalidatePath("/");
    return { ok: true, message: "Cadence policy saved." };
  } catch (error) {
    return { ok: false, message: toSafeCadenceError(error) };
  }
}

export async function updateUserDigestPreferencesAction(
  _prev: CadenceActionResult | null,
  formData: FormData,
): Promise<CadenceActionResult> {
  try {
    const user = await requireCurrentUser();
    const digestEnabled = formData.get("digestEnabled") === "on";
    const digestSendTimeLocal = String(
      formData.get("digestSendTimeLocal") ?? "08:00",
    ).trim();
    const timezoneRaw = String(formData.get("timezone") ?? "").trim();
    if (!/^\d{1,2}:\d{2}$/.test(digestSendTimeLocal)) {
      return { ok: false, message: "Digest send time must be HH:mm." };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        digestEnabled,
        digestSendTimeLocal,
        timezone: timezoneRaw || null,
      },
    });

    revalidatePath("/settings/account");
    return { ok: true, message: "Digest preferences saved." };
  } catch (error) {
    return { ok: false, message: toSafeCadenceError(error) };
  }
}

export async function stopSequenceAction(
  campaignContactId: string,
): Promise<CadenceActionResult> {
  try {
    const user = await requireCurrentUser();
    const organization = await requireOrganization();
    const { assertCanManageContactCadence } = await import(
      "@/lib/cadence/cadence-authz"
    );
    await assertCanManageContactCadence({
      campaignContactId,
      organizationId: organization.id,
      userId: user.id,
    });
    await stopSequenceForContact({
      campaignContactId,
      organizationId: organization.id,
      reason: "MANUAL_STOP",
      actorUserId: user.id,
    });
    revalidatePath("/");
    return { ok: true, message: `Follow-up ${vocab.sequence.singular} stopped for this ${vocab.contact.singular}.` };
  } catch (error) {
    return { ok: false, message: toSafeCadenceError(error) };
  }
}

export async function restoreSequenceAction(
  campaignContactId: string,
): Promise<CadenceActionResult> {
  try {
    const user = await requireCurrentUser();
    const organization = await requireOrganization();
    const { assertCanManageContactCadence } = await import(
      "@/lib/cadence/cadence-authz"
    );
    await assertCanManageContactCadence({
      campaignContactId,
      organizationId: organization.id,
      userId: user.id,
    });
    await restoreSequenceForContact({
      campaignContactId,
      organizationId: organization.id,
    });
    revalidatePath("/");
    return { ok: true, message: `Follow-up ${vocab.sequence.singular} restored for this ${vocab.contact.singular}.` };
  } catch (error) {
    return { ok: false, message: toSafeCadenceError(error) };
  }
}

export async function bulkGenerateDueForCampaignAction(
  campaignId: string,
): Promise<CadenceActionResult & { generated?: number; skipped?: number }> {
  try {
    const user = await requireVerifiedForAiSpend();
    const organization = await requireOrganization();

    const dueByCampaign = await getDueContactsForUser({
      organizationId: organization.id,
      userId: user.id,
    });
    const campaign = dueByCampaign.find((row) => row.campaignId === campaignId);
    if (!campaign) {
      return { ok: false, message: `No due ${vocab.contact.plural} found for this ${vocab.campaign.singular}.` };
    }

    let generated = 0;
    let skipped = 0;
    for (const contact of campaign.dueContacts) {
      if (contact.hasDraft) {
        skipped += 1;
        continue;
      }
      const result =
        contact.sentCount === 0
          ? await generateEmailDraftAction(contact.campaignContactId)
          : await addFollowUpEmailAction(contact.campaignContactId);
      if (result.ok) generated += 1;
      else skipped += 1;
    }

    revalidatePath("/");
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      ok: true,
      message: `Generated ${generated} draft${generated === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}.`,
      generated,
      skipped,
    };
  } catch (error) {
    return { ok: false, message: toSafeCadenceError(error) };
  }
}

export async function loadCadencePolicyForSettings(organizationId: string) {
  const policy = await ensureOrganizationCadencePolicy(organizationId);
  return {
    policy,
    display: policyToCumulativeDisplay(policy),
  };
}

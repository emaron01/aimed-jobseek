"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";
import { toSafeCrudDeleteError, type CrudDeleteResult } from "@/lib/tenant/crud-delete";
import {
  releaseContactById,
  suppressContactById,
} from "@/lib/suppression/service";
import { vocab } from "@/lib/product-config";

function logActionError(fallback: string, error: unknown): void {
  if (error instanceof TenantError) {
    console.error(fallback, error.message);
    return;
  }
  console.error(fallback, error);
}

/**
 * Surfaces that bake `suppressed` from listActiveNormalizedEmails into RSC props.
 * Layout revalidation covers dynamic children; explicit ids cover router cache gaps.
 */
async function revalidateContactSurfaces(input: {
  organizationId: string;
  contactId: string;
}): Promise<void> {
  revalidatePath("/lists", "layout");
  revalidatePath("/contacts", "layout");
  revalidatePath("/campaigns", "layout");
  revalidatePath("/scoring", "layout");
  revalidatePath("/");

  const [campaignContacts, memberships] = await Promise.all([
    prisma.campaignContact.findMany({
      where: {
        organizationId: input.organizationId,
        contactId: input.contactId,
      },
      select: { campaignId: true },
      distinct: ["campaignId"],
    }),
    prisma.contactListMembership.findMany({
      where: {
        organizationId: input.organizationId,
        contactId: input.contactId,
      },
      select: { contactListId: true },
      distinct: ["contactListId"],
    }),
  ]);

  for (const row of campaignContacts) {
    revalidatePath(`/campaigns/${row.campaignId}`);
  }
  for (const row of memberships) {
    revalidatePath(`/lists/${row.contactListId}`);
  }
}

export async function suppressContactAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const contactId = String(formData.get("contactId") ?? "").trim();
    if (!contactId) throw new TenantError(`${vocab.contact.Singular} id is required.`);
    if (String(formData.get("confirm") ?? "") !== "1") {
      return { ok: false, message: "Confirm opt-out before continuing." };
    }
    await suppressContactById({
      organizationId,
      contactId,
      actorUserId: user.id,
      reason: "OPTED_OUT",
    });
    await revalidateContactSurfaces({ organizationId, contactId });
    return {
      ok: true,
      message:
        `${vocab.contact.Singular} opted out for this organization. They will not be emailed until restored.`,
    };
  } catch (error) {
    logActionError("Failed to opt out contact.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

export async function releaseContactAction(
  _prev: CrudDeleteResult | null,
  formData: FormData,
): Promise<CrudDeleteResult> {
  try {
    const user = await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const contactId = String(formData.get("contactId") ?? "").trim();
    if (!contactId) throw new TenantError(`${vocab.contact.Singular} id is required.`);
    if (String(formData.get("confirm") ?? "") !== "1") {
      return { ok: false, message: "Confirm restore before continuing." };
    }
    await releaseContactById({
      organizationId,
      contactId,
      actorUserId: user.id,
    });
    await revalidateContactSurfaces({ organizationId, contactId });
    return {
      ok: true,
      message: `${vocab.contact.Singular} restored. They can be scored and emailed again.`,
    };
  } catch (error) {
    logActionError("Failed to restore contact.", error);
    return { ok: false, message: toSafeCrudDeleteError(error) };
  }
}

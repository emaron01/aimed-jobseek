"use server";

import { revalidatePath } from "next/cache";
import {
  AuthorizationError,
  requirePlatformSuperAdmin,
} from "@/lib/auth/authz";
import {
  grantOrganizationCredit,
  grantCompanyResearchCreditsAsPlatform,
  suspendOrganization,
  unsuspendOrganization,
  deleteOrganization,
  convertOrganizationToComped,
  updateOrganizationUsagePolicyAsPlatform,
  updateOrganizationResearchPolicyAsPlatform,
  createPlatformOrganization,
} from "@/lib/platform/orgs";
import { CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE } from "@/lib/platform/purge-contact-outbound-shared";
import { purgeOrganizationContactOutboundData } from "@/lib/platform/purge-contact-outbound";
import {
  changeOrganizationMemberRole,
  createOrganizationInvitationAsPlatform,
  removeOrganizationMember,
  revokeOrganizationInvitationAsPlatform,
} from "@/lib/org/signup";
import { redirect } from "next/navigation";
import { vocab } from "@/lib/product-config";

export type PlatformOrgActionResult = { ok: boolean; message: string };

function toSafeError(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      lower.includes("prisma") ||
      error.message.includes("\n") ||
      error.message.length > 240
    ) {
      return "Unable to complete platform action. Please try again.";
    }
    return error.message;
  }
  return "Unable to complete platform action. Please try again.";
}

function asPositiveInt(value: FormDataEntryValue | null, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return n;
}

function requireOrgId(formData: FormData): string {
  const id = String(formData.get("organizationId") || "").trim();
  if (!id) throw new Error("Organization id is required.");
  return id;
}

export async function suspendOrganizationAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const reason = String(formData.get("reason") || "").trim();
    await suspendOrganization({
      organizationId,
      actorUserId: user.id,
      reason,
    });
    revalidatePath("/platform/orgs");
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Organization suspended." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function unsuspendOrganizationAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    await unsuspendOrganization({
      organizationId,
      actorUserId: user.id,
    });
    revalidatePath("/platform/orgs");
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Organization unsuspended." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

const DELETE_ORG_CONFIRM_PHRASE = "Delete";
const CONVERT_TO_COMPED_CONFIRM_PHRASE = "COMPED";

export async function convertOrganizationToCompedAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const confirmation = String(formData.get("confirmation") || "");
    if (confirmation !== CONVERT_TO_COMPED_CONFIRM_PHRASE) {
      return {
        ok: false,
        message: `Type "${CONVERT_TO_COMPED_CONFIRM_PHRASE}" exactly to confirm.`,
      };
    }
    const monthlyRaw = String(formData.get("monthlyEmailSendLimit") || "").trim();
    const monthlyEmailSendLimit =
      monthlyRaw === ""
        ? null
        : asPositiveInt(formData.get("monthlyEmailSendLimit"), "Monthly email send limit");

    const result = await convertOrganizationToComped({
      organizationId,
      actorUserId: user.id,
      activeResearchedCompanyLimit: asPositiveInt(
        formData.get("activeResearchedCompanyLimit"),
        "Active researched company limit",
      ),
      dailyEmailSendWarningLimit: asPositiveInt(
        formData.get("dailyEmailSendWarningLimit"),
        "Daily send advisory",
      ),
      monthlyEmailSendLimit,
    });
    revalidatePath("/platform/orgs");
    revalidatePath(`/platform/orgs/${organizationId}`);
    return {
      ok: true,
      message: `Converted from ${result.previousPlanCode}/${result.previousBillingStatus} to Comped. Stripe subscription canceled before local COMPED write.`,
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function purgeContactOutboundDataAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const confirmation = String(formData.get("confirmation") || "");
    if (confirmation !== CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE) {
      return {
        ok: false,
        message: `Type "${CONTACT_OUTBOUND_PURGE_CONFIRM_PHRASE}" exactly to confirm.`,
      };
    }
    const counts = await purgeOrganizationContactOutboundData({
      organizationId,
      actorUserId: user.id,
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    revalidatePath(`/platform/orgs/${organizationId}/view`);
    return {
      ok: true,
      message: `Purged ${vocab.contact.singular}/${vocab.outbound.singular} data: ${counts.contacts} ${vocab.contact.plural}, ${counts.campaigns} ${vocab.campaign.plural}, ${counts.emailSuppressions} suppressions.`,
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function deleteOrganizationAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const confirmation = String(formData.get("confirmation") || "");
    if (confirmation !== DELETE_ORG_CONFIRM_PHRASE) {
      return {
        ok: false,
        message: `Type "${DELETE_ORG_CONFIRM_PHRASE}" exactly to confirm.`,
      };
    }
    await deleteOrganization({
      organizationId,
      actorUserId: user.id,
    });
    revalidatePath("/platform/orgs");
    redirect("/platform/orgs");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return { ok: false, message: toSafeError(error) };
  }
}

export async function updatePlatformUsagePolicyAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    await updateOrganizationUsagePolicyAsPlatform({
      organizationId,
      actorUserId: user.id,
      activeResearchedCompanyLimit: asPositiveInt(
        formData.get("activeResearchedCompanyLimit"),
        "Active researched company limit",
      ),
      dailyEmailGenerationLimit: asPositiveInt(
        formData.get("dailyEmailGenerationLimit"),
        "Daily AI email generation limit",
      ),
      dailyEmailSendWarningLimit: asPositiveInt(
        formData.get("dailyEmailSendWarningLimit"),
        "Daily send advisory threshold",
      ),
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Usage policy updated." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function updatePlatformResearchPolicyAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const contactResearchEnabled =
      formData.get("contactResearchEnabled") === "on";
    await updateOrganizationResearchPolicyAsPlatform({
      organizationId,
      actorUserId: user.id,
      contactResearchEnabled,
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return {
      ok: true,
      message: contactResearchEnabled
        ? `${vocab.contact.Singular} research enabled for this organization.`
        : `${vocab.contact.Singular} research disabled for this organization.`,
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function grantOrganizationCreditAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const amountUsd = Number(formData.get("amountUsd"));
    const reason = String(formData.get("reason") || "").trim();
    const note = String(formData.get("note") || "").trim() || null;
    await grantOrganizationCredit({
      organizationId,
      actorUserId: user.id,
      amountUsd,
      reason,
      note,
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Credit grant recorded." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function grantCompanyResearchCreditsAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const blocks = asPositiveInt(formData.get("blocks"), "Blocks");
    if (blocks < 1) throw new Error("Blocks must be at least 1.");
    const reason = String(formData.get("reason") || "").trim();
    const userIdRaw = String(formData.get("userId") || "").trim();
    const result = await grantCompanyResearchCreditsAsPlatform({
      organizationId,
      actorUserId: user.id,
      userId: userIdRaw || null,
      blocks,
      reason,
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return {
      ok: true,
      message: result.userId
        ? `Granted ${result.companiesGranted} company research credits to the selected user.`
        : `Granted ${result.companiesGranted} company research credits to the organization.`,
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function createPlatformOrganizationAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const name = String(formData.get("name") || "").trim();
    const accountTypeRaw = String(formData.get("accountType") || "").trim();
    const accountType =
      accountTypeRaw === "ENTERPRISE" ? "ENTERPRISE" : "INDIVIDUAL";
    const ownerEmail = String(formData.get("ownerEmail") || "").trim();
    const billingModeRaw = String(formData.get("billingMode") || "").trim();
    const billingMode =
      billingModeRaw === "BILLED" ? "BILLED" : "COMPED";
    const companyLimit = Number(
      formData.get("activeResearchedCompanyLimit") ||
        (billingMode === "BILLED" ? 100 : 50),
    );
    const dailyWarn = Number(
      formData.get("dailyEmailSendWarningLimit") || 50,
    );
    const monthlyRaw = String(
      formData.get("monthlyEmailSendLimit") || "",
    ).trim();
    const monthlyEmailSendLimit =
      monthlyRaw === "" || monthlyRaw.toLowerCase() === "none"
        ? null
        : Number(monthlyRaw);
    if (
      monthlyEmailSendLimit != null &&
      (!Number.isFinite(monthlyEmailSendLimit) || monthlyEmailSendLimit < 0)
    ) {
      return { ok: false, message: "Monthly email limit must be empty or ≥ 0." };
    }
    const created = await createPlatformOrganization({
      actorUserId: user.id,
      name,
      accountType,
      ownerEmail,
      billingMode,
      activeResearchedCompanyLimit: companyLimit,
      dailyEmailSendWarningLimit: dailyWarn,
      monthlyEmailSendLimit:
        billingMode === "BILLED" && monthlyEmailSendLimit == null
          ? 1000
          : monthlyEmailSendLimit,
      seatQuantity: asPositiveInt(formData.get("seatQuantity"), "Included seats"),
      maxSeats: asPositiveInt(formData.get("maxSeats"), "Seat cap"),
    });
    revalidatePath("/platform/orgs");
    revalidatePath(`/platform/orgs/${created.organizationId}`);
    redirect(`/platform/orgs/${created.organizationId}`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return { ok: false, message: toSafeError(error) };
  }
}

export async function platformInviteUserAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const email = String(formData.get("email") || "").trim();
    const roleRaw = String(formData.get("role") || "MEMBER").trim();
    const role =
      roleRaw === "ADMIN" || roleRaw === "MEMBER" || roleRaw === "OWNER"
        ? roleRaw
        : "MEMBER";
    await createOrganizationInvitationAsPlatform({
      organizationId,
      invitedByUserId: user.id,
      email,
      role,
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Invitation sent." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function platformChangeMemberRoleAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const targetUserId = String(formData.get("targetUserId") || "").trim();
    const roleRaw = String(formData.get("role") || "MEMBER").trim();
    const role = roleRaw === "ADMIN" ? "ADMIN" : "MEMBER";
    await changeOrganizationMemberRole({
      organizationId,
      actorUserId: user.id,
      targetUserId,
      role,
      asPlatform: true,
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Member role updated." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function platformRemoveMemberAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const targetUserId = String(formData.get("targetUserId") || "").trim();
    await removeOrganizationMember({
      organizationId,
      actorUserId: user.id,
      targetUserId,
      asPlatform: true,
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Member removed." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function platformRevokeInvitationAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    const user = await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const invitationId = String(formData.get("invitationId") || "").trim();
    await revokeOrganizationInvitationAsPlatform({
      organizationId,
      invitationId,
      actorUserId: user.id,
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return { ok: true, message: "Invitation revoked." };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

export async function updatePlatformOrgMaxSeatsAction(
  _prev: PlatformOrgActionResult | null,
  formData: FormData,
): Promise<PlatformOrgActionResult> {
  try {
    await requirePlatformSuperAdmin();
    const organizationId = requireOrgId(formData);
    const maxSeats = asPositiveInt(formData.get("maxSeats"), "Seat cap");
    if (maxSeats < 1) {
      return { ok: false, message: "Seat cap must be at least 1." };
    }

    const { prisma } = await import("@/lib/prisma");
    const profile = await prisma.organizationBillingProfile.findUnique({
      where: { organizationId },
      select: { seatQuantity: true },
    });
    if (!profile) {
      return { ok: false, message: "Billing profile not found." };
    }
    if (maxSeats < profile.seatQuantity) {
      return {
        ok: false,
        message: `Seat cap cannot be below purchased seats (${profile.seatQuantity}).`,
      };
    }

    await prisma.organizationBillingProfile.update({
      where: { organizationId },
      data: { maxSeats },
    });
    revalidatePath(`/platform/orgs/${organizationId}`);
    return {
      ok: true,
      message:
        "Seat cap updated. This does not change the Stripe subscription quantity.",
    };
  } catch (error) {
    return { ok: false, message: toSafeError(error) };
  }
}

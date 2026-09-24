"use server";

import type { ApplicationAssetType, EmailLength } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import {
  generateOutreachAsset,
  markApplicationApplied,
  markOutreachSent,
} from "@/lib/application-assets/outreach";
import {
  addApplicationContact,
  updateApplicationContactRole,
} from "@/lib/application/contacts";
import { isOutreachAssetType } from "@/lib/product-config";
import { setApplicationProgress } from "@/lib/interview/stages";
import { TenantError } from "@/lib/tenant/errors";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";

export type ApplicationOutreachActionResult = {
  ok: boolean;
  message: string;
  assetId?: string;
  version?: number;
  contactId?: string;
  personaId?: string | null;
  violations?: string[];
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
  revalidatePath(`/campaigns/${campaign}/summary`);
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
    const result = await addApplicationContact({
      organizationId,
      campaignId: id,
      userId: user.id,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      title: String(formData.get("title") ?? ""),
      email: String(formData.get("email") ?? "").trim() || null,
      linkedinUrl: String(formData.get("linkedinUrl") ?? "").trim() || null,
      personaId: String(formData.get("personaId") ?? "").trim() || null,
    });
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
    const type = String(formData.get("type") ?? "");
    if (!isOutreachAssetType(type)) {
      throw new TenantError("Outreach type is invalid.");
    }
    const purposeRaw = String(formData.get("purpose") ?? "PROACTIVE");
    const purpose =
      purposeRaw === "FOLLOW_UP" ||
      purposeRaw === "THANK_YOU" ||
      purposeRaw === "CHECK_IN"
        ? purposeRaw
        : "PROACTIVE";
    const lengthRaw = String(formData.get("emailLength") ?? "MEDIUM");
    const emailLength: EmailLength =
      lengthRaw === "SHORT" || lengthRaw === "LONG" ? lengthRaw : "MEDIUM";
    const result = await generateOutreachAsset({
      organizationId,
      campaignId: id,
      userId: user.id,
      type: type as ApplicationAssetType,
      personaId: String(formData.get("personaId") ?? ""),
      contactId: String(formData.get("contactId") ?? "").trim() || null,
      purpose,
      followUpToAssetId:
        String(formData.get("followUpToAssetId") ?? "").trim() || null,
      interviewStageId:
        String(formData.get("interviewStageId") ?? "").trim() || null,
      emailLength,
      regenerationInstruction:
        String(formData.get("regenerationInstruction") ?? "").trim() || null,
    });
    revalidate(id);
    return result.ok
      ? {
          ok: true,
          message: `Version ${result.version} generated.`,
          assetId: result.assetId,
          version: result.version,
        }
      : {
          ok: false,
          message: result.message,
          violations: result.violations,
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

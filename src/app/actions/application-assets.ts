"use server";

import { revalidatePath } from "next/cache";
import type { ApplicationAssetType } from "@prisma/client";
import { requireCurrentUser } from "@/lib/auth/authz";
import {
  approveApplicationAsset,
  generateApplicationAsset,
  saveEditedApplicationAsset,
} from "@/lib/application-assets/service";
import { requireOrganizationId } from "@/lib/tenant/getCurrentOrganization";
import { TenantError } from "@/lib/tenant/errors";

export type ApplicationAssetActionResult = {
  ok: boolean;
  message: string;
  assetId?: string;
  version?: number;
  violations?: string[];
};

function campaignId(formData: FormData): string {
  const value = String(formData.get("campaignId") ?? "").trim();
  if (!value) throw new TenantError("Application is required.");
  return value;
}

function assetType(formData: FormData): ApplicationAssetType {
  const value = String(formData.get("type") ?? "");
  if (value !== "RESUME" && value !== "COVER_LETTER") {
    throw new TenantError("Application asset type is invalid.");
  }
  return value;
}

function revalidate(campaign: string) {
  revalidatePath(`/campaigns/${campaign}`);
  revalidatePath(`/campaigns/${campaign}/summary`);
}

function errorResult(error: unknown): ApplicationAssetActionResult {
  return {
    ok: false,
    message:
      error instanceof TenantError
        ? error.message
        : "The application asset action could not be completed. Retry.",
  };
}

export async function generateApplicationAssetAction(
  _previous: ApplicationAssetActionResult | null,
  formData: FormData,
): Promise<ApplicationAssetActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const result = await generateApplicationAsset({
      organizationId,
      campaignId: id,
      userId: user.id,
      type: assetType(formData),
      hiddenRoleIds: formData
        .getAll("hiddenRoleId")
        .map((value) => String(value).trim())
        .filter(Boolean),
      regenerationInstruction:
        String(formData.get("regenerationInstruction") ?? "").trim() || null,
    });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        violations: result.violations,
      };
    }
    revalidate(id);
    return {
      ok: true,
      message: `Version ${result.version} generated.`,
      assetId: result.assetId,
      version: result.version,
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function approveApplicationAssetAction(
  _previous: ApplicationAssetActionResult | null,
  formData: FormData,
): Promise<ApplicationAssetActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const assetId = String(formData.get("assetId") ?? "").trim();
    if (!assetId) throw new TenantError("Application asset is required.");
    await approveApplicationAsset({
      organizationId,
      campaignId: id,
      assetId,
      userId: user.id,
    });
    revalidate(id);
    return { ok: true, message: "Version approved.", assetId };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveEditedApplicationAssetAction(
  _previous: ApplicationAssetActionResult | null,
  formData: FormData,
): Promise<ApplicationAssetActionResult> {
  try {
    const [user, organizationId] = await Promise.all([
      requireCurrentUser(),
      requireOrganizationId(),
    ]);
    const id = campaignId(formData);
    const assetId = String(formData.get("assetId") ?? "").trim();
    if (!assetId) throw new TenantError("Application asset is required.");
    let content: unknown;
    try {
      content = JSON.parse(String(formData.get("contentJson") ?? ""));
    } catch {
      return { ok: false, message: "The edited asset content is invalid." };
    }
    const result = await saveEditedApplicationAsset({
      organizationId,
      campaignId: id,
      assetId,
      userId: user.id,
      content,
    });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        violations: result.violations,
      };
    }
    revalidate(id);
    return {
      ok: true,
      message: `Edited version ${result.version} saved.`,
      assetId: result.assetId,
      version: result.version,
    };
  } catch (error) {
    return errorResult(error);
  }
}

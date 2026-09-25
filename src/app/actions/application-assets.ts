"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import {
  acceptPresentationPlan,
} from "@/lib/application-assets/plan-service";
import {
  approveApplicationAsset,
  resolveApplicationAssetFlag,
  saveEditedApplicationAsset,
} from "@/lib/application-assets/service";
import { applicationAssetConfig, workspaceProgressText } from "@/lib/product-config";
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

function assetType(formData: FormData): "RESUME" | "COVER_LETTER" {
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

export async function writePresentationPlanAction(
  _previous: ApplicationAssetActionResult | null,
  formData: FormData,
): Promise<ApplicationAssetActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const id = campaignId(formData);
    const type = assetType(formData);
    await enqueueApplicationJob({
      organizationId,
      campaignId: id,
      type,
      payload: {
        operation: "plan",
        adjustmentNote: String(formData.get("adjustmentNote") ?? "").trim() || null,
      },
    });
    revalidate(id);
    return { ok: true, message: workspaceProgressText(type, null, "plan") };
  } catch (error) {
    return errorResult(error);
  }
}

export async function acceptPresentationPlanAction(
  _previous: ApplicationAssetActionResult | null,
  formData: FormData,
): Promise<ApplicationAssetActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const id = campaignId(formData);
    await acceptPresentationPlan({
      organizationId,
      campaignId: id,
      type: assetType(formData),
    });
    revalidate(id);
    return { ok: true, message: applicationAssetConfig.labels.acceptPlan };
  } catch (error) {
    return errorResult(error);
  }
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
    const type = assetType(formData);
    await enqueueApplicationJob({
      organizationId,
      campaignId: id,
      type,
      initiatedByUserId: user.id,
      payload: {
        userId: user.id,
        hiddenRoleIds: formData
          .getAll("hiddenRoleId")
          .map((value) => String(value).trim())
          .filter(Boolean),
        regenerationInstruction:
          String(formData.get("regenerationInstruction") ?? "").trim() || null,
      },
    });
    revalidate(id);
    return {
      ok: true,
      message: workspaceProgressText(type),
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

export async function resolveApplicationAssetFlagAction(
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
    const claimId = String(formData.get("claimId") ?? "").trim();
    const action = String(formData.get("flagAction") ?? "").trim();
    if (!assetId) throw new TenantError("Application asset is required.");
    if (action !== "KEPT" && action !== "REMOVED") {
      return { ok: false, message: "That flag action is not available." };
    }
    const result = await resolveApplicationAssetFlag({
      organizationId,
      campaignId: id,
      userId: user.id,
      assetId,
      claimId,
      action,
    });
    if (!result.ok) {
      return { ok: false, message: result.message, violations: result.violations };
    }
    revalidate(id);
    return {
      ok: true,
      message:
        action === "KEPT"
          ? applicationAssetConfig.labels.claimFlag.keep
          : applicationAssetConfig.labels.claimFlag.remove,
      assetId: result.assetId,
      version: result.version,
    };
  } catch (error) {
    return errorResult(error);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/authz";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import {
  acceptPresentationPlan,
  updateEarlierExperienceHeading,
} from "@/lib/application-assets/plan-service";
import { prepareResumeBulletCandidates } from "@/lib/application-assets/resume-bullet-candidate-service";
import {
  saveBulletEvidenceRole,
  saveBulletText,
  saveResumeStatementPicks,
} from "@/lib/application-assets/resume-statement-picker-data";
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
  jobId?: string;
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
  revalidatePath(`/campaigns/${campaign}/assets`);
}

export async function prepareResumeBulletCandidatesAction(
  _previous: ApplicationAssetActionResult | null,
  formData: FormData,
): Promise<ApplicationAssetActionResult> {
  try {
    await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const id = campaignId(formData);
    const prepared = await prepareResumeBulletCandidates({
      organizationId,
      campaignId: id,
    });
    if (!prepared.ok) return { ok: false, message: prepared.message };
    revalidate(id);
    return {
      ok: true,
      message: applicationAssetConfig.labels.resumeBulletsPrepared,
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveBulletEvidenceRoleAction(input: {
  campaignId: string;
  bulletId: string;
  roleId: string;
}): Promise<ApplicationAssetActionResult> {
  try {
    await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    await saveBulletEvidenceRole({
      organizationId,
      campaignId: input.campaignId,
      bulletId: input.bulletId,
      roleId: input.roleId,
    });
    revalidate(input.campaignId);
    return { ok: true, message: applicationAssetConfig.labels.statementPicksSaved };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveBulletTextAction(input: {
  campaignId: string;
  bulletId: string;
  text: string;
}): Promise<ApplicationAssetActionResult> {
  try {
    await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    await saveBulletText({
      organizationId,
      campaignId: input.campaignId,
      bulletId: input.bulletId,
      text: input.text,
    });
    revalidate(input.campaignId);
    return { ok: true, message: applicationAssetConfig.labels.bulletEditSaved };
  } catch (error) {
    return errorResult(error);
  }
}

export async function saveResumeStatementPicksAction(
  _previous: ApplicationAssetActionResult | null,
  formData: FormData,
): Promise<ApplicationAssetActionResult> {
  try {
    await requireCurrentUser();
    const organizationId = await requireOrganizationId();
    const id = campaignId(formData);
    const statementIds = formData
      .getAll("statementId")
      .map((value) => String(value).trim())
      .filter(Boolean);
    await saveResumeStatementPicks({
      organizationId,
      campaignId: id,
      statementIds,
    });
    revalidate(id);
    return {
      ok: true,
      message: applicationAssetConfig.labels.statementPicksSaved,
    };
  } catch (error) {
    return errorResult(error);
  }
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
    const adjustmentNote =
      String(formData.get("adjustmentNote") ?? "").trim() || null;
    const { presentationPlanWouldSkip } = await import(
      "@/lib/application-assets/plan-service"
    );
    if (
      await presentationPlanWouldSkip({
        organizationId,
        campaignId: id,
        type,
        adjustmentNote,
      })
    ) {
      return { ok: true, message: applicationAssetConfig.labels.readyPlan };
    }
    const job = await enqueueApplicationJob({
      organizationId,
      campaignId: id,
      type,
      payload: {
        operation: "plan",
        adjustmentNote,
      },
    });
    revalidate(id);
    return {
      ok: true,
      message: workspaceProgressText(type, null, "plan"),
      jobId: job.id,
    };
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
    const hiddenRoleIds = formData
      .getAll("hiddenRoleId")
      .map((value) => String(value).trim())
      .filter(Boolean);
    const regenerationInstruction =
      String(formData.get("regenerationInstruction") ?? "").trim() || null;
    if (type === "RESUME") {
      const prepared = await prepareResumeBulletCandidates({
        organizationId,
        campaignId: id,
      });
      if (!prepared.ok) return { ok: false, message: prepared.message };
    }
    const { applicationAssetGenerateWouldSkip } = await import(
      "@/lib/application-assets/service"
    );
    if (
      await applicationAssetGenerateWouldSkip({
        organizationId,
        campaignId: id,
        userId: user.id,
        type,
        hiddenRoleIds,
        regenerationInstruction,
      })
    ) {
      if (type === "RESUME") revalidate(id);
      return {
        ok: true,
        message:
          type === "RESUME"
            ? applicationAssetConfig.labels.unchangedResume
            : applicationAssetConfig.labels.unchangedCoverLetter,
      };
    }
    const job = await enqueueApplicationJob({
      organizationId,
      campaignId: id,
      type,
      initiatedByUserId: user.id,
      payload: {
        userId: user.id,
        hiddenRoleIds,
        regenerationInstruction,
      },
    });
    revalidate(id);
    return {
      ok: true,
      message: workspaceProgressText(type),
      jobId: job.id,
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
    const earlierExperienceHeading =
      String(formData.get("earlierExperienceHeading") ?? "").trim() || null;
    let content: unknown;
    try {
      content = JSON.parse(String(formData.get("contentJson") ?? ""));
    } catch {
      return { ok: false, message: "The edited asset content is invalid." };
    }
    if (earlierExperienceHeading != null) {
      const headingResult = await updateEarlierExperienceHeading({
        organizationId,
        campaignId: id,
        heading: earlierExperienceHeading,
      });
      if (!headingResult.ok) {
        return { ok: false, message: headingResult.message };
      }
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

export async function updateEarlierExperienceHeadingAction(
  _previous: ApplicationAssetActionResult | null,
  formData: FormData,
): Promise<ApplicationAssetActionResult> {
  try {
    const organizationId = await requireOrganizationId();
    await requireCurrentUser();
    const id = campaignId(formData);
    const heading = String(formData.get("earlierExperienceHeading") ?? "").trim();
    const result = await updateEarlierExperienceHeading({
      organizationId,
      campaignId: id,
      heading,
    });
    if (!result.ok) return { ok: false, message: result.message };
    revalidate(id);
    return { ok: true, message: "Heading saved." };
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
        "Saved.",
      assetId: result.assetId,
      version: result.version,
    };
  } catch (error) {
    return errorResult(error);
  }
}

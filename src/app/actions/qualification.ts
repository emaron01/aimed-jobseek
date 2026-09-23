"use server";

import type {
  QualificationBucket,
  QualificationOverrideTarget,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { assertCanModifyOwnedWork } from "@/lib/work/ownership";
import { requireOrganization } from "@/lib/tenant/getCurrentOrganization";
import { vocab } from "@/lib/product-config";

export type QualificationOverrideActionResult = {
  ok: boolean;
  message: string;
  bucket?: QualificationBucket;
  restoredCount?: number;
};

const BUCKETS: QualificationBucket[] = [
  "GOOD",
  "NEEDS_REVIEW",
  "POOR_FIT",
  "EXCLUDED",
];
const TARGETS: QualificationOverrideTarget[] = ["COMPANY", "CONTACT"];

const RESTORE_BUCKETS: QualificationBucket[] = ["GOOD", "NEEDS_REVIEW"];

async function persistQualificationOverride(input: {
  organizationId: string;
  userId: string;
  scoringRunId: string;
  targetType: QualificationOverrideTarget;
  targetId: string;
  bucket: QualificationBucket;
}) {
  await prisma.qualificationBucketOverride.upsert({
    where: {
      organizationId_scoringRunId_targetType_targetId: {
        organizationId: input.organizationId,
        scoringRunId: input.scoringRunId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    },
    create: {
      organizationId: input.organizationId,
      scoringRunId: input.scoringRunId,
      targetType: input.targetType,
      targetId: input.targetId,
      bucket: input.bucket,
      overriddenById: input.userId,
    },
    update: {
      bucket: input.bucket,
      overriddenById: input.userId,
    },
  });
}

function revalidateQualificationPaths(input: {
  campaignId?: string | null;
  scoringRunId: string;
}) {
  if (input.campaignId) {
    revalidatePath(`/campaigns/${input.campaignId}`);
  }
  revalidatePath(`/scoring/${input.scoringRunId}`);
}

export async function overrideQualificationBucketAction(input: {
  campaignId?: string | null;
  scoringRunId: string;
  targetType: QualificationOverrideTarget;
  targetId: string;
  bucket: QualificationBucket;
}): Promise<QualificationOverrideActionResult> {
  if (!BUCKETS.includes(input.bucket) || !TARGETS.includes(input.targetType)) {
    return { ok: false, message: "Select a valid qualification bucket." };
  }
  try {
    const [user, organization] = await Promise.all([
      requireCurrentUser(),
      requireOrganization(),
    ]);
    const run = await prisma.scoringRun.findFirst({
      where: { id: input.scoringRunId, organizationId: organization.id },
      select: {
        id: true,
        contactList: { select: { ownerUserId: true } },
      },
    });
    if (!run) {
      return { ok: false, message: "Qualification run was not found." };
    }
    assertCanModifyOwnedWork(
      { userId: user.id },
      run.contactList.ownerUserId,
      "Scoring run",
    );
    const targetExists =
      input.targetType === "CONTACT"
        ? await prisma.contactScore.count({
            where: {
              organizationId: organization.id,
              scoringRunId: run.id,
              contactId: input.targetId,
            },
          })
        : await prisma.contactScore.count({
            where: {
              organizationId: organization.id,
              scoringRunId: run.id,
              contact: { companyId: input.targetId },
            },
          });
    if (targetExists === 0) {
      return {
        ok: false,
        message: "Qualification row does not belong to this workspace.",
      };
    }
    await persistQualificationOverride({
      organizationId: organization.id,
      userId: user.id,
      scoringRunId: run.id,
      targetType: input.targetType,
      targetId: input.targetId,
      bucket: input.bucket,
    });
    revalidateQualificationPaths({
      campaignId: input.campaignId,
      scoringRunId: run.id,
    });
    return {
      ok: true,
      message: `Moved to ${input.bucket.toLowerCase().replace("_", " ")}.`,
      bucket: input.bucket,
    };
  } catch (error) {
    console.error("Failed to override qualification bucket.", error);
    return {
      ok: false,
      message: "The qualification override could not be saved.",
    };
  }
}

export async function bulkRestoreQualificationAction(input: {
  campaignId?: string | null;
  scoringRunId: string;
  targetType: QualificationOverrideTarget;
  targetIds: string[];
  bucket?: QualificationBucket;
}): Promise<QualificationOverrideActionResult> {
  const bucket = input.bucket ?? "GOOD";
  if (!RESTORE_BUCKETS.includes(bucket)) {
    return { ok: false, message: "Select a valid restore bucket." };
  }
  if (!TARGETS.includes(input.targetType)) {
    return { ok: false, message: "Select a valid qualification target." };
  }
  const targetIds = [...new Set(input.targetIds.map(String).filter(Boolean))];
  if (targetIds.length === 0) {
    return { ok: false, message: `Select at least one ${vocab.contact.singular} to restore.` };
  }
  try {
    const [user, organization] = await Promise.all([
      requireCurrentUser(),
      requireOrganization(),
    ]);
    const run = await prisma.scoringRun.findFirst({
      where: { id: input.scoringRunId, organizationId: organization.id },
      select: {
        id: true,
        contactList: { select: { ownerUserId: true } },
      },
    });
    if (!run) {
      return { ok: false, message: "Qualification run was not found." };
    }
    assertCanModifyOwnedWork(
      { userId: user.id },
      run.contactList.ownerUserId,
      "Scoring run",
    );
    let restoredCount = 0;
    for (const targetId of targetIds) {
      const targetExists =
        input.targetType === "CONTACT"
          ? await prisma.contactScore.count({
              where: {
                organizationId: organization.id,
                scoringRunId: run.id,
                contactId: targetId,
              },
            })
          : await prisma.contactScore.count({
              where: {
                organizationId: organization.id,
                scoringRunId: run.id,
                contact: { companyId: targetId },
              },
            });
      if (targetExists === 0) continue;
      await persistQualificationOverride({
        organizationId: organization.id,
        userId: user.id,
        scoringRunId: run.id,
        targetType: input.targetType,
        targetId,
        bucket,
      });
      restoredCount += 1;
    }
    if (restoredCount === 0) {
      return {
        ok: false,
        message: "No matching qualification rows were found to restore.",
      };
    }
    revalidateQualificationPaths({
      campaignId: input.campaignId,
      scoringRunId: run.id,
    });
    return {
      ok: true,
      message: `Restored ${restoredCount} ${restoredCount === 1 ? "row" : "rows"} to ${bucket.toLowerCase().replace("_", " ")}.`,
      bucket,
      restoredCount,
    };
  } catch (error) {
    console.error("Failed to bulk restore qualification rows.", error);
    return {
      ok: false,
      message: "The bulk restore could not be saved.",
    };
  }
}

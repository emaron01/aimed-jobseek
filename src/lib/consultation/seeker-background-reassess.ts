/**
 * Seeker "what you should know about me" reassess gate (Caching Phase 2 batch 1).
 */
import {
  findPaidCallReceipt,
  fingerprintPaidCallInputs,
} from "@/lib/ai/paid-call-gate";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import { prisma } from "@/lib/prisma-client";
import { normalizeSeekerBackgroundNote } from "@/lib/product-research/seeker-background";
import type { Prisma } from "@prisma/client";

export const SEEKER_BACKGROUND_REASSESS_OPERATION =
  "CONSULTATION_SEEKER_BACKGROUND_REASSESS" as const;

export function seekerBackgroundReassessFingerprint(input: {
  text: string;
  promptVersion?: string;
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: input.promptVersion ?? CONSULTATION_PROMPT_VERSION,
    background: normalizeSeekerBackgroundNote(input.text),
  });
}

export async function seekerBackgroundReassessFingerprintChanged(input: {
  organizationId: string;
  campaignId: string;
  text: string;
}): Promise<{ changed: boolean; fingerprint: string }> {
  const fingerprint = seekerBackgroundReassessFingerprint({
    text: input.text,
  });
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: SEEKER_BACKGROUND_REASSESS_OPERATION,
    subjectKey: input.campaignId,
  });
  if (!receipt || receipt.inputHash !== fingerprint) {
    return { changed: true, fingerprint };
  }
  return { changed: false, fingerprint };
}

export async function recordSeekerBackgroundReassessFingerprint(input: {
  organizationId: string;
  campaignId: string;
  fingerprint: string;
}): Promise<void> {
  await prisma.paidCallReceipt.upsert({
    where: {
      organizationId_operation_subjectKey: {
        organizationId: input.organizationId,
        operation: SEEKER_BACKGROUND_REASSESS_OPERATION,
        subjectKey: input.campaignId,
      },
    },
    create: {
      organizationId: input.organizationId,
      operation: SEEKER_BACKGROUND_REASSESS_OPERATION,
      subjectKey: input.campaignId,
      inputHash: input.fingerprint,
      resultJson: { recordedAt: new Date().toISOString() } as Prisma.InputJsonValue,
    },
    update: {
      inputHash: input.fingerprint,
      resultJson: { recordedAt: new Date().toISOString() } as Prisma.InputJsonValue,
    },
  });
}

/** Enqueue CONSULTATION reassess only when seeker background text changed. */
export async function enqueueSeekerBackgroundReassessIfChanged(input: {
  organizationId: string;
  campaignId: string;
  userId?: string | null;
  text: string;
}): Promise<boolean> {
  const { changed, fingerprint } = await seekerBackgroundReassessFingerprintChanged({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    text: input.text,
  });
  if (!changed) return false;
  const { enqueueApplicationJob } = await import("@/lib/application-jobs/service");
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "CONSULTATION",
    targetId: "reassess",
    initiatedByUserId: input.userId ?? undefined,
    payload: {
      operation: "reassess",
      gate: "seeker_background",
      fingerprint,
    },
  });
  return true;
}

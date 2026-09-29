import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma-client";

export type PaidCallOperation =
  | "HIRING_TEAM_IDENTIFY"
  | "HIRING_TEAM_SYNTHESIZE"
  | "ROLE_EXPERTISE_QUESTIONS"
  | "CONSULTATION_LEARNINGS_REASSESS"
  | "JOB_REQUIREMENT_PARSE"
  | "APPLICATION_SUMMARY_SHELL"
  | "CONSULTATION_SEEKER_BACKGROUND_REASSESS"
  | "PRESENTATION_PLAN"
  | "RESUME_ASSET"
  | "COVER_LETTER_ASSET"
  | "ASSET_CLAIM_VALIDATION";

/** Same hashing approach as cheatSheetPersonSectionInputHash. */
export function fingerprintPaidCallInputs(canonical: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export async function runPaidStructuredCall<T>(input: {
  organizationId: string;
  operation: PaidCallOperation;
  subjectKey: string;
  inputFingerprint: string;
  isResultUsable: (stored: T) => boolean;
  parseStored: (json: unknown) => T;
  callProvider: () => Promise<T>;
}): Promise<{ data: T; skipped: boolean }> {
  const existing = await prisma.paidCallReceipt.findUnique({
    where: {
      organizationId_operation_subjectKey: {
        organizationId: input.organizationId,
        operation: input.operation,
        subjectKey: input.subjectKey,
      },
    },
  });
  if (existing && existing.inputHash === input.inputFingerprint) {
    try {
      const stored = input.parseStored(existing.resultJson);
      if (input.isResultUsable(stored)) {
        return { data: stored, skipped: true };
      }
    } catch {
      // Unusable stored payload — fall through to provider.
    }
  }

  const data = await input.callProvider();
  await prisma.paidCallReceipt.upsert({
    where: {
      organizationId_operation_subjectKey: {
        organizationId: input.organizationId,
        operation: input.operation,
        subjectKey: input.subjectKey,
      },
    },
    create: {
      organizationId: input.organizationId,
      operation: input.operation,
      subjectKey: input.subjectKey,
      inputHash: input.inputFingerprint,
      resultJson: data as Prisma.InputJsonValue,
    },
    update: {
      inputHash: input.inputFingerprint,
      resultJson: data as Prisma.InputJsonValue,
    },
  });
  return { data, skipped: false };
}

export async function findPaidCallReceipt(input: {
  organizationId: string;
  operation: PaidCallOperation;
  subjectKey: string;
}): Promise<{ inputHash: string; resultJson: unknown } | null> {
  const row = await prisma.paidCallReceipt.findUnique({
    where: {
      organizationId_operation_subjectKey: {
        organizationId: input.organizationId,
        operation: input.operation,
        subjectKey: input.subjectKey,
      },
    },
    select: { inputHash: true, resultJson: true },
  });
  return row;
}

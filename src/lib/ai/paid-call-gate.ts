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
  | "ASSET_CLAIM_VALIDATION"
  | "OUTREACH_FACT_SELECTION"
  | "OUTREACH_ASSET"
  | "OUTREACH_CLAIM_VALIDATION"
  | "INTERVIEW_THANK_YOU_CLARIFY"
  | "CONTACT_PROFILE_EXTRACT"
  | "CONTACT_PROFILE_SYNTHESIZE"
  | "COMPANY_RESEARCH";

/** Same hashing approach as cheatSheetPersonSectionInputHash. */
export function fingerprintPaidCallInputs(canonical: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Same-process in-flight serialization for one org/operation/subjectKey.
 * Concurrent callers wait for the prior call, then re-check the receipt.
 */
const subjectLocks = new Map<string, Promise<unknown>>();

function subjectLockKey(
  organizationId: string,
  operation: PaidCallOperation,
  subjectKey: string,
): string {
  return `${organizationId}\0${operation}\0${subjectKey}`;
}

async function withSubjectLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prior = subjectLocks.get(key);
  const current = (prior ?? Promise.resolve()).then(fn, fn);
  subjectLocks.set(key, current);
  try {
    return (await current) as T;
  } finally {
    if (subjectLocks.get(key) === current) {
      subjectLocks.delete(key);
    }
  }
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
  const key = subjectLockKey(
    input.organizationId,
    input.operation,
    input.subjectKey,
  );

  return withSubjectLock(key, async () => {
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
    // Record only after a usable result (failed/empty results must not block retries).
    if (input.isResultUsable(data)) {
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
    }
    return { data, skipped: false };
  });
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

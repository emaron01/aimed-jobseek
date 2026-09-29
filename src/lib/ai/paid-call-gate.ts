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
 * Stable advisory-lock material for one org/operation/subjectKey.
 * Used with Postgres pg_advisory_xact_lock(hashtext(...)) so concurrent
 * workers across processes serialize on the same key.
 */
export function paidCallAdvisoryLockKey(
  organizationId: string,
  operation: PaidCallOperation,
  subjectKey: string,
): string {
  return `paid-call:${organizationId}:${operation}:${subjectKey}`;
}

/** Wait for a connection, then hold the lock for a long research/provider call. */
const PAID_CALL_LOCK_MAX_WAIT_MS = 120_000;
const PAID_CALL_LOCK_TIMEOUT_MS = 600_000;

/**
 * Cross-process serialization via Postgres advisory lock.
 * The lock is held for the duration of fn (receipt check + provider call).
 */
async function withSubjectLock<T>(
  organizationId: string,
  operation: PaidCallOperation,
  subjectKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = paidCallAdvisoryLockKey(
    organizationId,
    operation,
    subjectKey,
  );
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      return fn();
    },
    {
      maxWait: PAID_CALL_LOCK_MAX_WAIT_MS,
      timeout: PAID_CALL_LOCK_TIMEOUT_MS,
    },
  );
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
  return withSubjectLock(
    input.organizationId,
    input.operation,
    input.subjectKey,
    async () => {
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
    },
  );
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

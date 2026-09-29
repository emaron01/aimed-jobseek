import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma-client";
import { assertOrganizationMaySpend } from "@/lib/billing/organization-spend";

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
 * Used with session-level pg_try_advisory_lock on a dedicated Prisma client
 * (connection_limit=1) so concurrent workers serialize without holding a pooled
 * interactive transaction during the provider call.
 */
export function paidCallAdvisoryLockKey(
  organizationId: string,
  operation: PaidCallOperation,
  subjectKey: string,
): string {
  return `paid-call:${organizationId}:${operation}:${subjectKey}`;
}

/** Two int4 keys derived from the lock material (stable across processes). */
export function paidCallAdvisoryLockIds(lockKey: string): [number, number] {
  const digest = createHash("sha256").update(lockKey).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

/**
 * How long a waiter may retry pg_try_advisory_lock before failing cleanly.
 * Long enough for another worker's multi-minute company research to finish.
 */
export const PAID_CALL_LOCK_ACQUIRE_MAX_WAIT_MS = 600_000;
const PAID_CALL_LOCK_RETRY_INITIAL_MS = 50;
const PAID_CALL_LOCK_RETRY_MAX_MS = 2_000;

export class PaidCallLockTimeoutError extends Error {
  constructor(message = "Paid call lock wait exceeded. Retry shortly.") {
    super(message);
    this.name = "PaidCallLockTimeoutError";
  }
}

/**
 * Dedicated single-connection Prisma URL for session advisory locks.
 * Outside the shared app/worker pool (connection_limit=1).
 */
export function paidCallLockDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("pool_timeout", "60");
  return url.toString();
}

function requireLockDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error("DATABASE_URL is required for paid-call locks.");
  }
  return paidCallLockDatabaseUrl(raw);
}

async function tryAdvisoryLock(
  lockPrisma: PrismaClient,
  k1: number,
  k2: number,
): Promise<boolean> {
  const rows = await lockPrisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${k1}::integer, ${k2}::integer) AS locked
  `;
  return Boolean(rows[0]?.locked);
}

async function unlockAdvisoryLock(
  lockPrisma: PrismaClient,
  k1: number,
  k2: number,
): Promise<void> {
  await lockPrisma.$queryRaw`
    SELECT pg_advisory_unlock(${k1}::integer, ${k2}::integer)
  `;
}

/**
 * Acquire a session advisory lock on a dedicated connection (outside the
 * shared Prisma pool), run fn, and always unlock + disconnect in finally.
 * Bounded wait via pg_try_advisory_lock + backoff; on timeout throws
 * PaidCallLockTimeoutError (callers retry; receipt then short-circuits).
 *
 * Does not use prisma.$transaction — the shared pool is free during the
 * provider call; only this one-connection client holds the session lock.
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
  const [k1, k2] = paidCallAdvisoryLockIds(lockKey);
  const lockPrisma = new PrismaClient({
    datasources: { db: { url: requireLockDatabaseUrl() } },
    log: ["error"],
  });
  await lockPrisma.$connect();
  let locked = false;
  try {
    const deadline = Date.now() + PAID_CALL_LOCK_ACQUIRE_MAX_WAIT_MS;
    let delayMs = PAID_CALL_LOCK_RETRY_INITIAL_MS;
    while (!(locked = await tryAdvisoryLock(lockPrisma, k1, k2))) {
      if (Date.now() >= deadline) {
        throw new PaidCallLockTimeoutError();
      }
      const remaining = deadline - Date.now();
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(delayMs, remaining)),
      );
      delayMs = Math.min(delayMs * 2, PAID_CALL_LOCK_RETRY_MAX_MS);
    }
    // Provider work uses the shared Prisma pool; lockPrisma only holds the lock.
    return await fn();
  } finally {
    if (locked) {
      try {
        await unlockAdvisoryLock(lockPrisma, k1, k2);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "paid_call_advisory_unlock_failed",
            lockKey,
            message: error instanceof Error ? error.message : "unknown",
          }),
        );
      }
    }
    await lockPrisma.$disconnect().catch(() => undefined);
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
  // Refuse before lock / provider / receipt write when org is gone or spend-locked.
  await assertOrganizationMaySpend(input.organizationId);

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

/**
 * Incomplete hiring-team synthesize outcomes stored on PaidCallReceipt.resultJson
 * so unchanged Generate makes no paid call (PO decisions).
 */
import type { Prisma } from "@prisma/client";
import {
  findPaidCallReceipt,
  type PaidCallOperation,
} from "@/lib/ai/paid-call-gate";
import { prisma } from "@/lib/prisma-client";

export const HIRING_TEAM_SYNTHESIZE_OUTCOME_KEY =
  "__hiringTeamSynthesizeOutcome" as const;

export const HIRING_TEAM_TEMPORARY_COOLDOWN_MS = 60 * 60 * 1000;

export type HiringTeamIncompleteKind =
  | "INSUFFICIENT_INFORMATION"
  | "TEMPORARY_EXHAUSTED";

export type HiringTeamIncompleteRecord = {
  [HIRING_TEAM_SYNTHESIZE_OUTCOME_KEY]: HiringTeamIncompleteKind;
  recordedAt: string;
  reasons?: string[];
};

const OPERATION: PaidCallOperation = "HIRING_TEAM_SYNTHESIZE";

export function isHiringTeamIncompleteRecord(
  value: unknown,
): value is HiringTeamIncompleteRecord {
  if (!value || typeof value !== "object") return false;
  const kind = (value as Record<string, unknown>)[
    HIRING_TEAM_SYNTHESIZE_OUTCOME_KEY
  ];
  return (
    kind === "INSUFFICIENT_INFORMATION" || kind === "TEMPORARY_EXHAUSTED"
  );
}

export function isPersonaDraftResultUsable(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (isHiringTeamIncompleteRecord(value)) return false;
  return true;
}

export function profileJsonAwaitingSeekerInput(
  profileJson: unknown,
): boolean {
  if (!profileJson || typeof profileJson !== "object") return false;
  return (profileJson as { awaitingSeekerInput?: unknown }).awaitingSeekerInput ===
    true;
}

export function withAwaitingSeekerInput(
  profileJson: unknown,
  awaiting: boolean,
): Prisma.InputJsonValue {
  const current =
    profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)
      ? { ...(profileJson as Record<string, unknown>) }
      : {};
  if (awaiting) {
    current.awaitingSeekerInput = true;
  } else {
    delete current.awaitingSeekerInput;
  }
  return current as Prisma.InputJsonValue;
}

export async function recordHiringTeamIncompleteSynthesize(input: {
  organizationId: string;
  personaId: string;
  inputFingerprint: string;
  kind: HiringTeamIncompleteKind;
  reasons?: string[];
}): Promise<void> {
  const resultJson: HiringTeamIncompleteRecord = {
    [HIRING_TEAM_SYNTHESIZE_OUTCOME_KEY]: input.kind,
    recordedAt: new Date().toISOString(),
    ...(input.reasons && input.reasons.length > 0
      ? { reasons: input.reasons }
      : {}),
  };
  await prisma.paidCallReceipt.upsert({
    where: {
      organizationId_operation_subjectKey: {
        organizationId: input.organizationId,
        operation: OPERATION,
        subjectKey: input.personaId,
      },
    },
    create: {
      organizationId: input.organizationId,
      operation: OPERATION,
      subjectKey: input.personaId,
      inputHash: input.inputFingerprint,
      resultJson: resultJson as Prisma.InputJsonValue,
    },
    update: {
      inputHash: input.inputFingerprint,
      resultJson: resultJson as Prisma.InputJsonValue,
    },
  });
}

export async function readHiringTeamIncompleteSynthesize(input: {
  organizationId: string;
  personaId: string;
  inputFingerprint: string;
  now?: Date;
}): Promise<{
  kind: HiringTeamIncompleteKind;
  recordedAt: Date;
  reasons: string[];
  blocksPaidCall: boolean;
} | null> {
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: OPERATION,
    subjectKey: input.personaId,
  });
  if (!receipt || receipt.inputHash !== input.inputFingerprint) return null;
  if (!isHiringTeamIncompleteRecord(receipt.resultJson)) return null;
  const recordedAt = new Date(receipt.resultJson.recordedAt);
  if (Number.isNaN(recordedAt.getTime())) return null;
  const now = input.now ?? new Date();
  const kind = receipt.resultJson[HIRING_TEAM_SYNTHESIZE_OUTCOME_KEY];
  const blocksPaidCall =
    kind === "INSUFFICIENT_INFORMATION"
      ? true
      : now.getTime() - recordedAt.getTime() < HIRING_TEAM_TEMPORARY_COOLDOWN_MS;
  return {
    kind,
    recordedAt,
    reasons: receipt.resultJson.reasons ?? [],
    blocksPaidCall,
  };
}

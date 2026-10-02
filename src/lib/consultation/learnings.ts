/**
 * Application interview learnings fingerprint and Hiring Manager routing (Batch D7).
 */

import {
  findPaidCallReceipt,
  fingerprintPaidCallInputs,
} from "@/lib/ai/paid-call-gate";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import { HIRING_MANAGER_KEY } from "@/lib/hiring-team/identify";
import { parseCheatSheetNotes } from "@/lib/application-summary/notes";
import { prisma } from "@/lib/prisma-client";
import type { Prisma } from "@prisma/client";

export const LEARNINGS_REASSESS_OPERATION = "CONSULTATION_LEARNINGS_REASSESS" as const;

export type LearningsStageNotes = {
  id: string;
  notesBefore: string | null;
  notesAfter: string | null;
};

export type LearningsGainedNote = {
  contactId: string;
  id: string;
  text: string;
  stageId: string | null;
  createdAt: string;
};

export type ApplicationLearningsPayload = {
  seekerLearnedNotes: string | null;
  stages: LearningsStageNotes[];
  newlyGained: LearningsGainedNote[];
};

export function isHiringManagerRole(role: {
  suggestionKey?: string | null;
  name?: string | null;
}): boolean {
  if (role.suggestionKey === HIRING_MANAGER_KEY) return true;
  return /\bhiring manager\b/i.test(role.name ?? "");
}

/**
 * Canonical learnings fingerprint — profile changes do not affect this.
 * Harper learns the note text, not which row stored it. Stage ids, dates, and
 * outcomes are omitted. An interview with no notes before or after is omitted,
 * so adding or removing that interview does not change the hash.
 */
export function learningsFingerprint(input: {
  seekerLearnedNotes: string | null | undefined;
  stages: LearningsStageNotes[];
  newlyGained: LearningsGainedNote[];
  promptVersion?: string;
}): string {
  const stages = input.stages
    .map((stage) => ({
      notesBefore: stage.notesBefore?.trim() || null,
      notesAfter: stage.notesAfter?.trim() || null,
    }))
    .filter((stage) => stage.notesBefore || stage.notesAfter)
    .sort(
      (a, b) =>
        (a.notesBefore ?? "").localeCompare(b.notesBefore ?? "") ||
        (a.notesAfter ?? "").localeCompare(b.notesAfter ?? ""),
    );
  return fingerprintPaidCallInputs({
    promptVersion: input.promptVersion ?? CONSULTATION_PROMPT_VERSION,
    seekerLearnedNotes: input.seekerLearnedNotes?.trim() || null,
    stages,
    newlyGained: canonicalNewlyGained(input.newlyGained),
  });
}

/**
 * Previous fingerprint, kept so a receipt written when every stage id was
 * hashed still counts as unchanged when the learned text is the same.
 */
export function learningsFingerprintWithStageIds(input: {
  seekerLearnedNotes: string | null | undefined;
  stages: LearningsStageNotes[];
  newlyGained: LearningsGainedNote[];
  promptVersion?: string;
}): string {
  const stages = [...input.stages]
    .map((stage) => ({
      id: stage.id,
      notesBefore: stage.notesBefore?.trim() || null,
      notesAfter: stage.notesAfter?.trim() || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return fingerprintPaidCallInputs({
    promptVersion: input.promptVersion ?? CONSULTATION_PROMPT_VERSION,
    seekerLearnedNotes: input.seekerLearnedNotes?.trim() || null,
    stages,
    newlyGained: canonicalNewlyGained(input.newlyGained),
  });
}

function canonicalNewlyGained(notes: LearningsGainedNote[]) {
  return [...notes]
    .map((note) => ({
      contactId: note.contactId,
      id: note.id,
      text: note.text.trim(),
      stageId: note.stageId,
      createdAt: note.createdAt,
    }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.contactId.localeCompare(b.contactId));
}

export async function loadApplicationLearnings(
  organizationId: string,
  campaignId: string,
): Promise<ApplicationLearningsPayload> {
  const [requirement, stages, contacts] = await Promise.all([
    prisma.jobRequirement.findFirst({
      where: { organizationId, campaignId },
      select: { seekerLearnedNotes: true },
    }),
    prisma.interviewStage.findMany({
      where: { organizationId, campaignId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, notesBefore: true, notesAfter: true },
    }),
    prisma.campaignContact.findMany({
      where: { organizationId, campaignId },
      select: { contactId: true, cheatSheetNotesJson: true },
    }),
  ]);
  const newlyGained: LearningsGainedNote[] = [];
  for (const row of contacts) {
    for (const note of parseCheatSheetNotes(row.cheatSheetNotesJson)) {
      newlyGained.push({
        contactId: row.contactId,
        id: note.id,
        text: note.text,
        stageId: note.stageId,
        createdAt: note.createdAt,
      });
    }
  }
  return {
    seekerLearnedNotes: requirement?.seekerLearnedNotes ?? null,
    stages,
    newlyGained,
  };
}

export async function learningsFingerprintChanged(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{ changed: boolean; fingerprint: string }> {
  const learnings = await loadApplicationLearnings(
    input.organizationId,
    input.campaignId,
  );
  const fingerprint = learningsFingerprint(learnings);
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: LEARNINGS_REASSESS_OPERATION,
    subjectKey: input.campaignId,
  });
  if (!receipt) return { changed: true, fingerprint };
  const unchanged =
    receipt.inputHash === fingerprint ||
    receipt.inputHash === learningsFingerprintWithStageIds(learnings);
  return { changed: !unchanged, fingerprint };
}

/**
 * After a removal that did not change learned text, point an existing receipt
 * at the current fingerprint. No receipt is created, and no job is enqueued.
 */
export async function retargetLearningsReceiptIfPresent(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: LEARNINGS_REASSESS_OPERATION,
    subjectKey: input.campaignId,
  });
  if (!receipt) return;
  await recordLearningsReassessFingerprint({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
}

export async function recordLearningsReassessFingerprint(input: {
  organizationId: string;
  campaignId: string;
  fingerprint?: string;
}): Promise<void> {
  const fingerprint =
    input.fingerprint ??
    learningsFingerprint(
      await loadApplicationLearnings(input.organizationId, input.campaignId),
    );
  await prisma.paidCallReceipt.upsert({
    where: {
      organizationId_operation_subjectKey: {
        organizationId: input.organizationId,
        operation: LEARNINGS_REASSESS_OPERATION,
        subjectKey: input.campaignId,
      },
    },
    create: {
      organizationId: input.organizationId,
      operation: LEARNINGS_REASSESS_OPERATION,
      subjectKey: input.campaignId,
      inputHash: fingerprint,
      resultJson: { recordedAt: new Date().toISOString() } as Prisma.InputJsonValue,
    },
    update: {
      inputHash: fingerprint,
      resultJson: { recordedAt: new Date().toISOString() } as Prisma.InputJsonValue,
    },
  });
}

/** Enqueue CONSULTATION reassess only when learnings fingerprint changed. */
export async function enqueueLearningsReassessIfChanged(input: {
  organizationId: string;
  campaignId: string;
  userId?: string | null;
}): Promise<boolean> {
  const { changed } = await learningsFingerprintChanged({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
  if (!changed) return false;
  const { enqueueApplicationJob } = await import("@/lib/application-jobs/service");
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "CONSULTATION",
    targetId: "reassess",
    initiatedByUserId: input.userId ?? undefined,
    payload: { operation: "reassess" },
  });
  return true;
}

export async function hiringManagerContactIds(input: {
  organizationId: string;
  campaignId: string;
}): Promise<string[]> {
  const roles = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    select: { id: true, suggestionKey: true, name: true },
  });
  const hmRoleIds = new Set(
    roles.filter((role) => isHiringManagerRole(role)).map((role) => role.id),
  );
  if (hmRoleIds.size === 0) return [];
  const memberships = await prisma.campaignContact.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      chosenPersonaId: { in: [...hmRoleIds] },
    },
    select: { contactId: true },
  });
  return [...new Set(memberships.map((row) => row.contactId))];
}

/** Shared application-learnings source ids (not per-contact INTEL). */
export function isApplicationLearningsSourceId(sourceId: string): boolean {
  return (
    sourceId === "job:learned-notes" ||
    /^interview:[^:]+:notes(?:Before|After)$/.test(sourceId)
  );
}

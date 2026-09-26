import type {
  ApplicationProgress,
  InterviewFormat,
  InterviewStageOutcome,
  InterviewStageType,
} from "@prisma/client";
import { addApplicationContact } from "@/lib/application/contacts";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { saveLinkedInPaste } from "@/lib/contact-profile/service";
import { prisma } from "@/lib/prisma-client";
import {
  interviewConfig,
  isApplicationProgress,
  isInterviewFormat,
  isInterviewStageOutcome,
  isInterviewStageType,
  vocab,
} from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

const TERMINAL_PROGRESS = new Set<ApplicationProgress>([
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
]);

export async function requireOwnedCampaign(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
}) {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      ownerUserId: input.userId,
    },
    select: { id: true, applicationProgress: true, ownerUserId: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  return campaign;
}

export async function listInterviewStages(input: {
  organizationId: string;
  campaignId: string;
}) {
  return prisma.interviewStage.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    include: {
      interviewers: {
        include: {
          contact: true,
        },
        orderBy: { createdAt: "asc" },
      },
      guide: true,
      outreachAssets: {
        orderBy: { version: "desc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createInterviewStage(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  type: string;
  scheduledAt: Date;
  format: string;
  notesBefore?: string | null;
  expectedDecisionAt?: Date | null;
}) {
  if (!isInterviewStageType(input.type)) {
    throw new TenantError("Interview stage type is invalid.");
  }
  if (!isInterviewFormat(input.format)) {
    throw new TenantError("Interview format is invalid.");
  }
  if (Number.isNaN(input.scheduledAt.getTime())) {
    throw new TenantError("Interview date is invalid.");
  }
  if (
    input.expectedDecisionAt &&
    Number.isNaN(input.expectedDecisionAt.getTime())
  ) {
    throw new TenantError("Expected decision date is invalid.");
  }
  const campaign = await requireOwnedCampaign(input);
  const latest = await prisma.interviewStage.aggregate({
    where: { campaignId: input.campaignId },
    _max: { sortOrder: true },
  });
  const sortOrder = (latest._max.sortOrder ?? 0) + 1;
  const stage = await prisma.interviewStage.create({
    data: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sortOrder,
      type: input.type as InterviewStageType,
      scheduledAt: input.scheduledAt,
      format: input.format as InterviewFormat,
      notesBefore: input.notesBefore?.trim() || null,
      expectedDecisionAt: input.expectedDecisionAt ?? null,
    },
  });
  if (!campaign.applicationProgress || !TERMINAL_PROGRESS.has(campaign.applicationProgress)) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { applicationProgress: "INTERVIEWING" },
    });
  }
  return stage;
}

export async function updateInterviewStage(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  stageId: string;
  scheduledAt?: Date;
  format?: string;
  notesBefore?: string | null;
  notesAfter?: string | null;
  expectedDecisionAt?: Date | null;
  outcome?: string | null;
}) {
  await requireOwnedCampaign(input);
  const stage = await prisma.interviewStage.findFirst({
    where: {
      id: input.stageId,
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
  });
  if (!stage) throw new TenantError("Interview stage was not found.");
  if (input.format && !isInterviewFormat(input.format)) {
    throw new TenantError("Interview format is invalid.");
  }
  if (input.scheduledAt && Number.isNaN(input.scheduledAt.getTime())) {
    throw new TenantError("Interview date is invalid.");
  }
  if (
    input.expectedDecisionAt &&
    Number.isNaN(input.expectedDecisionAt.getTime())
  ) {
    throw new TenantError("Expected decision date is invalid.");
  }
  if (input.outcome && !isInterviewStageOutcome(input.outcome)) {
    throw new TenantError("Interview outcome is invalid.");
  }
  return prisma.interviewStage.update({
    where: { id: stage.id },
    data: {
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.format ? { format: input.format as InterviewFormat } : {}),
      ...(input.notesBefore !== undefined
        ? { notesBefore: input.notesBefore?.trim() || null }
        : {}),
      ...(input.notesAfter !== undefined
        ? { notesAfter: input.notesAfter?.trim() || null }
        : {}),
      ...(input.expectedDecisionAt !== undefined
        ? { expectedDecisionAt: input.expectedDecisionAt }
        : {}),
      ...(input.outcome !== undefined
        ? {
            outcome: input.outcome
              ? (input.outcome as InterviewStageOutcome)
              : null,
          }
        : {}),
    },
  });
}

export async function setApplicationProgress(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  progress: string;
}) {
  if (!isApplicationProgress(input.progress)) {
    throw new TenantError("Application status is invalid.");
  }
  await requireOwnedCampaign(input);
  const updated = await prisma.campaign.updateMany({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      ownerUserId: input.userId,
    },
    data: { applicationProgress: input.progress as ApplicationProgress },
  });
  if (updated.count === 0) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
}

async function requireStage(input: {
  organizationId: string;
  campaignId: string;
  stageId: string;
}) {
  const stage = await prisma.interviewStage.findFirst({
    where: {
      id: input.stageId,
      campaignId: input.campaignId,
      organizationId: input.organizationId,
    },
    select: { id: true },
  });
  if (!stage) throw new TenantError("Interview stage was not found.");
  return stage;
}

async function replaceStageInterviewer(input: {
  organizationId: string;
  stageId: string;
  contactId: string;
}) {
  await prisma.interviewStageInterviewer.deleteMany({
    where: {
      stageId: input.stageId,
      contactId: { not: input.contactId },
    },
  });
  await prisma.interviewStageInterviewer.upsert({
    where: {
      stageId_contactId: {
        stageId: input.stageId,
        contactId: input.contactId,
      },
    },
    update: {},
    create: {
      organizationId: input.organizationId,
      stageId: input.stageId,
      contactId: input.contactId,
    },
  });
}

export async function enqueueInterviewerCheatSheetSection(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  contactId: string;
}) {
  const sectionKey = `contact:${input.contactId}`;
  const summary = await prisma.applicationSummary.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    select: { guidanceJson: true },
  });
  const people = Array.isArray(
    summary?.guidanceJson && typeof summary.guidanceJson === "object"
      ? (summary.guidanceJson as { people?: unknown }).people
      : null,
  )
    ? (summary!.guidanceJson as { people: Array<{ sectionKey?: string }> }).people
    : [];
  if (people.some((person) => person.sectionKey === sectionKey)) {
    return;
  }
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "APPLICATION_SUMMARY",
    targetId: sectionKey,
    initiatedByUserId: input.userId,
    payload: { userId: input.userId, sectionKey },
  });
}

export async function assignExistingInterviewStageInterviewer(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  stageId: string;
  contactId: string;
  personaId?: string | null;
}) {
  await requireOwnedCampaign(input);
  const stage = await requireStage(input);
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    select: { id: true, chosenPersonaId: true },
  });
  if (!membership) {
    throw new TenantError(
      `${vocab.contact.Singular} was not found on this ${vocab.campaign.singular}.`,
    );
  }
  const personaId = input.personaId?.trim() || membership.chosenPersonaId;
  if (!personaId) {
    throw new TenantError(`Choose ${vocab.persona.aSingular} for this interviewer.`);
  }
  if (membership.chosenPersonaId !== personaId) {
    await prisma.campaignContact.update({
      where: { id: membership.id },
      data: { chosenPersonaId: personaId, roleConfirmed: true },
    });
  }
  await replaceStageInterviewer({
    organizationId: input.organizationId,
    stageId: stage.id,
    contactId: input.contactId,
  });
  const { offerPersonPrep } = await import("@/lib/interview/person-prep");
  await offerPersonPrep({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    contactId: input.contactId,
    personaId,
  });
  await enqueueInterviewerCheatSheetSection({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    userId: input.userId,
    contactId: input.contactId,
  });
  return { contactId: input.contactId, personaId };
}

export async function addInterviewStageInterviewer(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  stageId: string;
  firstName: string;
  lastName: string;
  title: string;
  email?: string | null;
  linkedinUrl?: string | null;
  linkedInProfileText?: string | null;
  personaId?: string | null;
}) {
  await requireOwnedCampaign(input);
  const stage = await requireStage(input);
  const added = await addApplicationContact({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    userId: input.userId,
    firstName: input.firstName,
    lastName: input.lastName,
    title: input.title,
    email: input.email,
    linkedinUrl: input.linkedinUrl,
    personaId: input.personaId,
    confirmRole: true,
  });
  const pasted = input.linkedInProfileText?.trim() || "";
  if (pasted) {
    await saveLinkedInPaste({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: added.contactId,
      pastedText: pasted,
      personaId: added.personaId,
    });
  }
  await replaceStageInterviewer({
    organizationId: input.organizationId,
    stageId: stage.id,
    contactId: added.contactId,
  });
  const { offerPersonPrep } = await import("@/lib/interview/person-prep");
  await offerPersonPrep({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    contactId: added.contactId,
    personaId: input.personaId,
  });
  await enqueueInterviewerCheatSheetSection({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    userId: input.userId,
    contactId: added.contactId,
  });
  return added;
}

export function detectInterviewNoteGap(input: {
  notesAfter: string;
  assessments: Array<{ targetKey: string; text: string; strength: string }>;
  scorecardCompetencies: Array<{ id: string; text: string }>;
}): { targetKey: string; text: string } | null {
  const notes = input.notesAfter.trim();
  if (!notes) return null;
  const noteTokens = new Set(
    notes
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
  const overlap = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && noteTokens.has(token)).length;

  for (const assessment of input.assessments) {
    if (assessment.strength === "STRONG") continue;
    if (overlap(assessment.text) >= 2) {
      return { targetKey: assessment.targetKey, text: assessment.text };
    }
  }
  for (const competency of input.scorecardCompetencies) {
    if (overlap(competency.text) >= 2) {
      const existing = input.assessments.find(
        (assessment) => assessment.targetKey === competency.id,
      );
      if (!existing || existing.strength !== "STRONG") {
        return { targetKey: competency.id, text: competency.text };
      }
    }
  }
  return null;
}

export function stageTypeLabel(type: string): string {
  return type in interviewConfig.types
    ? interviewConfig.types[type as keyof typeof interviewConfig.types]
    : type;
}

import type {
  ApplicationProgress,
  InterviewFormat,
  InterviewStageOutcome,
  InterviewStageType,
} from "@prisma/client";
import { addApplicationContact } from "@/lib/application/contacts";
import { enqueueInterviewerCheatSheetSection } from "@/lib/application-summary/enqueue";
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

export function openInterviewStage<T extends { outcome: string | null }>(
  stages: T[],
): T | null {
  return stages.find((stage) => stage.outcome == null) ?? null;
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

export type StageSetupNewInterviewer = {
  firstName: string;
  lastName: string;
  title: string;
  email?: string | null;
  linkedinUrl?: string | null;
  linkedInProfileText?: string | null;
  personaId?: string | null;
};

export async function createInterviewStage(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  type: string;
  scheduledAt: Date;
  format: string;
  notesBefore?: string | null;
  expectedDecisionAt?: Date | null;
  interviewerContactIds?: string[];
  newInterviewers?: StageSetupNewInterviewer[];
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
  try {
    await assignInterviewersDuringStageSetup({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      stageId: stage.id,
      interviewerContactIds: input.interviewerContactIds ?? [],
      newInterviewers: input.newInterviewers ?? [],
    });
  } catch (error) {
    await prisma.interviewStage.delete({ where: { id: stage.id } });
    throw error;
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
  const notesBeforeNext =
    input.notesBefore !== undefined
      ? input.notesBefore?.trim() || null
      : undefined;
  const notesAfterNext =
    input.notesAfter !== undefined
      ? input.notesAfter?.trim() || null
      : undefined;
  const notesBeforeChanged =
    notesBeforeNext !== undefined && notesBeforeNext !== (stage.notesBefore ?? null);
  const notesAfterChanged =
    notesAfterNext !== undefined && notesAfterNext !== (stage.notesAfter ?? null);
  const notesTextChanged = notesBeforeChanged || notesAfterChanged;

  const updated = await prisma.interviewStage.update({
    where: { id: stage.id },
    data: {
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.format ? { format: input.format as InterviewFormat } : {}),
      ...(notesBeforeNext !== undefined ? { notesBefore: notesBeforeNext } : {}),
      ...(notesAfterNext !== undefined ? { notesAfter: notesAfterNext } : {}),
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
    include: { interviewers: { select: { contactId: true } } },
  });
  if (notesTextChanged) {
    const { enqueueInterviewerCheatSheetSection } = await import(
      "@/lib/application-summary/enqueue"
    );
    for (const interviewer of updated.interviewers) {
      await enqueueInterviewerCheatSheetSection({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        userId: input.userId,
        contactId: interviewer.contactId,
      });
    }
  }
  return { stage: updated, notesTextChanged };
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

async function attachStageInterviewer(input: {
  organizationId: string;
  stageId: string;
  contactId: string;
}) {
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
  await attachStageInterviewer(input);
}

export { enqueueInterviewerCheatSheetSection } from "@/lib/application-summary/enqueue";

export async function assignExistingInterviewStageInterviewer(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  stageId: string;
  contactId: string;
  personaId?: string | null;
  /** Setup can assign several people. The saved-stage control still replaces. */
  keepOtherInterviewers?: boolean;
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
  // Assign-only (Batch B3): prep / cheat-sheet / profile / persona build start on Harper.
  if (input.keepOtherInterviewers) {
    await attachStageInterviewer({
      organizationId: input.organizationId,
      stageId: stage.id,
      contactId: input.contactId,
    });
  } else {
    await replaceStageInterviewer({
      organizationId: input.organizationId,
      stageId: stage.id,
      contactId: input.contactId,
    });
  }
  return { contactId: input.contactId, personaId };
}

/**
 * Optional interviewers chosen on the create-stage form. Assignment only:
 * no interviewer prep, no cheat-sheet enqueue, no profile job.
 */
export async function assignInterviewersDuringStageSetup(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  stageId: string;
  interviewerContactIds: string[];
  newInterviewers: StageSetupNewInterviewer[];
}) {
  const contactIds: string[] = [];
  for (const contactId of input.interviewerContactIds) {
    const id = contactId.trim();
    if (id && !contactIds.includes(id)) contactIds.push(id);
  }
  for (const person of input.newInterviewers) {
    const added = await addApplicationContact({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      firstName: person.firstName,
      lastName: person.lastName,
      title: person.title,
      email: person.email,
      linkedinUrl: person.linkedinUrl,
      personaId: person.personaId,
      confirmRole: true,
    });
    const pasted = person.linkedInProfileText?.trim() || "";
    if (pasted) {
      await prisma.campaignContact.update({
        where: { id: added.campaignContactId },
        data: { linkedInProfileText: pasted },
      });
    }
    if (!contactIds.includes(added.contactId)) contactIds.push(added.contactId);
  }
  for (const contactId of contactIds) {
    await assignExistingInterviewStageInterviewer({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      stageId: input.stageId,
      contactId,
      keepOtherInterviewers: true,
    });
  }
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
  if (!pasted) {
    await enqueueInterviewerCheatSheetSection({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      contactId: added.contactId,
    });
  }
  return added;
}

/**
 * Harper "Add Interview Contact": create the campaign contact and start prep
 * through the same seeker paths as Stage add-interviewer, without assigning a stage.
 */
export async function addInterviewContact(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  firstName: string;
  lastName: string;
  title: string;
  email?: string | null;
  linkedinUrl?: string | null;
  linkedInProfileText?: string | null;
  personaId?: string | null;
}) {
  await requireOwnedCampaign(input);
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
  const { offerPersonPrep } = await import("@/lib/interview/person-prep");
  await offerPersonPrep({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    contactId: added.contactId,
    personaId: input.personaId,
  });
  if (!pasted) {
    await enqueueInterviewerCheatSheetSection({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      contactId: added.contactId,
    });
  }
  return added;
}

/**
 * Harper start-prep for an existing contact (offerPersonPrep + cheat-sheet section).
 * Used when prep has not been started yet (`personPrepOfferedAt` unset).
 */
export async function startPersonPrepForContact(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  contactId: string;
  personaId?: string | null;
}) {
  await requireOwnedCampaign(input);
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    select: { id: true, chosenPersonaId: true, personPrepOfferedAt: true },
  });
  if (!membership) {
    throw new TenantError(
      `${vocab.contact.Singular} was not found on this ${vocab.campaign.singular}.`,
    );
  }
  if (membership.personPrepOfferedAt) {
    return { contactId: input.contactId, alreadyStarted: true as const };
  }
  const personaId = input.personaId?.trim() || membership.chosenPersonaId;
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
  return { contactId: input.contactId, alreadyStarted: false as const };
}

export function stageTypeLabel(type: string): string {
  return type in interviewConfig.types
    ? interviewConfig.types[type as keyof typeof interviewConfig.types]
    : type;
}

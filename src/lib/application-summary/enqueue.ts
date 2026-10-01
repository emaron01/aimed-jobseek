import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { prisma } from "@/lib/prisma-client";
import { personSectionNeedsGeneration } from "@/lib/application-summary/people";

export async function enqueueCheatSheetPersonSection(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  userId?: string | null;
}): Promise<string | null> {
  const sectionKey = `contact:${input.contactId}`;
  try {
    const { personSectionInputsUnchanged } = await import(
      "@/lib/application-summary/service"
    );
    if (
      await personSectionInputsUnchanged({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        sectionKey,
      })
    ) {
      return null;
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "cheat_sheet_input_hash_check_failed",
        campaignId: input.campaignId,
        contactId: input.contactId,
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
  }
  const job = await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "APPLICATION_SUMMARY",
    targetId: sectionKey,
    initiatedByUserId: input.userId ?? null,
    payload: {
      userId: input.userId ?? undefined,
      sectionKey,
    },
  });
  return job.id;
}

export async function enqueueInterviewerCheatSheetSection(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  contactId: string;
}): Promise<string | null> {
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    select: { chosenPersonaId: true },
  });
  if (!membership?.chosenPersonaId) return null;
  return enqueueCheatSheetPersonSection(input);
}

export async function enqueueCheatSheetSectionsForPersona(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
  userId?: string | null;
}): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { ownerUserId: true },
  });
  if (!campaign) return;
  const userId = input.userId ?? campaign.ownerUserId;
  const memberships = await prisma.campaignContact.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      chosenPersonaId: input.personaId,
    },
    select: { contactId: true, personPrepOfferedAt: true },
  });
  const stageInterviewers = await prisma.interviewStageInterviewer.findMany({
    where: {
      organizationId: input.organizationId,
      contactId: { in: memberships.map((row) => row.contactId) },
      stage: { campaignId: input.campaignId },
    },
    select: { contactId: true },
  });
  const interviewerIds = new Set(stageInterviewers.map((row) => row.contactId));
  for (const row of memberships) {
    if (row.personPrepOfferedAt) interviewerIds.add(row.contactId);
  }
  for (const contactId of interviewerIds) {
    await enqueueCheatSheetPersonSection({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId,
      userId,
    });
  }
}

export async function enqueueMissingInterviewerCheatSheetSections(input: {
  organizationId: string;
  campaignId: string;
  userId?: string | null;
  people: Array<{
    contactId: string | null;
    personaBuilt: boolean;
    sectionKey: string;
  }>;
  existingPeople: Array<{
    sectionKey: string;
    positioningStatements?: Array<unknown>;
    keyStatements?: Array<unknown>;
    caresAbout?: Array<unknown>;
    likelyQuestions?: Array<unknown>;
    questionsToAsk?: Array<unknown>;
  }>;
}): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { ownerUserId: true },
  });
  if (!campaign) return;
  const userId = input.userId ?? campaign.ownerUserId;
  for (const person of input.people) {
    if (!person.contactId || !person.personaBuilt) continue;
    const existing = input.existingPeople.find(
      (item) => item.sectionKey === person.sectionKey,
    );
    if (!personSectionNeedsGeneration(existing ?? null)) continue;
    await enqueueCheatSheetPersonSection({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: person.contactId,
      userId,
    });
  }
}

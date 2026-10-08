import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import {
  assignApplicationContactToPersona,
  matchHiringTeamRoleFromTitle,
} from "@/lib/application/contacts";
import { isHiringTeamPersonaBuilt } from "@/lib/hiring-team/build";
import { prisma } from "@/lib/prisma-client";
import { vocab } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

/**
 * One click path for "Create Interview Prep Guide" and "Update Interview Prep Guide".
 * Matches this person to this application's persona, then queues the cheat-sheet
 * person section. The worker runs the full persona build first when that persona
 * is not already fully built, then writes the guide. Unchanged inputs queue nothing.
 */
export async function queueInterviewPrepGuide(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  contactId: string;
  personaId?: string | null;
}): Promise<{
  jobId: string | null;
  unchanged: boolean;
  needsPersonaChoice: boolean;
}> {
  const contactId = input.contactId.trim();
  if (!contactId) throw new TenantError("Choose a person first.");

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      ownerUserId: input.userId,
    },
    select: { id: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }

  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId,
    },
    select: {
      chosenPersonaId: true,
      contact: { select: { title: true } },
    },
  });
  if (!membership) {
    throw new TenantError(
      `${vocab.contact.Singular} was not found on this ${vocab.campaign.singular}.`,
    );
  }

  const requestedPersonaId = input.personaId?.trim() || null;
  let personaId = requestedPersonaId ?? membership.chosenPersonaId;
  if (!personaId) {
    const roles = await prisma.persona.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        archivedAt: null,
      },
      select: { id: true, name: true, suggestionKey: true, targetTitles: true },
      orderBy: { createdAt: "asc" },
    });
    const matched = matchHiringTeamRoleFromTitle({
      title: membership.contact.title,
      roles,
    });
    if (!matched.personaId) {
      return { jobId: null, unchanged: false, needsPersonaChoice: true };
    }
    personaId = matched.personaId;
  }
  if (personaId !== membership.chosenPersonaId) {
    await assignApplicationContactToPersona({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      contactId,
      personaId,
    });
  }

  const persona = await prisma.persona.findFirst({
    where: {
      id: personaId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    select: { id: true, profileJson: true },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} was not found.`);
  }

  const sectionKey = `contact:${contactId}`;
  if (isHiringTeamPersonaBuilt(persona)) {
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
      return { jobId: null, unchanged: true, needsPersonaChoice: false };
    }
  }

  const job = await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "APPLICATION_SUMMARY",
    targetId: sectionKey,
    initiatedByUserId: input.userId,
    payload: { userId: input.userId, sectionKey },
  });
  return { jobId: job.id, unchanged: false, needsPersonaChoice: false };
}

/** True when this person still needs the existing Hiring Team role dropdown. */
export function interviewPrepGuideNeedsPersonaChoice(input: {
  chosenPersonaId: string | null;
  title: string | null;
  roles: Array<{
    id: string;
    name: string;
    suggestionKey: string | null;
    targetTitles: unknown;
  }>;
}): boolean {
  if (input.chosenPersonaId) return false;
  return !matchHiringTeamRoleFromTitle({
    title: input.title,
    roles: input.roles,
  }).personaId;
}

/**
 * Full persona build for this application's role, only when it is not already built.
 * The guide model runs after this returns.
 */
export async function prepareInterviewPrepGuideGeneration(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
  personaBuilt: boolean;
}): Promise<void> {
  if (input.personaBuilt) return;
  const { rebuildApplicationHiringTeamRole } = await import(
    "@/lib/hiring-team/build"
  );
  await rebuildApplicationHiringTeamRole({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    personaId: input.personaId,
  });
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    select: { profileJson: true },
  });
  if (!isHiringTeamPersonaBuilt(persona ?? {})) {
    throw new Error("Hiring team persona has no narrative after the full build.");
  }
}

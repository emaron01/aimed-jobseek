import { enqueuePersonaCheatSheetSection } from "@/lib/application-summary/enqueue";
import { personaCheatSheetSectionKey } from "@/lib/application-summary/people";
import { applicationSummaryGuidanceSchema } from "@/lib/application-summary/contract";
import {
  hiringTeamSynthesizeUnchanged,
  queueHiringTeamBuild,
} from "@/lib/hiring-team/build";
import { prisma } from "@/lib/prisma-client";
import { vocab } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

export async function personaCheatSheetSectionExists(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
}): Promise<boolean> {
  const summary = await prisma.applicationSummary.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    select: { guidanceJson: true },
  });
  const parsed = applicationSummaryGuidanceSchema.safeParse(summary?.guidanceJson);
  if (!parsed.success) return false;
  const sectionKey = personaCheatSheetSectionKey(input.personaId);
  return parsed.data.people.some((person) => person.sectionKey === sectionKey);
}

export type AddPersonaToCheatSheetResult = {
  kind: "stored" | "build" | "section";
  jobId: string | null;
};

/**
 * First add with no stored role section builds only when the synthesize
 * fingerprint changed, then writes the section once. A later add only shows
 * the stored section.
 */
export async function addPersonaToCheatSheet(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
  userId: string;
}): Promise<AddPersonaToCheatSheetResult> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} was not found.`);
  }
  const stored = await personaCheatSheetSectionExists(input);
  await prisma.persona.update({
    where: { id: persona.id },
    data: { cheatSheetActivatedAt: new Date() },
  });
  if (stored) {
    return { kind: "stored", jobId: null };
  }
  const skip = await hiringTeamSynthesizeUnchanged({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    personaId: input.personaId,
  });
  if (!skip.unchanged) {
    const job = await queueHiringTeamBuild({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      personaId: input.personaId,
      initiatedByUserId: input.userId,
      deferCheatSheetSection: true,
    });
    return { kind: "build", jobId: job.id };
  }
  const jobId = await enqueuePersonaCheatSheetSection({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    personaId: input.personaId,
    userId: input.userId,
  });
  return { kind: "section", jobId };
}

export async function removePersonaFromCheatSheet(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
}): Promise<void> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} was not found.`);
  }
  await prisma.persona.update({
    where: { id: persona.id },
    data: { cheatSheetActivatedAt: null },
  });
}

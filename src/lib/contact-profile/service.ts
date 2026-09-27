import { Prisma } from "@prisma/client";
import { matchHiringTeamRoleFromTitle } from "@/lib/application/contacts";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { commonGroundFromProfiles } from "@/lib/contact-profile/common-ground";
import {
  CONTACT_PROFILE_PROMPT_VERSION,
  individualProfileRecordSchema,
  linkedInExtractedSchema,
  type IndividualProfileRecord,
  type LinkedInExtracted,
} from "@/lib/contact-profile/contract";
import { generateIndividualProfileWithModel } from "@/lib/contact-profile/ai";
import { extractInterviewerFacts } from "@/lib/contact-profile/extract";
import { isHiringTeamPersonaBuilt } from "@/lib/hiring-team/build";
import { prisma } from "@/lib/prisma-client";
import { outreachConfig, vocab } from "@/lib/product-config";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import { TenantError } from "@/lib/tenant/errors";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function parseLinkedInExtracted(value: unknown): LinkedInExtracted | null {
  const parsed = linkedInExtractedSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseIndividualProfile(value: unknown): IndividualProfileRecord | null {
  const parsed = individualProfileRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function saveLinkedInPaste(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  pastedText: string;
  personaId?: string | null;
}): Promise<{ suggestedPersonaId: string | null }> {
  const text = input.pastedText.trim();
  if (!text) throw new TenantError(outreachConfig.labels.pasteProfileRequired);
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    include: { contact: true },
  });
  if (!membership) {
    throw new TenantError(
      `${vocab.contact.Singular} was not found on this ${vocab.campaign.singular}.`,
    );
  }
  const override = input.personaId?.trim() || null;
  const nextPersonaId =
    override ?? (await matchedPersonaId(input, membership.contact.title));
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: {
      linkedInProfileText: text,
      linkedInExtractedJson: Prisma.DbNull,
      individualProfileJson: Prisma.DbNull,
      individualProfileStatus: "PENDING",
      individualProfileError: null,
      chosenPersonaId: nextPersonaId,
    },
  });
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "CONTACT_PROFILE",
    targetId: membership.contactId,
  });
  const { enqueueInterviewerCheatSheetSection } = await import(
    "@/lib/application-summary/enqueue"
  );
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { ownerUserId: true },
  });
  if (campaign) {
    await enqueueInterviewerCheatSheetSection({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: campaign.ownerUserId,
      contactId: input.contactId,
    });
  }
  return { suggestedPersonaId: nextPersonaId };
}

/**
 * The pasted text can name a newer title than the contact row carries. Keep the
 * previous title for the audit trail, and only re-match the Hiring Team role
 * when the seeker has not confirmed one.
 */
async function applyExtractedTitle(input: {
  organizationId: string;
  campaignId: string;
  membershipId: string;
  contactId: string;
  currentTitle: string | null;
  extractedTitle: string | null;
  roleConfirmed: boolean;
}): Promise<void> {
  const title = input.extractedTitle?.trim();
  if (!title || title === input.currentTitle) return;
  await prisma.contact.update({
    where: { id: input.contactId },
    data: {
      previousTitle: input.currentTitle,
      title,
      titleChangedAt: new Date(),
    },
  });
  if (input.roleConfirmed) return;
  const personaId = await matchedPersonaId(input, title);
  if (!personaId) return;
  await prisma.campaignContact.update({
    where: { id: input.membershipId },
    data: { chosenPersonaId: personaId },
  });
}

async function matchedPersonaId(
  scope: { organizationId: string; campaignId: string },
  title: string | null,
): Promise<string | null> {
  const roles = await prisma.persona.findMany({
    where: {
      organizationId: scope.organizationId,
      campaignId: scope.campaignId,
      archivedAt: null,
    },
    select: { id: true, name: true, suggestionKey: true, targetTitles: true },
  });
  const matched = matchHiringTeamRoleFromTitle({ title, roles });
  return matched.personaId ?? matched.suggestedPersonaId;
}

export async function queueIndividualProfileBuild(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
}): Promise<void> {
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
  });
  if (!membership?.linkedInProfileText) {
    throw new TenantError(outreachConfig.labels.pasteProfileRequired);
  }
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: {
      individualProfileStatus: "PENDING",
      individualProfileError: null,
    },
  });
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "CONTACT_PROFILE",
    targetId: input.contactId,
  });
}

export async function buildContactIndividualProfile(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
}): Promise<void> {
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    include: {
      contact: true,
      chosenPersona: true,
      campaign: { include: { product: { select: { profileJson: true } } } },
    },
  });
  if (!membership?.linkedInProfileText) {
    throw new TenantError(outreachConfig.labels.pasteProfileRequired);
  }
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: { individualProfileStatus: "IN_PROGRESS" },
  });
  const contactName = [membership.contact.firstName, membership.contact.lastName]
    .filter(Boolean)
    .join(" ");
  const read = await extractInterviewerFacts({
    pastedText: membership.linkedInProfileText,
    contactName,
    usage: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
      category: "PERSONA_RESEARCH",
      operation: "CONTACT_PROFILE",
    },
  });
  if (!read.ok) {
    await prisma.campaignContact.update({
      where: { id: membership.id },
      data: {
        individualProfileStatus: "FAILED",
        individualProfileError: read.message,
      },
    });
    throw new Error(read.message);
  }
  const extracted = read.data;
  await applyExtractedTitle({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    membershipId: membership.id,
    contactId: membership.contactId,
    currentTitle: membership.contact.title,
    extractedTitle: extracted.currentTitle?.text ?? null,
    roleConfirmed: membership.roleConfirmed,
  });
  const profile = parseCandidateProfileSafe(membership.campaign.product.profileJson);
  const commonGround = profile.ok
    ? commonGroundFromProfiles({ extracted, profile: profile.profile })
    : [];
  const role = membership.chosenPersona;
  const narrative =
    role && isHiringTeamPersonaBuilt(role)
      ? (role.profileJson as { narrative?: unknown }).narrative ?? null
      : null;
  const generated = await generateIndividualProfileWithModel({
    contactName,
    extracted,
    profileText: membership.linkedInProfileText,
    roleName: role?.name ?? null,
    roleNarrative: narrative,
    usage: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
      category: "PERSONA_RESEARCH",
      operation: "CONTACT_PROFILE",
    },
  });
  if (!generated.ok) {
    await prisma.campaignContact.update({
      where: { id: membership.id },
      data: {
        individualProfileStatus: "FAILED",
        individualProfileError: generated.message,
      },
    });
    throw new Error(generated.message);
  }
  const record = individualProfileRecordSchema.parse({
    ...generated.data,
    commonGround,
    promptVersion: CONTACT_PROFILE_PROMPT_VERSION,
  });
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: {
      linkedInExtractedJson: jsonValue(extracted),
      individualProfileJson: jsonValue(record),
      individualProfileStatus: "COMPLETED",
      individualProfileError: null,
    },
  });
}

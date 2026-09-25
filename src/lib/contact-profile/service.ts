import type { Prisma } from "@prisma/client";
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
import { extractLinkedInFacts } from "@/lib/contact-profile/extract";
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
}): Promise<{ extracted: LinkedInExtracted; suggestedPersonaId: string | null }> {
  const text = input.pastedText.trim();
  if (!text) throw new TenantError("Paste the LinkedIn profile text.");
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
  const extracted = extractLinkedInFacts(text);
  const title = extracted.currentTitle?.text ?? membership.contact.title;
  if (extracted.currentTitle?.text && extracted.currentTitle.text !== membership.contact.title) {
    await prisma.contact.update({
      where: { id: membership.contactId },
      data: {
        previousTitle: membership.contact.title,
        title: extracted.currentTitle.text,
        titleChangedAt: new Date(),
      },
    });
  }
  const roles = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    select: { id: true, name: true, suggestionKey: true, targetTitles: true },
  });
  const matched = matchHiringTeamRoleFromTitle({ title, roles });
  const override = input.personaId?.trim() || null;
  const nextPersonaId = override ?? matched.personaId ?? matched.suggestedPersonaId;
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: {
      linkedInProfileText: text,
      linkedInExtractedJson: jsonValue(extracted),
      individualProfileJson: undefined,
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
  return { extracted, suggestedPersonaId: nextPersonaId };
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
    throw new TenantError(outreachConfig.labels.pasteLinkedInHelp);
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
    throw new TenantError(outreachConfig.labels.pasteLinkedInHelp);
  }
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: { individualProfileStatus: "IN_PROGRESS" },
  });
  const extracted =
    parseLinkedInExtracted(membership.linkedInExtractedJson) ??
    extractLinkedInFacts(membership.linkedInProfileText);
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
    contactName: [membership.contact.firstName, membership.contact.lastName]
      .filter(Boolean)
      .join(" "),
    extracted,
    roleName: role?.name ?? null,
    roleNarrative: narrative,
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

import type { Prisma } from "@prisma/client";
import { resolveContactPersonaDecision } from "@/lib/campaign/contact-persona";
import { prisma } from "@/lib/prisma";
import { normalizeContactEmail } from "@/lib/contact/identity";
import type { NamedJobContact } from "@/lib/job-requirement/types";
import { vocab } from "@/lib/product-config";
import { parseStringArray } from "@/lib/research";
import { evaluatePersonaTitleGate } from "@/lib/scoring/title-fit";
import { TenantError } from "@/lib/tenant/errors";

export type ApplicationHiringTeamRole = {
  id: string;
  name: string;
  suggestionKey: string | null;
  targetTitles: unknown;
};

export function matchHiringTeamRoleFromTitle(input: {
  title: string | null;
  roles: ApplicationHiringTeamRole[];
}): ReturnType<typeof resolveContactPersonaDecision> {
  const snapshots = input.roles.map((role) => ({
    id: role.id,
    name: role.name,
    targetTitles: parseStringArray(role.targetTitles),
    criteria: [],
  }));
  const gates = snapshots.map((persona) =>
    evaluatePersonaTitleGate({
      persona,
      contactTitle: input.title,
      applyPositiveFit: true,
    }),
  );
  const candidates = gates.filter((gate) => gate.status === "CANDIDATE");
  const recruiter = input.roles.find((role) => role.suggestionKey === "recruiter");
  if (candidates.length === 1) {
    return resolveContactPersonaDecision({
      matchedPersonaId: candidates[0]!.personaId,
    });
  }
  if (candidates.length > 1) {
    const recruiterCandidate = candidates.find(
      (gate) => gate.personaId === recruiter?.id,
    );
    return resolveContactPersonaDecision({
      aiSkipReason: "MULTI_PERSONA_MATCH",
      suggestedPersonaId:
        recruiterCandidate?.personaId ?? candidates[0]!.personaId,
    });
  }
  return resolveContactPersonaDecision({
    aiSkipReason: input.title?.trim() ? "NO_TITLE_FIT" : "NO_TITLE_FIT",
    suggestedPersonaId: recruiter?.id ?? input.roles[0]?.id ?? null,
  });
}

async function hiringTeamRoles(
  organizationId: string,
  campaignId: string,
): Promise<ApplicationHiringTeamRole[]> {
  return prisma.persona.findMany({
    where: { organizationId, campaignId, archivedAt: null },
    select: {
      id: true,
      name: true,
      suggestionKey: true,
      targetTitles: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function addApplicationContact(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  firstName: string;
  lastName: string;
  title: string;
  email?: string | null;
  linkedinUrl?: string | null;
  phone?: string | null;
  personaId?: string | null;
  source?: "SEEKER" | "POSTING";
}): Promise<{
  contactId: string;
  campaignContactId: string;
  personaId: string | null;
  decision: ReturnType<typeof resolveContactPersonaDecision>;
}> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const title = input.title.trim();
  if (!firstName) throw new TenantError("First name is required.");
  if (!lastName) throw new TenantError("Last name is required.");
  if (!title && input.source !== "POSTING") {
    throw new TenantError("Title is required.");
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      ownerUserId: input.userId,
    },
    select: { id: true, ownerUserId: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }

  const roles = await hiringTeamRoles(input.organizationId, input.campaignId);
  const override = input.personaId?.trim() || null;
  if (override && !roles.some((role) => role.id === override)) {
    throw new TenantError(
      `That ${vocab.persona.singular} does not belong to this ${vocab.campaign.singular}.`,
    );
  }
  const matched = matchHiringTeamRoleFromTitle({ title, roles });
  const decision = resolveContactPersonaDecision({
    overridePersonaId: override,
    matchedPersonaId: matched.personaId,
    suggestedPersonaId: matched.suggestedPersonaId,
    aiSkipReason: matched.decisionReason ? undefined : matched.source === "none"
      ? "NO_TITLE_FIT"
      : undefined,
  });
  const chosenPersonaId = decision.personaId ?? override ?? matched.personaId;

  const email = input.email?.trim() || null;
  const normalizedEmail = email ? normalizeContactEmail(email) : null;
  const linkedinUrl = input.linkedinUrl?.trim() || null;
  const phone = input.phone?.trim() || null;

  const result = await prisma.$transaction(async (tx) => {
    let contactId: string | null = null;
    if (normalizedEmail) {
      const existing = await tx.contact.findFirst({
        where: {
          organizationId: input.organizationId,
          ownerUserId: campaign.ownerUserId,
          normalizedEmail,
        },
        select: { id: true },
      });
      if (existing) {
        contactId = existing.id;
        await tx.contact.update({
          where: { id: existing.id },
          data: {
            firstName,
            lastName,
            title,
            email,
            linkedinUrl: linkedinUrl ?? undefined,
            phone: phone ?? undefined,
            archivedAt: null,
            archiveReason: null,
          },
        });
      }
    }
    if (!contactId) {
      const created = await tx.contact.create({
        data: {
          organizationId: input.organizationId,
          ownerUserId: campaign.ownerUserId,
          createdByUserId: input.userId,
          firstName,
          lastName,
          title,
          email,
          normalizedEmail,
          linkedinUrl,
          phone,
          company: null,
          rawData: {
            source: input.source ?? "SEEKER",
          } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      contactId = created.id;
    }

    const existingMembership = await tx.campaignContact.findFirst({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        contactId,
      },
      select: { id: true },
    });
    if (existingMembership) {
      await tx.campaignContact.update({
        where: { id: existingMembership.id },
        data: { chosenPersonaId, selected: true },
      });
      return { contactId, campaignContactId: existingMembership.id };
    }
    const membership = await tx.campaignContact.create({
      data: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        contactId,
        chosenPersonaId,
        selected: true,
      },
      select: { id: true },
    });
    return { contactId, campaignContactId: membership.id };
  });

  return {
    contactId: result.contactId,
    campaignContactId: result.campaignContactId,
    personaId: chosenPersonaId,
    decision,
  };
}

export async function updateApplicationContactRole(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  contactId: string;
  personaId: string;
}): Promise<void> {
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
  const roles = await hiringTeamRoles(input.organizationId, input.campaignId);
  if (!roles.some((role) => role.id === input.personaId)) {
    throw new TenantError(
      `That ${vocab.persona.singular} does not belong to this ${vocab.campaign.singular}.`,
    );
  }
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    select: { id: true },
  });
  if (!membership) {
    throw new TenantError(`${vocab.contact.Singular} was not found on this ${vocab.campaign.singular}.`);
  }
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: { chosenPersonaId: input.personaId },
  });
}

export async function ingestNamedJobContacts(input: {
  organizationId: string;
  campaignId: string;
  namedContacts: NamedJobContact[];
  companyName: string | null;
}): Promise<number> {
  if (input.namedContacts.length === 0) return 0;
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { ownerUserId: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  let added = 0;
  for (const named of input.namedContacts) {
    const firstName = named.firstName?.trim() ?? "";
    const lastName = named.lastName?.trim() ?? "";
    if (!firstName || !lastName) continue;
    await addApplicationContact({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: campaign.ownerUserId,
      firstName,
      lastName,
      title: named.title?.trim() ?? "",
      email: named.email,
      phone: named.phone,
      source: "POSTING",
    });
    if (input.companyName?.trim()) {
      const normalizedEmail = named.email
        ? normalizeContactEmail(named.email)
        : null;
      await prisma.contact.updateMany({
        where: {
          organizationId: input.organizationId,
          ownerUserId: campaign.ownerUserId,
          ...(normalizedEmail
            ? { normalizedEmail }
            : { firstName, lastName, title: named.title }),
        },
        data: { company: input.companyName.trim() },
      });
    }
    added += 1;
  }
  return added;
}

export async function listApplicationContacts(input: {
  organizationId: string;
  campaignId: string;
}) {
  return prisma.campaignContact.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
    },
    include: {
      contact: true,
      chosenPersona: {
        select: { id: true, name: true, suggestionKey: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

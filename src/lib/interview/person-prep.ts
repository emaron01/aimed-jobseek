import { Prisma } from "@prisma/client";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { PERSON_PREP_TARGET_PREFIX } from "@/lib/consultation/contract";
import { prisma } from "@/lib/prisma-client";
import { consultationConfig, interviewConfig } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

export type PersonPrepAnswer = {
  text: string;
  turnId: string;
};

export type PersonPrepView = {
  contactId: string;
  personaId: string | null;
  name: string;
  title: string | null;
  roleName: string | null;
  status: "OFFERED" | "IN_PROGRESS" | "READY";
  openingText: string | null;
  confirmedAnswers: PersonPrepAnswer[];
};

function parseAnswers(value: unknown): PersonPrepAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? row.text.trim() : "";
    const turnId = typeof row.turnId === "string" ? row.turnId.trim() : "";
    return text && turnId ? [{ text, turnId }] : [];
  });
}

export function personPrepTargetKey(contactId: string): string {
  return `${PERSON_PREP_TARGET_PREFIX}${contactId}`;
}

export function contactIdFromPersonPrepTarget(targetKey: string | null | undefined): string | null {
  const key = targetKey?.trim() ?? "";
  if (!key.startsWith(PERSON_PREP_TARGET_PREFIX)) return null;
  const contactId = key.slice(PERSON_PREP_TARGET_PREFIX.length).trim();
  return contactId || null;
}

export async function offerPersonPrep(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  personaId?: string | null;
}): Promise<void> {
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    include: {
      contact: { select: { firstName: true, lastName: true, title: true } },
      chosenPersona: { select: { name: true } },
    },
  });
  if (!membership) {
    throw new TenantError("That person was not found on this application.");
  }
  if (!membership.personPrepOfferedAt) {
    await prisma.campaignContact.update({
      where: { id: membership.id },
      data: {
        personPrepStatus: "OFFERED",
        personPrepOfferedAt: new Date(),
        chosenPersonaId: input.personaId ?? membership.chosenPersonaId,
      },
    });
  }
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "CONSULTATION",
    targetId: input.contactId,
    payload: {
      operation: "person_prep",
      contactId: input.contactId,
    },
  });
}

export async function personPrepFocus(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
}): Promise<{ focusTargetKey: string; focusNote: string }> {
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    include: {
      contact: { select: { firstName: true, lastName: true, title: true } },
      chosenPersona: { select: { name: true } },
    },
  });
  if (!membership) {
    throw new TenantError("That person was not found on this application.");
  }
  const name = [membership.contact.firstName, membership.contact.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const roleName = membership.chosenPersona?.name ?? membership.contact.title ?? "this interviewer";
  return {
    focusTargetKey: personPrepTargetKey(input.contactId),
    focusNote: `${consultationConfig.displayName} prepares the seeker for ${name || "this interviewer"} (${roleName}). Cover what they will likely probe, which of the seeker's stories fit, and one or two questions that strengthen weak spots for this interviewer.`,
  };
}

export async function recordPersonPrepOpening(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  openingText: string | null;
}): Promise<void> {
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    select: { id: true },
  });
  if (!membership) {
    throw new TenantError("That person was not found on this application.");
  }
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: {
      personPrepStatus: "IN_PROGRESS",
      personPrepOpening:
        input.openingText?.trim() || interviewConfig.labels.personPrepFallbackOpening,
    },
  });
}

export async function appendPersonPrepAnswer(input: {
  organizationId: string;
  campaignId: string;
  contactId: string;
  text: string;
  turnId: string;
}): Promise<void> {
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    select: { id: true, personPrepAnswersJson: true },
  });
  if (!membership) return;
  const answers = parseAnswers(membership.personPrepAnswersJson);
  if (answers.some((item) => item.turnId === input.turnId && item.text === input.text.trim())) {
    return;
  }
  answers.push({ text: input.text.trim(), turnId: input.turnId });
  await prisma.campaignContact.update({
    where: { id: membership.id },
    data: {
      personPrepStatus: "READY",
      personPrepAnswersJson: answers as Prisma.InputJsonValue,
    },
  });
}

export async function listPersonPreps(input: {
  organizationId: string;
  campaignId: string;
}): Promise<PersonPrepView[]> {
  const rows = await prisma.campaignContact.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      personPrepOfferedAt: { not: null },
    },
    include: {
      contact: { select: { firstName: true, lastName: true, title: true } },
      chosenPersona: { select: { name: true } },
    },
    orderBy: { personPrepOfferedAt: "asc" },
  });
  return rows.map((row) => ({
    contactId: row.contactId,
    personaId: row.chosenPersonaId,
    name: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ").trim(),
    title: row.contact.title,
    roleName: row.chosenPersona?.name ?? null,
    status: (row.personPrepStatus === "READY" || row.personPrepStatus === "IN_PROGRESS"
      ? row.personPrepStatus
      : "OFFERED") as PersonPrepView["status"],
    openingText: row.personPrepOpening,
    confirmedAnswers: parseAnswers(row.personPrepAnswersJson),
  }));
}

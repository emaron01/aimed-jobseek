import { addApplicationContact } from "@/lib/application/contacts";
import {
  CREATE_ROLE_FROM_TITLE,
  matchHiringTeamRoleFromTitle,
} from "@/lib/application/role-title-match";
import { addApplicationHiringTeamRole } from "@/lib/hiring-team/build";
import { queueInterviewPrepGuide } from "@/lib/interview/prep-guide";
import { createInterviewStage } from "@/lib/interview/stages";
import { prisma } from "@/lib/prisma-client";
import {
  interviewConfig,
  interviewStageTypeForRole,
  isInterviewFormat,
  isInterviewStageType,
} from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

export { CREATE_ROLE_FROM_TITLE, interviewStageTypeForRole };

const inflight = new Map<string, Promise<NewInterviewResult>>();

export type NewInterviewResult = {
  contactId: string;
  sectionKey: string;
  stageId: string | null;
  jobId: string | null;
  displayName: string;
};

export function splitInterviewName(value: string): {
  firstName: string;
  lastName: string;
} {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

export function interviewDisplayName(input: {
  name: string;
  title: string;
}): string {
  const name = input.name.trim();
  if (name) return name;
  return input.title.trim();
}

/** A stage is written only when date, time, and format are all present. */
export function interviewScheduleIsComplete(input: {
  scheduledAt: string;
  format: string;
}): boolean {
  return Boolean(input.scheduledAt.trim() && input.format.trim());
}

export function chosenInterviewStageType(input: {
  requested: string | null | undefined;
  roleName: string;
  title: string;
}): ReturnType<typeof interviewStageTypeForRole> | "HIRING_MANAGER" | "PANEL_COMPETENCY" | "EXECUTIVE" {
  const requested = input.requested?.trim() ?? "";
  if (!requested) {
    return interviewStageTypeForRole({
      roleName: input.roleName,
      title: input.title,
    });
  }
  if (!isInterviewStageType(requested)) {
    throw new TenantError("Interview stage type is invalid.");
  }
  return requested;
}

export async function buildNewInterviewPrep(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  title: string;
  name: string;
  scheduledAt?: string | null;
  format?: string | null;
  personaId?: string | null;
  contactId?: string | null;
  stageType?: string | null;
}): Promise<NewInterviewResult> {
  const title = input.title.trim();
  const name = input.name.trim();
  const contactId = input.contactId?.trim() ?? "";
  if (!contactId && !title) throw new TenantError("Title is required.");
  const key = [
    input.organizationId,
    input.campaignId,
    input.userId,
    contactId,
    title.toLowerCase(),
    name.toLowerCase(),
    input.scheduledAt?.trim() ?? "",
    input.format?.trim() ?? "",
    input.personaId?.trim() ?? "",
    input.stageType?.trim() ?? "",
  ].join("|");
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = buildNewInterviewPrepOnce({ ...input, title, name }).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, run);
  return run;
}

async function buildNewInterviewPrepOnce(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  title: string;
  name: string;
  scheduledAt?: string | null;
  format?: string | null;
  personaId?: string | null;
  contactId?: string | null;
  stageType?: string | null;
}): Promise<NewInterviewResult> {
  const scheduledAt = input.scheduledAt?.trim() ?? "";
  const format = input.format?.trim() ?? "";
  const existingContactId = input.contactId?.trim() || null;
  if (existingContactId) {
    return buildInterviewForExistingPerson({
      ...input,
      contactId: existingContactId,
      scheduledAt,
      format,
    });
  }
  const { firstName, lastName } = splitInterviewName(input.name);
  const roles = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    select: { id: true, name: true, suggestionKey: true, targetTitles: true },
    orderBy: { createdAt: "asc" },
  });
  const matched = matchHiringTeamRoleFromTitle({ title: input.title, roles });
  const requested = input.personaId?.trim() || null;
  let personaId = matched.personaId;
  if (requested === CREATE_ROLE_FROM_TITLE) {
    const created = await addApplicationHiringTeamRole({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      name: input.title,
      likelyTitles: [input.title],
      department: null,
      whyThisRoleMatters: null,
      notes: null,
    });
    personaId = created.personaId;
  } else if (requested) {
    personaId = requested;
  }
  if (!personaId) throw new TenantError(interviewConfig.labels.chooseRole);

  const added = await addApplicationContact({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    userId: input.userId,
    firstName,
    lastName,
    title: input.title,
    personaId,
    confirmRole: true,
  });
  await prisma.campaignContact.updateMany({
    where: { id: added.campaignContactId, personPrepOfferedAt: null },
    data: { personPrepOfferedAt: new Date(), personPrepStatus: "OFFERED" },
  });

  let stageId: string | null = null;
  if (interviewScheduleIsComplete({ scheduledAt, format })) {
    if (!isInterviewFormat(format)) {
      throw new TenantError("Interview format is invalid.");
    }
    const when = new Date(scheduledAt);
    const roleName =
      roles.find((role) => role.id === personaId)?.name ??
      (requested === CREATE_ROLE_FROM_TITLE ? input.title : "");
    const stage = await createInterviewStage({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      type: chosenInterviewStageType({
        requested: input.stageType,
        roleName,
        title: input.title,
      }),
      scheduledAt: when,
      format,
      interviewerContactIds: [added.contactId],
    });
    stageId = stage.id;
  }

  const queued = await queueInterviewPrepGuide({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    userId: input.userId,
    contactId: added.contactId,
    personaId,
  });
  return {
    contactId: added.contactId,
    sectionKey: `contact:${added.contactId}`,
    stageId,
    jobId: queued.jobId,
    displayName: interviewDisplayName({ name: input.name, title: input.title }),
  };
}

async function buildInterviewForExistingPerson(input: {
  organizationId: string;
  campaignId: string;
  userId: string;
  contactId: string;
  scheduledAt: string;
  format: string;
  stageType?: string | null;
}): Promise<NewInterviewResult> {
  const membership = await prisma.campaignContact.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contactId: input.contactId,
    },
    select: {
      id: true,
      chosenPersonaId: true,
      contact: { select: { firstName: true, lastName: true, title: true } },
      chosenPersona: { select: { name: true } },
    },
  });
  if (!membership) {
    throw new TenantError("That person was not found on this application.");
  }
  await prisma.campaignContact.updateMany({
    where: { id: membership.id, personPrepOfferedAt: null },
    data: { personPrepOfferedAt: new Date(), personPrepStatus: "OFFERED" },
  });

  const title = membership.contact.title?.trim() ?? "";
  const roleName = membership.chosenPersona?.name ?? "";
  let stageId: string | null = null;
  if (interviewScheduleIsComplete({ scheduledAt: input.scheduledAt, format: input.format })) {
    if (!isInterviewFormat(input.format)) {
      throw new TenantError("Interview format is invalid.");
    }
    const stage = await createInterviewStage({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      type: chosenInterviewStageType({
        requested: input.stageType,
        roleName,
        title,
      }),
      scheduledAt: new Date(input.scheduledAt),
      format: input.format,
      interviewerContactIds: [input.contactId],
    });
    stageId = stage.id;
  }

  const queued = await queueInterviewPrepGuide({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    userId: input.userId,
    contactId: input.contactId,
    personaId: membership.chosenPersonaId,
  });
  if (queued.needsPersonaChoice) {
    throw new TenantError(interviewConfig.labels.chooseRole);
  }
  const name = [membership.contact.firstName, membership.contact.lastName]
    .filter(Boolean)
    .join(" ");
  return {
    contactId: input.contactId,
    sectionKey: `contact:${input.contactId}`,
    stageId,
    jobId: queued.jobId,
    displayName: interviewDisplayName({ name, title }),
  };
}

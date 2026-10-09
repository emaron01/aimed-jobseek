import { addApplicationContact } from "@/lib/application/contacts";
import {
  CREATE_ROLE_FROM_TITLE,
  matchHiringTeamRoleFromTitle,
} from "@/lib/application/role-title-match";
import { addApplicationHiringTeamRole } from "@/lib/hiring-team/build";
import { queueInterviewPrepGuide } from "@/lib/interview/prep-guide";
import { createInterviewStage } from "@/lib/interview/stages";
import { prisma } from "@/lib/prisma-client";
import { interviewConfig, isInterviewFormat } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

export { CREATE_ROLE_FROM_TITLE };

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

const RECRUITER_OR_TALENT_ACQUISITION = /\b(?:recruiter|talent[- ]acquisition)\b/i;

/**
 * Recruiter and talent-acquisition roles use the recruiter screen.
 * Every other role uses the general interviewer type, OTHER.
 */
export function interviewStageTypeForRole(input: {
  roleName: string;
  title: string;
}): "RECRUITER_SCREEN" | "OTHER" {
  const haystack = `${input.roleName}\n${input.title}`;
  return RECRUITER_OR_TALENT_ACQUISITION.test(haystack)
    ? "RECRUITER_SCREEN"
    : "OTHER";
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
}): Promise<NewInterviewResult> {
  const title = input.title.trim();
  const name = input.name.trim();
  if (!title) throw new TenantError("Title is required.");
  const key = [
    input.organizationId,
    input.campaignId,
    input.userId,
    title.toLowerCase(),
    name.toLowerCase(),
    input.scheduledAt?.trim() ?? "",
    input.format?.trim() ?? "",
    input.personaId?.trim() ?? "",
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
}): Promise<NewInterviewResult> {
  const { firstName, lastName } = splitInterviewName(input.name);
  const scheduledAt = input.scheduledAt?.trim() ?? "";
  const format = input.format?.trim() ?? "";
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
      type: interviewStageTypeForRole({ roleName, title: input.title }),
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

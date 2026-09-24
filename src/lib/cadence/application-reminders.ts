import { cadenceUrgency, type CadenceUrgency } from "@/lib/cadence/engine";
import { prisma } from "@/lib/prisma";
import { interviewConfig, outreachConfig, vocab } from "@/lib/product-config";

export type ApplicationReminderKind =
  | "OUTREACH"
  | "INTERVIEW_THANK_YOU"
  | "INTERVIEW_CHECK_IN";

export type ApplicationReminderPolicy = {
  reminderDay3: number | null;
  reminderDay7: number | null;
  reminderEmail4Days: number | null;
  reminderRepeatDays: number | null;
  interviewThankYouHours: number;
  interviewCheckInBusinessDays: number;
};

export type ApplicationReminderRow = {
  campaignId: string;
  campaignName: string;
  kind: ApplicationReminderKind;
  appliedAt: Date | null;
  stageId?: string;
  stageLabel?: string;
  anchorAt: Date;
  day: number;
  dueAt: Date;
  urgency: CadenceUrgency;
  recordNotesFirst?: boolean;
};

const OUTREACH_TYPES = [
  "EMAIL",
  "LINKEDIN_CONNECTION_NOTE",
  "LINKEDIN_INMAIL",
] as const;

export function parseOptionalReminderDay(raw: unknown): number | null | typeof NaN {
  if (raw == null) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value)) return Number.NaN;
  if (value < 1) return Number.NaN;
  return value;
}

export function validateApplicationReminderInput(input: {
  reminderDay3: number | null;
  reminderDay7: number | null;
  reminderEmail4Days: number | null;
  reminderRepeatDays: number | null;
}): string | null {
  const fields: Array<[string, number | null]> = [
    ["Day 3", input.reminderDay3],
    ["Day 7", input.reminderDay7],
    ["Email 4", input.reminderEmail4Days],
    ["Repeat", input.reminderRepeatDays],
  ];
  for (const [label, value] of fields) {
    if (value == null) continue;
    if (!Number.isInteger(value) || value < 1) {
      return `${label} must be blank or a whole number of days of at least 1.`;
    }
  }
  return null;
}

export function reminderDaysFromPolicy(
  policy: ApplicationReminderPolicy,
): number[] {
  const days = [
    policy.reminderDay3,
    policy.reminderDay7,
    policy.reminderEmail4Days,
    policy.reminderRepeatDays,
  ].filter((day): day is number => day != null && day > 0);
  return [...new Set(days)].sort((a, b) => a - b);
}

export function applicationReminderAnchor(input: {
  appliedAt: Date | null;
  firstOutreachSentAt: Date | null;
}): Date | null {
  return input.appliedAt ?? input.firstOutreachSentAt;
}

export function reminderDueAt(anchor: Date, day: number): Date {
  const due = new Date(anchor);
  due.setUTCDate(due.getUTCDate() + day);
  return due;
}

export function isApplicationReminderDue(input: {
  anchor: Date;
  day: number;
  now?: Date;
}): boolean {
  return (input.now ?? new Date()) >= reminderDueAt(input.anchor, input.day);
}

export async function loadApplicationReminderPolicy(
  organizationId: string,
): Promise<ApplicationReminderPolicy> {
  const row = await prisma.organizationCadencePolicy.upsert({
    where: { organizationId },
    update: {},
    create: {
      organizationId,
      reminderDay3: outreachConfig.reminders.defaultDay3,
      reminderDay7: outreachConfig.reminders.defaultDay7,
      reminderEmail4Days: outreachConfig.reminders.defaultEmail4,
      reminderRepeatDays: outreachConfig.reminders.defaultRepeat,
      interviewThankYouHours: interviewConfig.reminders.defaultThankYouHours,
      interviewCheckInBusinessDays:
        interviewConfig.reminders.defaultCheckInBusinessDays,
    },
    select: {
      reminderDay3: true,
      reminderDay7: true,
      reminderEmail4Days: true,
      reminderRepeatDays: true,
      interviewThankYouHours: true,
      interviewCheckInBusinessDays: true,
    },
  });
  return {
    reminderDay3: row.reminderDay3,
    reminderDay7: row.reminderDay7,
    reminderEmail4Days: row.reminderEmail4Days,
    reminderRepeatDays: row.reminderRepeatDays,
    interviewThankYouHours:
      row.interviewThankYouHours ?? interviewConfig.reminders.defaultThankYouHours,
    interviewCheckInBusinessDays:
      row.interviewCheckInBusinessDays ??
      interviewConfig.reminders.defaultCheckInBusinessDays,
  };
}

export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start.getTime());
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return result;
}

export function thankYouDueAt(scheduledAt: Date, hours: number): Date {
  return new Date(scheduledAt.getTime() + hours * 60 * 60 * 1000);
}

export function checkInDueAt(input: {
  expectedDecisionAt: Date | null;
  scheduledAt: Date;
  businessDays: number;
}): Date {
  if (input.expectedDecisionAt) {
    const due = new Date(input.expectedDecisionAt.getTime());
    due.setUTCDate(due.getUTCDate() + 1);
    return due;
  }
  return addBusinessDays(input.scheduledAt, input.businessDays);
}

export async function getDueApplicationReminders(input: {
  organizationId: string;
  userId: string;
  includeArchived?: boolean;
  now?: Date;
}): Promise<ApplicationReminderRow[]> {
  const now = input.now ?? new Date();
  const policy = await loadApplicationReminderPolicy(input.organizationId);
  const days = reminderDaysFromPolicy(policy);
  if (days.length === 0) return [];

  const campaigns = await prisma.campaign.findMany({
    where: {
      organizationId: input.organizationId,
      ownerUserId: input.userId,
      ...(input.includeArchived ? {} : { archivedAt: null }),
    },
    select: {
      id: true,
      name: true,
      appliedAt: true,
      interviewStages: {
        select: {
          id: true,
          type: true,
          scheduledAt: true,
          expectedDecisionAt: true,
          notesAfter: true,
          outcome: true,
        },
      },
      applicationAssets: {
        where: {
          type: { in: [...OUTREACH_TYPES] },
          sentAt: { not: null },
        },
        select: { sentAt: true },
        orderBy: { sentAt: "asc" },
        take: 1,
      },
    },
  });

  const due: ApplicationReminderRow[] = [];
  for (const campaign of campaigns) {
    const firstSent = campaign.applicationAssets[0]?.sentAt ?? null;
    const anchor = applicationReminderAnchor({
      appliedAt: campaign.appliedAt,
      firstOutreachSentAt: firstSent,
    });
    if (!anchor) continue;
    for (const day of days) {
      const dueAt = reminderDueAt(anchor, day);
      if (now < dueAt) continue;
      due.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        kind: "OUTREACH",
        appliedAt: campaign.appliedAt,
        anchorAt: anchor,
        day,
        dueAt,
        urgency: cadenceUrgency(dueAt, now),
      });
    }
    for (const stage of campaign.interviewStages) {
      if (stage.outcome) continue;
      const thankYouDue = thankYouDueAt(
        stage.scheduledAt,
        policy.interviewThankYouHours,
      );
      if (now >= thankYouDue) {
        due.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          kind: "INTERVIEW_THANK_YOU",
          appliedAt: campaign.appliedAt,
          stageId: stage.id,
          stageLabel: stage.type,
          anchorAt: stage.scheduledAt,
          day: 0,
          dueAt: thankYouDue,
          urgency: cadenceUrgency(thankYouDue, now),
          recordNotesFirst: !stage.notesAfter?.trim(),
        });
      }
      const checkInDue = checkInDueAt({
        expectedDecisionAt: stage.expectedDecisionAt,
        scheduledAt: stage.scheduledAt,
        businessDays: policy.interviewCheckInBusinessDays,
      });
      if (now >= checkInDue) {
        due.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          kind: "INTERVIEW_CHECK_IN",
          appliedAt: campaign.appliedAt,
          stageId: stage.id,
          stageLabel: stage.type,
          anchorAt: stage.expectedDecisionAt ?? stage.scheduledAt,
          day: 0,
          dueAt: checkInDue,
          urgency: cadenceUrgency(checkInDue, now),
        });
      }
    }
  }
  return due.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export async function countDueApplicationReminders(input: {
  organizationId: string;
  userId: string;
  now?: Date;
}): Promise<number> {
  const rows = await getDueApplicationReminders(input);
  return rows.length;
}

export function applicationReminderLabel(row: ApplicationReminderRow): string {
  if (row.kind === "INTERVIEW_THANK_YOU") {
    return `${interviewConfig.reminders.thankYouKind} for ${vocab.campaign.singular} "${row.campaignName}"`;
  }
  if (row.kind === "INTERVIEW_CHECK_IN") {
    return `${interviewConfig.reminders.checkInKind} for ${vocab.campaign.singular} "${row.campaignName}"`;
  }
  return `Day ${row.day} reminder for ${vocab.campaign.singular} "${row.campaignName}"`;
}

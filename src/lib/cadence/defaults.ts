import "server-only";

import type { OrganizationCadencePolicy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { interviewConfig } from "@/lib/product-config";

export const DEFAULT_CADENCE_POLICY = {
  day2IntervalDays: 9,
  day3IntervalDays: 6,
  day4IntervalDays: 15,
  repeatIntervalDays: 30,
  maxSequenceEmails: 4,
  reminderDay3: 3,
  reminderDay7: 7,
  reminderEmail4Days: null,
  reminderRepeatDays: null,
  interviewThankYouHours: interviewConfig.reminders.defaultThankYouHours,
  interviewCheckInBusinessDays: interviewConfig.reminders.defaultCheckInBusinessDays,
} as const;

export type CadencePolicyValues = Pick<
  OrganizationCadencePolicy,
  | "day2IntervalDays"
  | "day3IntervalDays"
  | "day4IntervalDays"
  | "repeatIntervalDays"
  | "maxSequenceEmails"
>;

export async function ensureOrganizationCadencePolicy(
  organizationId: string,
): Promise<CadencePolicyValues> {
  const row = await prisma.organizationCadencePolicy.upsert({
    where: { organizationId },
    update: {},
    create: {
      organizationId,
      ...DEFAULT_CADENCE_POLICY,
    },
    select: {
      day2IntervalDays: true,
      day3IntervalDays: true,
      day4IntervalDays: true,
      repeatIntervalDays: true,
      maxSequenceEmails: true,
      reminderDay3: true,
      reminderDay7: true,
      reminderEmail4Days: true,
      reminderRepeatDays: true,
    },
  });
  return row;
}

import "server-only";

import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/transactional-email/send-service";
import { ensureTransactionalTemplatesSeeded } from "@/lib/transactional-email/seed";
import { countDueApplicationReminders } from "@/lib/cadence/application-reminders";
import { countDueContactsForUser } from "@/lib/cadence/dashboard";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type DigestSkipReason =
  | "no_organization"
  | "weekend"
  | "invalid_send_time"
  | "outside_send_window"
  | "already_sent_today"
  | "no_due_contacts";

function parseLocalTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

/** Period key (YYYY-MM-DD) for a Date in an IANA timezone. */
export function periodKeyInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function weekdayInTimezone(date: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekday,
  );
  return index >= 0 ? index : date.getDay();
}

function localTimeParts(date: Date, timezone: string): {
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  return { hour, minute: minute % 60 };
}

export function resolveUserTimezone(input: {
  userTimezone: string | null;
  organizationTimezone: string;
}): string {
  return input.userTimezone?.trim() || input.organizationTimezone || "UTC";
}

/**
 * Weekday-only, 15-minute local window starting at digestSendTimeLocal (HH:mm).
 * Default on User is "08:00" — not OrganizationCadencePolicy.
 */
export function explainDigestSendWindow(input: {
  now: Date;
  timezone: string;
  digestSendTimeLocal: string;
}): { ok: true } | { ok: false; reason: DigestSkipReason; detail: string } {
  const weekday = weekdayInTimezone(input.now, input.timezone);
  if (weekday === 0 || weekday === 6) {
    return {
      ok: false,
      reason: "weekend",
      detail: `local weekday=${WEEKDAY_NAMES[weekday]} in ${input.timezone}`,
    };
  }

  const target = parseLocalTime(input.digestSendTimeLocal);
  if (!target) {
    return {
      ok: false,
      reason: "invalid_send_time",
      detail: `digestSendTimeLocal=${JSON.stringify(input.digestSendTimeLocal)}`,
    };
  }

  const local = localTimeParts(input.now, input.timezone);
  const localLabel = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  const windowEndMinute = target.minute + 15;
  if (local.hour !== target.hour) {
    return {
      ok: false,
      reason: "outside_send_window",
      detail: `local=${localLabel} ${input.timezone}; window=${input.digestSendTimeLocal}–${String(target.hour).padStart(2, "0")}:${String(Math.min(windowEndMinute, 59)).padStart(2, "0")} (15m)`,
    };
  }
  if (local.minute < target.minute || local.minute >= windowEndMinute) {
    return {
      ok: false,
      reason: "outside_send_window",
      detail: `local=${localLabel} ${input.timezone}; window=${input.digestSendTimeLocal}–${String(target.hour).padStart(2, "0")}:${String(Math.min(windowEndMinute, 59)).padStart(2, "0")} (15m)`,
    };
  }
  return { ok: true };
}

export function shouldSendDigestNow(input: {
  now: Date;
  timezone: string;
  digestSendTimeLocal: string;
}): boolean {
  return explainDigestSendWindow(input).ok;
}

export type DigestRunResult = {
  scanned: number;
  sent: number;
  skipped: number;
  errors: number;
  /** Counts by skip reason — empty when nothing was skipped. */
  skipReasons: Partial<Record<DigestSkipReason, number>>;
  forced: boolean;
};

export type RunCadenceDigestOptions = {
  now?: Date;
  /**
   * Bypass the weekday/time window and already-sent-today check so ops can
   * test a real send. Still requires digestEnabled, an active org, and dueCount>0.
   * Auth: only via CRON_SECRET on the job route.
   */
  force?: boolean;
};

function bumpSkip(
  result: DigestRunResult,
  reason: DigestSkipReason,
  meta: Record<string, unknown>,
): void {
  result.skipped += 1;
  result.skipReasons[reason] = (result.skipReasons[reason] ?? 0) + 1;
  console.info("[cadence-digest] skipped", { reason, ...meta });
}

/**
 * Send weekday-morning cadence digests for eligible users.
 * Idempotent per user per local calendar day (unless force). Never sends when dueCount=0.
 */
export async function runCadenceDigestJob(
  options: RunCadenceDigestOptions = {},
): Promise<DigestRunResult> {
  const now = options.now ?? new Date();
  const force = options.force === true;
  await ensureTransactionalTemplatesSeeded();

  const users = await prisma.user.findMany({
    where: {
      digestEnabled: true,
      activeOrganizationId: { not: null },
      memberships: { some: {} },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      name: true,
      timezone: true,
      digestSendTimeLocal: true,
      activeOrganizationId: true,
      activeOrganization: { select: { id: true, name: true, timezone: true } },
    },
  });

  const result: DigestRunResult = {
    scanned: users.length,
    sent: 0,
    skipped: 0,
    errors: 0,
    skipReasons: {},
    forced: force,
  };

  for (const user of users) {
    const organization = user.activeOrganization;
    if (!organization) {
      bumpSkip(result, "no_organization", { userId: user.id });
      continue;
    }

    const timezone = resolveUserTimezone({
      userTimezone: user.timezone,
      organizationTimezone: organization.timezone,
    });

    if (!force) {
      const window = explainDigestSendWindow({
        now,
        timezone,
        digestSendTimeLocal: user.digestSendTimeLocal,
      });
      if (!window.ok) {
        bumpSkip(result, window.reason, {
          userId: user.id,
          email: user.email,
          detail: window.detail,
        });
        continue;
      }
    }

    const periodKey = periodKeyInTimezone(now, timezone);
    if (!force) {
      const existing = await prisma.dailyDigestSend.findUnique({
        where: { userId_periodKey: { userId: user.id, periodKey } },
      });
      if (existing) {
        bumpSkip(result, "already_sent_today", {
          userId: user.id,
          email: user.email,
          periodKey,
        });
        continue;
      }
    }

    const [contactDueCount, applicationDueCount] = await Promise.all([
      countDueContactsForUser({
        organizationId: organization.id,
        userId: user.id,
      }),
      countDueApplicationReminders({
        organizationId: organization.id,
        userId: user.id,
      }),
    ]);
    const dueCount = contactDueCount + applicationDueCount;
    if (dueCount === 0) {
      bumpSkip(result, "no_due_contacts", {
        userId: user.id,
        email: user.email,
        organizationId: organization.id,
      });
      continue;
    }

    const weekdayLabel = WEEKDAY_NAMES[weekdayInTimezone(now, timezone)] ?? "Today";
    const firstName =
      user.firstName?.trim() ||
      user.name?.split(/\s+/)[0]?.trim() ||
      "there";

    try {
      await sendTransactionalEmail({
        templateKey: "CADENCE_DAILY_DIGEST",
        to: user.email,
        userId: user.id,
        organizationId: organization.id,
        idempotencyKey: force
          ? `cadence-digest:${user.id}:${periodKey}:force:${now.toISOString()}`
          : `cadence-digest:${user.id}:${periodKey}`,
        variables: {
          firstName,
          workspaceName: organization.name,
          dueCount: String(dueCount),
          dueCountPlural: dueCount === 1 ? "" : "s",
          weekdayLabel,
          dashboardUrl: `${process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/`,
        },
      });
      if (!force) {
        await prisma.dailyDigestSend.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            periodKey,
            dueCount,
          },
        });
      } else {
        // Record ledger only if missing so a forced test does not block tomorrow's cron.
        await prisma.dailyDigestSend.upsert({
          where: { userId_periodKey: { userId: user.id, periodKey } },
          create: {
            organizationId: organization.id,
            userId: user.id,
            periodKey,
            dueCount,
          },
          update: {},
        });
      }
      result.sent += 1;
      console.info("[cadence-digest] sent", {
        userId: user.id,
        email: user.email,
        dueCount,
        periodKey,
        force,
      });
    } catch (error) {
      console.error("[cadence-digest] send failed", { userId: user.id, error });
      result.errors += 1;
    }
  }

  if (result.skipped > 0) {
    console.info("[cadence-digest] run summary", {
      scanned: result.scanned,
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
      skipReasons: result.skipReasons,
      forced: result.forced,
    });
  }

  return result;
}

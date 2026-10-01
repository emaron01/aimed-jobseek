import Link from "next/link";
import {
  dueReminderLine,
  groupDueApplicationReminders,
  type ApplicationReminderRow,
} from "@/lib/cadence/application-reminders";
import { outreachConfig, vocab } from "@/lib/product-config";

export function ApplicationRemindersPanel({
  reminders,
  timezone,
  now = new Date(),
}: {
  reminders: ApplicationReminderRow[];
  timezone: string;
  now?: Date;
}) {
  const groups = groupDueApplicationReminders({ reminders, now, timezone });
  if (groups.length === 0) return null;
  return (
    <section className="mb-8 space-y-3" data-testid="application-reminders">
      <div>
        <h2 className="text-xl font-semibold text-ink">
          {outreachConfig.labels.remindersTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {outreachConfig.labels.remindersHelp}
        </p>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-edge bg-surface">
        {groups.map((group) => (
          <li
            key={group.campaignId}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            data-testid={`application-reminder-${group.campaignId}`}
          >
            <div>
              <Link
                href={`/campaigns/${group.campaignId}`}
                className="font-medium text-ink hover:underline"
              >
                {group.campaignName}
              </Link>
              <p className="text-sm text-muted">{dueReminderLine(group.count)}</p>
            </div>
            <Link
              href={`/campaigns/${group.campaignId}`}
              className="text-sm font-medium text-ink underline"
            >
              Open {vocab.campaign.singular}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

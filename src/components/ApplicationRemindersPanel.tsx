import Link from "next/link";
import type { ApplicationReminderRow } from "@/lib/cadence/application-reminders";
import { applicationReminderLabel } from "@/lib/cadence/application-reminders";
import { interviewConfig, outreachConfig, vocab } from "@/lib/product-config";

export function ApplicationRemindersPanel({
  reminders,
}: {
  reminders: ApplicationReminderRow[];
}) {
  if (reminders.length === 0) return null;
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
        {reminders.map((row) => (
          <li
            key={`${row.kind}:${row.campaignId}:${row.stageId ?? row.day}`}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          >
            <div>
              <Link
                href={`/campaigns/${row.campaignId}`}
                className="font-medium text-ink hover:underline"
              >
                {row.campaignName}
              </Link>
              <p className="text-sm text-muted">
                {applicationReminderLabel(row)}
                {row.kind === "OUTREACH"
                  ? ` · Day ${row.day} from ${row.appliedAt ? interviewConfig.progress.APPLIED : "first sent message"}`
                  : ""}
                {row.recordNotesFirst
                  ? ` · ${interviewConfig.reminders.recordNotesPrompt}`
                  : ""}{" "}
                · due {row.dueAt.toLocaleDateString()}
              </p>
            </div>
            <Link
              href={`/campaigns/${row.campaignId}`}
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

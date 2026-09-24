import Link from "next/link";
import type { ApplicationReminderRow } from "@/lib/cadence/application-reminders";
import { outreachConfig, vocab } from "@/lib/product-config";

export function ApplicationRemindersPanel({
  reminders,
}: {
  reminders: ApplicationReminderRow[];
}) {
  if (reminders.length === 0) return null;
  return (
    <section className="mb-8 space-y-3" data-testid="application-reminders">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          {outreachConfig.labels.remindersTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {outreachConfig.labels.remindersHelp}
        </p>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {reminders.map((row) => (
          <li
            key={`${row.campaignId}:${row.day}`}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          >
            <div>
              <Link
                href={`/campaigns/${row.campaignId}`}
                className="font-medium text-slate-900 hover:underline"
              >
                {row.campaignName}
              </Link>
              <p className="text-sm text-slate-600">
                Day {row.day} from {row.appliedAt ? "Applied" : "first sent message"}{" "}
                · due {row.dueAt.toLocaleDateString()}
              </p>
            </div>
            <Link
              href={`/campaigns/${row.campaignId}`}
              className="text-sm font-medium text-slate-700 underline"
            >
              Open {vocab.campaign.singular}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

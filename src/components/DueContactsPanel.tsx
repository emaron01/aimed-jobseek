"use client";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useTransition } from "react";
import type { CampaignDueSummary } from "@/lib/cadence/dashboard";
import { bulkGenerateDueForCampaignAction } from "@/app/actions/cadence";
import { generateEmailDraftAction, addFollowUpEmailAction } from "@/app/actions/email";
import { countedNoun, vocab } from "@/lib/product-config";

const URGENCY_STYLES = {
  overdue: "bg-rose-100 text-rose-900",
  today: "bg-amber-100 text-amber-900",
  this_week: "bg-sky-100 text-sky-900",
  later: "bg-slate-100 text-slate-700",
} as const;

function urgencyLabel(urgency: keyof typeof URGENCY_STYLES): string {
  switch (urgency) {
    case "overdue":
      return "Overdue";
    case "today":
      return "Due today";
    case "this_week":
      return "This week";
    default:
      return "Later";
  }
}

export function DueContactsPanel({
  dueByCampaign,
}: {
  dueByCampaign: CampaignDueSummary[];
}) {
  const [pending, startTransition] = useTransition();
  const totalDue = dueByCampaign.reduce(
    (sum, campaign) => sum + campaign.dueContacts.length,
    0,
  );

  if (totalDue === 0) return null;

  return (
    <section className="mb-8 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Follow-ups due
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {countedNoun(totalDue, vocab.contact)} ready for the next
            email. Generate drafts manually — nothing sends automatically.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {dueByCampaign.map((campaign) => (
          <article
            key={campaign.campaignId}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link
                  href={`/campaigns/${campaign.campaignId}`}
                  className="font-semibold text-slate-900 hover:underline"
                >
                  {campaign.campaignName}
                </Link>
                <p className="mt-1 text-sm text-slate-600">
                  {campaign.overdue > 0 ? (
                    <span className="font-medium text-rose-700">
                      {campaign.overdue} overdue
                    </span>
                  ) : null}
                  {campaign.overdue > 0 && campaign.today > 0 ? " · " : null}
                  {campaign.today > 0 ? (
                    <span>{campaign.today} due today</span>
                  ) : null}
                  {(campaign.overdue > 0 || campaign.today > 0) &&
                  campaign.thisWeek > 0
                    ? " · "
                    : null}
                  {campaign.thisWeek > 0 ? (
                    <span>{campaign.thisWeek} this week</span>
                  ) : null}
                </p>
              </div>
              <AppButton
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await bulkGenerateDueForCampaignAction(campaign.campaignId);
                  })
                }
                className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
              >
                Generate all due
              </AppButton>
            </div>

            <ul className="mt-4 divide-y divide-slate-100">
              {campaign.dueContacts.map((contact) => (
                <li
                  key={contact.campaignContactId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {contact.contactName}
                      {contact.company ? (
                        <span className="font-normal text-slate-500">
                          {" "}
                          · {contact.company}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      Email {contact.nextSequenceNumber} · due{" "}
                      {contact.nextDueAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${URGENCY_STYLES[contact.urgency]}`}
                    >
                      {urgencyLabel(contact.urgency)}
                    </span>
                    {contact.hasDraft ? (
                      <Link
                        href={`/campaigns/${campaign.campaignId}?stage=emails&contact=${contact.campaignContactId}`}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Review draft
                      </Link>
                    ) : (
                      <AppButton
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            if (contact.sentCount === 0) {
                              await generateEmailDraftAction(
                                contact.campaignContactId,
                              );
                            } else {
                              await addFollowUpEmailAction(
                                contact.campaignContactId,
                              );
                            }
                          })
                        }
                        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-60"
                      >
                        Generate
                      </AppButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

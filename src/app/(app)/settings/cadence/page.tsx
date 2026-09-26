import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ActionFeedbackForm } from "@/components/ActionFeedbackForm";
import {
  loadCadencePolicyForSettings,
  updateApplicationReminderPolicyAction,
} from "@/app/actions/cadence";
import { requireOrgAdmin } from "@/lib/org/authz";
import { interviewConfig, outreachConfig, vocab } from "@/lib/product-config";

export default async function CadenceSettingsPage() {
  const { organization } = await requireOrgAdmin();
  const { reminders } = await loadCadencePolicyForSettings(organization.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href="/settings/organization"
          className="text-sm text-muted hover:text-ink"
        >
          ← Organization
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          {outreachConfig.labels.remindersTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {outreachConfig.labels.remindersHelp} Days are counted from the Applied
          date, or from the first outreach message marked sent when Applied is
          not marked.
        </p>
      </div>

      <section className="space-y-3">
        <ActionFeedbackForm
          action={updateApplicationReminderPolicyAction}
          className="grid gap-3 sm:grid-cols-2"
          testId="application-reminder-policy-form"
        >
          <label className="text-sm sm:col-span-2">
            Day 3
            <input
              name="reminderDay3"
              type="number"
              min={1}
              defaultValue={reminders.reminderDay3 ?? ""}
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Day 7
            <input
              name="reminderDay7"
              type="number"
              min={1}
              defaultValue={reminders.reminderDay7 ?? ""}
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Email 4 (optional)
            <input
              name="reminderEmail4Days"
              type="number"
              min={1}
              defaultValue={reminders.reminderEmail4Days ?? ""}
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
            />
            <span className="mt-1 block text-xs text-subtle">
              Blank means no reminder.
            </span>
          </label>
          <label className="text-sm sm:col-span-2">
            {interviewConfig.reminders.thankYouKind} hours
            <input
              name="interviewThankYouHours"
              type="number"
              min={1}
              defaultValue={reminders.interviewThankYouHours}
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            {interviewConfig.reminders.checkInKind} business days
            <input
              name="interviewCheckInBusinessDays"
              type="number"
              min={1}
              defaultValue={reminders.interviewCheckInBusinessDays}
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Repeat (optional)
            <input
              name="reminderRepeatDays"
              type="number"
              min={1}
              defaultValue={reminders.reminderRepeatDays ?? ""}
              className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2"
            />
            <span className="mt-1 block text-xs text-subtle">
              Blank means no repeating reminder.
            </span>
          </label>
          <AppButton
            type="submit"
            className={cn(PRIMARY_BUTTON_CLASS, "sm:col-span-2", "w-fit", "!px-3")}
          >
            Save reminder settings
          </AppButton>
        </ActionFeedbackForm>
      </section>
      <p className="text-sm text-subtle">
        These alerts appear on Home and in the digest. They never send a message
        or change {vocab.contact.singular} sequence dates.
      </p>
    </div>
  );
}
